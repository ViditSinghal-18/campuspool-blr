'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Navbar } from '../components/Navbar';
import { TelemetryBento } from '../components/TelemetryBento';
import { RideRequestPanel } from '../components/RideRequestPanel';
import { PoolCardList } from '../components/PoolCardList';
import {
  LatLng,
  MatchCluster,
  PickModeTarget,
  RideRequest,
  SnapInfo,
  TransitNode,
} from '../lib/types';
import {
  fetchGraph,
  seedSimulation,
  snapAndRequestRide,
  toggleTrafficMode,
  checkBackendHealth,
} from '../lib/api';
import { NODES } from '../lib/fallbackEngine';
import { Users, PlusCircle, Zap } from 'lucide-react';

// Dynamically import MapCanvas with SSR disabled
const MapCanvas = dynamic(() => import('../components/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950 text-slate-400 space-y-3">
      <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
      <p className="text-xs font-mono tracking-wider">Loading Bengaluru Dark Matter Map...</p>
    </div>
  ),
});

// Neon corridor overlay color palette
const CLUSTER_COLORS = [
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#3b82f6', // Blue
  '#ec4899', // Pink
];

export default function DashboardPage() {
  // Prevent any hydration mismatch
  const [mounted, setMounted] = useState(false);

  // Tab State: 'pools' | 'request'
  const [activeTab, setActiveTab] = useState<'pools' | 'request'>('pools');

  // Graph & System State
  const [nodes, setNodes] = useState<TransitNode[]>(Object.values(NODES));
  const [peakMode, setPeakMode] = useState<boolean>(false);
  const [isBackendLive, setIsBackendLive] = useState<boolean>(false);
  const [isTogglingPeak, setIsTogglingPeak] = useState<boolean>(false);

  // Simulation State
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [clusters, setClusters] = useState<MatchCluster[]>([]);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const [totalFareSavedRs, setTotalFareSavedRs] = useState<number>(0);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isSubmittingRide, setIsSubmittingRide] = useState<boolean>(false);

  // Interactive Map & Snapping State
  const [selectedCluster, setSelectedCluster] = useState<MatchCluster | null>(null);
  const [pickTarget, setPickTarget] = useState<PickModeTarget>(null);
  const [pickedPickup, setPickedPickup] = useState<LatLng | null>({
    lat: 12.9237,
    lng: 77.4987,
  }); // Default RVCE
  const [pickedDropoff, setPickedDropoff] = useState<LatLng | null>({
    lat: 12.9784,
    lng: 77.6408,
  }); // Default Indiranagar
  const [lastSnapInfo, setLastSnapInfo] = useState<SnapInfo | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Initial Load: check backend health, fetch graph, seed initial simulation
  useEffect(() => {
    let isMounted = true;

    async function initDashboard() {
      const isLive = await checkBackendHealth();
      if (!isMounted) return;
      setIsBackendLive(isLive);

      // Fetch graph nodes
      const graphRes = await fetchGraph();
      if (!isMounted) return;
      if (graphRes.data.nodes?.length > 0) {
        setNodes(graphRes.data.nodes);
        setPeakMode(graphRes.data.peakMode);
      }

      // Initial seed
      setIsSeeding(true);
      try {
        const simRes = await seedSimulation(graphRes.data.peakMode);
        if (!isMounted) return;
        setRequests(simRes.data.requests);
        setClusters(simRes.data.clusters);
        setLatencyMs(simRes.data.executionTimeMs);
        setTotalFareSavedRs(simRes.data.totalFareSavedRs);
        setIsBackendLive(simRes.isLive);
      } catch (e) {
        console.error('Initial seed failed:', e);
      } finally {
        if (isMounted) setIsSeeding(false);
      }
    }

    initDashboard();

    // Periodic health check every 15s
    const timer = setInterval(async () => {
      const live = await checkBackendHealth();
      if (isMounted) setIsBackendLive(live);
    }, 15000);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Toggle Peak Traffic Mode
  const handleTogglePeakMode = useCallback(async () => {
    setIsTogglingPeak(true);
    const nextPeak = !peakMode;
    try {
      const res = await toggleTrafficMode(nextPeak);
      setPeakMode(res.peakMode);
      setIsBackendLive(res.isLive);

      // Re-run matching with new congestion weights
      const simRes = await seedSimulation(res.peakMode);
      setRequests(simRes.data.requests);
      setClusters(simRes.data.clusters);
      setLatencyMs(simRes.data.executionTimeMs);
      setTotalFareSavedRs(simRes.data.totalFareSavedRs);
    } catch (err) {
      console.error('Failed to toggle peak mode:', err);
    } finally {
      setIsTogglingPeak(false);
    }
  }, [peakMode]);

  // Seed 15 mock commuters CTA
  const handleSeedSimulation = useCallback(async () => {
    setIsSeeding(true);
    try {
      const res = await seedSimulation(peakMode);
      setRequests(res.data.requests);
      setClusters(res.data.clusters);
      setLatencyMs(res.data.executionTimeMs);
      setTotalFareSavedRs(res.data.totalFareSavedRs);
      setIsBackendLive(res.isLive);
      setSelectedCluster(null);
      // Stay on or switch to Tab 1 to see the 15 mock commuters
      setActiveTab('pools');
    } catch (err) {
      console.error('Seed simulation failed:', err);
    } finally {
      setIsSeeding(false);
    }
  }, [peakMode]);

  // Submit custom ride request with Haversine GPS snapping
  const handleRequestRide = useCallback(
    async (params: {
      studentName: string;
      sourceLat: number;
      sourceLng: number;
      destLat: number;
      destLng: number;
      departureTime: string;
    }) => {
      setIsSubmittingRide(true);
      try {
        const res = await snapAndRequestRide({
          ...params,
          peakMode,
        });
        setRequests(res.data.requests);
        setClusters(res.data.clusters);
        setLatencyMs(res.data.executionTimeMs);
        setTotalFareSavedRs(res.data.totalFareSavedRs);
        setLastSnapInfo(res.data.snap);
        setIsBackendLive(res.isLive);

        // Find which cluster contains this user and select it
        const matchedCl = res.data.clusters.find((c) =>
          c.riders.some((r) => r.studentName === params.studentName)
        );
        if (matchedCl) {
          setSelectedCluster(matchedCl);
        }

        // Submitting a ride automatically switches back to Tab 1 to show the updated pools
        setActiveTab('pools');
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : 'Failed to snap and request ride');
      } finally {
        setIsSubmittingRide(false);
        setPickTarget(null);
      }
    },
    [peakMode]
  );

  // Map click handlers for GPS pick modes
  const handleMapClickPickup = useCallback((latlng: LatLng) => {
    setPickedPickup(latlng);
    setPickTarget(null);
    setActiveTab('request');
  }, []);

  const handleMapClickDropoff = useCallback((latlng: LatLng) => {
    setPickedDropoff(latlng);
    setPickTarget(null);
    setActiveTab('request');
  }, []);

  const activePoolCount = clusters.length;

  if (!mounted) {
    return (
      <div
        className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none"
        suppressHydrationWarning
      >
        <div className="h-16 w-full border-b border-slate-800 bg-slate-950 px-6 flex items-center justify-between" suppressHydrationWarning />
        <div className="flex-1 flex flex-col items-center justify-center space-y-3" suppressHydrationWarning>
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" suppressHydrationWarning />
          <p className="text-xs font-mono text-slate-400" suppressHydrationWarning>Loading CampusPool BLR Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none"
      suppressHydrationWarning
    >
      {/* 1. Top Navigation Bar */}
      <Navbar
        peakMode={peakMode}
        onTogglePeakMode={handleTogglePeakMode}
        isBackendLive={isBackendLive}
        isTogglingPeak={isTogglingPeak}
        activePoolCount={activePoolCount}
      />

      {/* 2. Main Split-Screen Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-4rem)] w-full overflow-hidden">
        {/* Left Command Sidebar (38% width, scrollable) */}
        <aside className="w-full lg:w-[38%] xl:w-[38%] h-full flex flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-md overflow-hidden z-20">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3.5">
            {/* Live Telemetry Bento Grid (4 compact cards) */}
            <TelemetryBento
              nodeCount={nodes.length}
              latencyMs={latencyMs}
              activePools={activePoolCount}
              totalSavedRs={totalFareSavedRs}
              peakMode={peakMode}
            />

            {/* Primary Hero Button: Populate 15 Mock Commuters */}
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-40 group-hover:opacity-80 transition duration-300"></div>
              <button
                type="button"
                onClick={handleSeedSimulation}
                disabled={isSeeding}
                className="relative w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-xl shadow-emerald-900/40 flex items-center justify-center space-x-2.5 transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-wait"
              >
                <Zap className={`w-4 h-4 fill-slate-950 ${isSeeding ? 'animate-bounce' : ''}`} />
                <span>
                  {isSeeding ? 'Populating Commuter Graph...' : 'Populate 15 Mock Commuters (4:00 PM Peak)'}
                </span>
              </button>
            </div>

            {/* Sidebar Tabs: Tab 1 = Active Pools (Live) | Tab 2 = + Request / Snap Ride */}
            <div className="flex items-center p-1 rounded-xl bg-slate-900/90 border border-slate-800 shadow-inner">
              <button
                type="button"
                onClick={() => setActiveTab('pools')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  activeTab === 'pools'
                    ? 'bg-slate-800 text-emerald-400 shadow-md border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Active Pools (Live)</span>
                <span
                  className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    activeTab === 'pools'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-bold'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {clusters.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('request')}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
                  activeTab === 'request'
                    ? 'bg-slate-800 text-cyan-400 shadow-md border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Request / Snap Ride</span>
              </button>
            </div>

            {/* Tab 1 Content: Matched Pool Cards List */}
            {activeTab === 'pools' && (
              <div className="animate-fadeIn">
                <PoolCardList
                  clusters={clusters}
                  selectedClusterId={selectedCluster?.clusterId ?? null}
                  onSelectCluster={(c) =>
                    setSelectedCluster(
                      selectedCluster?.clusterId === c.clusterId ? null : c
                    )
                  }
                  clusterColors={CLUSTER_COLORS}
                />
              </div>
            )}

            {/* Tab 2 Content: Click-to-Snap GPS Ride Request Panel */}
            {activeTab === 'request' && (
              <div className="animate-fadeIn">
                <RideRequestPanel
                  onRequestRide={handleRequestRide}
                  isSubmittingRide={isSubmittingRide}
                  pickTarget={pickTarget}
                  setPickTarget={setPickTarget}
                  pickedPickup={pickedPickup}
                  pickedDropoff={pickedDropoff}
                  lastSnapInfo={lastSnapInfo}
                  nodesList={nodes}
                />
              </div>
            )}
          </div>
        </aside>

        {/* Right Interactive Map Canvas (62% width, full height) */}
        <main className="w-full lg:w-[62%] xl:w-[62%] h-full relative overflow-hidden bg-slate-950">
          <MapCanvas
            nodes={nodes}
            clusters={clusters}
            selectedCluster={selectedCluster}
            peakMode={peakMode}
            pickTarget={pickTarget}
            onMapClickPickup={handleMapClickPickup}
            onMapClickDropoff={handleMapClickDropoff}
            pickedPickup={pickedPickup}
            pickedDropoff={pickedDropoff}
            clusterColors={CLUSTER_COLORS}
          />
        </main>
      </div>
    </div>
  );
}
