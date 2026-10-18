'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  WeatherTelemetry,
} from '../lib/types';
import {
  fetchGraph,
  seedSimulation,
  snapAndRequestRide,
  toggleTrafficMode,
  checkBackendHealth,
  fetchWeatherTelemetry,
  resetSimulation,
} from '../lib/api';
import { NODES, buildSeededRequests, matchRides } from '../lib/fallbackEngine';
import { Users, PlusCircle, Zap, RotateCcw, Radio, X } from 'lucide-react';

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

  // Live Bengaluru Weather Telemetry
  const [weather, setWeather] = useState<WeatherTelemetry | null>(null);

  // Live Stream Mode State (SSE)
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [streamStep, setStreamStep] = useState<number>(0);
  const [streamTotal, setStreamTotal] = useState<number>(15);
  const [liveToast, setLiveToast] = useState<{ id: string; message: string; subtext?: string } | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
  const runningFallbackReqsRef = useRef<RideRequest[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-dismiss live toast after 4.5 seconds
  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => {
      setLiveToast(null);
    }, 4500);
    return () => clearTimeout(timer);
  }, [liveToast]);

  // Cleanup SSE & timers on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
      }
    };
  }, []);

  // Initial Load: check backend health, fetch graph, seed initial simulation, fetch weather
  useEffect(() => {
    let isMounted = true;

    async function initDashboard() {
      const isLive = await checkBackendHealth();
      if (!isMounted) return;
      setIsBackendLive(isLive);

      // Fetch live weather telemetry
      try {
        const wRes = await fetchWeatherTelemetry();
        if (isMounted) setWeather(wRes.data);
      } catch (e) {
        console.warn('Weather fetch failed:', e);
      }

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

    // Periodic weather update every 45s
    const weatherTimer = setInterval(async () => {
      try {
        const wRes = await fetchWeatherTelemetry();
        if (isMounted) setWeather(wRes.data);
      } catch (e) {
        console.warn('Periodic weather update failed:', e);
      }
    }, 45000);

    return () => {
      isMounted = false;
      clearInterval(timer);
      clearInterval(weatherTimer);
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
    // Stop stream if active
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    setIsStreaming(false);

    setIsSeeding(true);
    try {
      const res = await seedSimulation(peakMode);
      setRequests(res.data.requests);
      setClusters(res.data.clusters);
      setLatencyMs(res.data.executionTimeMs);
      setTotalFareSavedRs(res.data.totalFareSavedRs);
      setIsBackendLive(res.isLive);
      setSelectedCluster(null);
      setActiveTab('pools');
      setLiveToast({
        id: String(Date.now()),
        message: 'Populated 15 Mock Commuters',
        subtext: 'Evening 4:00 PM Peak corridor pool matching completed.',
      });
    } catch (err) {
      console.error('Seed simulation failed:', err);
    } finally {
      setIsSeeding(false);
    }
  }, [peakMode]);

  // Toggle Real-Time SSE Commuter Stream Mode
  const handleToggleStream = useCallback(async () => {
    if (isStreaming) {
      // Stop ongoing stream
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (fallbackTimerRef.current) {
        clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setIsStreaming(false);
      setLiveToast({
        id: String(Date.now()),
        message: 'Live Stream Paused',
        subtext: `Stream paused at commuter ${streamStep}/${streamTotal}.`,
      });
      return;
    }

    // Start streaming
    setIsStreaming(true);
    setStreamStep(0);
    setActiveTab('pools');
    setSelectedCluster(null);

    // Reset current board
    try {
      await resetSimulation();
    } catch (e) {
      console.warn('Reset error before stream:', e);
    }
    setRequests([]);
    setClusters([]);
    setTotalFareSavedRs(0);

    setLiveToast({
      id: String(Date.now()),
      message: '🔴 Live Stream Connected',
      subtext: 'Incoming commuters arriving every 2.5s with real-time graph re-clustering...',
    });

    if (isBackendLive) {
      const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const es = new EventSource(`${API_BASE}/api/simulation/stream`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requests) setRequests(data.requests);
          if (data.clusters) setClusters(data.clusters);
          if (typeof data.executionTimeMs === 'number') setLatencyMs(data.executionTimeMs);
          if (typeof data.totalFareSavedRs === 'number') setTotalFareSavedRs(data.totalFareSavedRs);
          if (data.step) setStreamStep(data.step);
          if (data.totalSteps) setStreamTotal(data.totalSteps);

          if (data.latestRider) {
            const matchedPool = (data.clusters as MatchCluster[])?.find((c) =>
              c.riders?.some((r) => r.userId === data.latestRider.userId)
            );
            const matchMsg =
              matchedPool && matchedPool.riders.length > 1
                ? `matched into Pool ${matchedPool.clusterId} (${matchedPool.savingsPercentage}% Saved)!`
                : 'added to pool (Solo Request)';

            setLiveToast({
              id: String(Date.now()),
              message: `New request: ${data.latestRider.studentName} (${data.latestRider.sourceNodeId} → ${data.latestRider.destinationNodeId})`,
              subtext: `${matchMsg} · Progress: ${data.step}/${data.totalSteps || 15}`,
            });
          }

          if (data.step >= (data.totalSteps || 15)) {
            es.close();
            eventSourceRef.current = null;
            setIsStreaming(false);
            setLiveToast({
              id: String(Date.now()),
              message: '⚡ Stream Complete!',
              subtext: `All 15 commuters dispatched and matched. Total Fare Saved: ₹${data.totalFareSavedRs}`,
            });
          }
        } catch (err) {
          console.error('Error parsing SSE event payload:', err);
        }
      };

      es.onerror = (err) => {
        console.warn('SSE stream closed or error:', err);
        es.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
      };
    } else {
      // Standalone client fallback simulator (2.5s interval)
      const seeded = buildSeededRequests(peakMode);
      runningFallbackReqsRef.current = [];
      let currentIdx = 0;

      fallbackTimerRef.current = setInterval(() => {
        if (currentIdx >= seeded.length) {
          if (fallbackTimerRef.current) clearInterval(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
          setIsStreaming(false);
          setLiveToast({
            id: String(Date.now()),
            message: '⚡ Stream Complete (Client Mode)!',
            subtext: 'All 15 mock commuters matched along the corridor.',
          });
          return;
        }

        const rider = seeded[currentIdx];
        runningFallbackReqsRef.current = [...runningFallbackReqsRef.current, rider];
        currentIdx++;
        setStreamStep(currentIdx);

        const updatedReqs = runningFallbackReqsRef.current;
        const newClusters = matchRides(updatedReqs, peakMode);
        const fareSaved = newClusters
          .filter((c) => c.riders.length > 1)
          .reduce(
            (s, c) =>
              s + c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length,
            0
          );

        setRequests(updatedReqs);
        setClusters(newClusters);
        setTotalFareSavedRs(Math.round(fareSaved * 100) / 100);

        const matchedPool = newClusters.find((c) =>
          c.riders.some((r) => r.userId === rider.userId)
        );
        const matchMsg =
          matchedPool && matchedPool.riders.length > 1
            ? `matched into Pool ${matchedPool.clusterId} (${matchedPool.savingsPercentage}% Saved)!`
            : 'added to pool (Solo Request)';

        setLiveToast({
          id: String(Date.now()),
          message: `New request: ${rider.studentName} (${rider.sourceNodeId} → ${rider.destinationNodeId})`,
          subtext: `${matchMsg} · Progress: ${currentIdx}/15`,
        });
      }, 2500);
    }
  }, [isStreaming, isBackendLive, peakMode, streamStep, streamTotal]);

  // Reset Simulation Board
  const handleResetBoard = useCallback(async () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    setIsStreaming(false);
    setStreamStep(0);

    try {
      await resetSimulation();
    } catch (e) {
      console.warn('Reset error:', e);
    }

    setRequests([]);
    setClusters([]);
    setLatencyMs(0);
    setTotalFareSavedRs(0);
    setSelectedCluster(null);
    setLastSnapInfo(null);

    setLiveToast({
      id: String(Date.now()),
      message: 'Simulation Reset',
      subtext: 'Active commuter pool cleared (DELETE /api/simulation/reset). Board is clean.',
    });
  }, []);

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
      {/* 1. Top Navigation Bar with Live Weather */}
      <Navbar
        peakMode={peakMode}
        onTogglePeakMode={handleTogglePeakMode}
        isBackendLive={isBackendLive}
        isTogglingPeak={isTogglingPeak}
        activePoolCount={activePoolCount}
        weather={weather}
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

            {/* High-Tech Commuter Stream & Seeding Action Bar */}
            <div className="flex items-center gap-2">
              {/* Populate 15 Mock Commuters */}
              <button
                type="button"
                onClick={handleSeedSimulation}
                disabled={isSeeding || isStreaming}
                className="flex-1 py-3 px-3 rounded-xl font-bold text-xs tracking-wide bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-950/40 flex items-center justify-center space-x-1.5 transition active:scale-[0.99] disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 fill-slate-950 ${isSeeding ? 'animate-bounce' : ''}`} />
                <span>{isSeeding ? 'Populating...' : '⚡ Populate 15'}</span>
              </button>

              {/* Live SSE Stream Mode Toggle */}
              <button
                type="button"
                onClick={handleToggleStream}
                className={`py-3 px-3.5 rounded-xl font-bold text-xs tracking-wide flex items-center space-x-2 transition active:scale-[0.99] border ${
                  isStreaming
                    ? 'bg-rose-950 text-rose-300 border-rose-500 shadow-lg shadow-rose-950/50 animate-pulse'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700/80 shadow-md'
                }`}
                title={
                  isStreaming
                    ? 'Stop live commuter stream'
                    : 'Connect to live SSE stream (commuters arrive every 2.5s and re-cluster in real-time)'
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isStreaming ? 'bg-rose-500 animate-ping' : 'bg-rose-500'
                  }`}
                />
                <span>{isStreaming ? `Streaming (${streamStep}/15)` : '🔴 Live Stream Mode'}</span>
              </button>

              {/* Reset Board Button (DELETE /api/simulation/reset) */}
              <button
                type="button"
                onClick={handleResetBoard}
                className="p-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 hover:border-slate-700 transition shadow-md active:scale-95"
                title="Reset simulation and clear active pool board (DELETE /api/simulation/reset)"
              >
                <RotateCcw className="w-4 h-4" />
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

      {/* Floating Real-Time Toast Notification */}
      {liveToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[3000] max-w-lg w-[90%] bg-slate-900/95 border border-emerald-500/70 rounded-2xl p-3.5 shadow-2xl backdrop-blur-xl flex items-start space-x-3 text-xs animate-slideUp">
          <div className="w-8 h-8 rounded-xl bg-emerald-950/90 border border-emerald-700/60 flex items-center justify-center flex-shrink-0 text-emerald-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-100 flex items-center gap-1.5">
              <span>{liveToast.message}</span>
            </div>
            {liveToast.subtext && (
              <p className="text-[11px] text-emerald-300 font-mono mt-0.5 truncate">
                {liveToast.subtext}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-slate-500 hover:text-slate-300 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
