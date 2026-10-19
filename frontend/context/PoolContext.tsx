'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type {
  MatchCluster,
  RideRequest,
  TransitNode,
  WeatherTelemetry,
} from '../lib/types';
import {
  fetchGraph,
  fetchWeatherTelemetry,
  resetSimulation,
  seedSimulation,
  snapAndRequestRide,
  toggleTrafficMode,
} from '../lib/api';
import { NODES as FALLBACK_NODES, GRAPH_EDGES } from '../lib/fallbackEngine';

// ─── Default Initial Weather Telemetry ─────────────────────────────────────────
const DEFAULT_WEATHER: WeatherTelemetry = {
  temperatureC: 28.0,
  precipitationMm: 0.0,
  isRaining: false,
  conditionText: 'Clear sky (Normal)',
  recommendedSurgeMultiplier: 1.0,
};

// ─── Edge Distance Map for Exact Corridor & Remaining Leg Geometry ────────────
const edgeDistMap = new Map<string, number>();
GRAPH_EDGES.forEach(([u, v, dist]) => {
  edgeDistMap.set(`${u}|${v}`, dist);
  edgeDistMap.set(`${v}|${u}`, dist);
});

export function computePathDistance(path: string[]): number {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    total += edgeDistMap.get(`${path[i]}|${path[i + 1]}`) || 0;
  }
  return Math.round(total * 100) / 100;
}

export function computeSoloFare(distanceKm: number): number {
  return Math.round(Math.max(16.0 * distanceKm, 30.0));
}

export interface RiderFareBreakdown {
  soloFare: number;
  sharedShare: number;
  remainingFare: number;
  pooledTotal: number;
  savingsPct: number;
  dropHub: string;
  sharedKm: string;
  destination: string;
}

/**
 * Calculates the exact rider-specific pool fare breakdown:
 * soloFare = fare(source to destination)
 * sharedShare = sharedSegmentFare / groupSize
 * remainingFare = fare from where shared segment ends to destination (0 if ends at destination)
 * pooledTotal = sharedShare + remainingFare
 * savings % = (soloFare - pooledTotal) / soloFare, floored at 0
 */
export function getRiderFareBreakdown(
  rider: RideRequest,
  cluster: MatchCluster
): RiderFareBreakdown {
  const soloFare = Math.round(rider.soloFareRs);
  const n = Math.max(1, cluster.riders.length);
  const sharedDistKm = cluster.sharedDistanceKm;
  const sharedSegmentFare = computeSoloFare(sharedDistKm);
  const sharedShare = Math.round(sharedSegmentFare / n);

  const splitNodeId = cluster.sharedCorridorNodeIds?.[cluster.sharedCorridorNodeIds.length - 1];
  let remainingFare = 0;

  if (splitNodeId && splitNodeId !== rider.destinationNodeId) {
    const path = rider.computedPath || [];
    const splitIdx = path.indexOf(splitNodeId);
    if (splitIdx >= 0 && splitIdx < path.length - 1) {
      const remainingPath = path.slice(splitIdx);
      const remainingDist = computePathDistance(remainingPath);
      if (remainingDist > 0) {
        remainingFare = computeSoloFare(remainingDist);
      }
    }
  }

  const pooledTotal = sharedShare + remainingFare;
  const savingsPct = soloFare > 0
    ? Math.max(0, Math.round(((soloFare - pooledTotal) / soloFare) * 100))
    : 0;

  const destNode = FALLBACK_NODES[rider.destinationNodeId];
  const destination = destNode ? destNode.name : rider.destinationNodeId;

  return {
    soloFare,
    sharedShare,
    remainingFare,
    pooledTotal,
    savingsPct,
    dropHub: cluster.dropOffSplitNodeName,
    sharedKm: sharedDistKm.toFixed(1),
    destination,
  };
}

/**
 * Recalculates cluster savings using the exact formula across all riders in the cluster:
 * Cluster savings = average over riders of ((soloFare - pooledTotal) / soloFare), floored at 0.
 */
export function recalculateClusterSavings(cluster: MatchCluster): MatchCluster {
  if (!cluster.riders || cluster.riders.length === 0) return cluster;

  const n = cluster.riders.length;
  const sharedDistKm = cluster.sharedDistanceKm;
  const sharedSegmentFare = computeSoloFare(sharedDistKm);
  const sharedShare = sharedSegmentFare / n;

  const splitNodeId = cluster.sharedCorridorNodeIds?.[cluster.sharedCorridorNodeIds.length - 1];

  let totalRiderSavingsPct = 0;
  for (const rider of cluster.riders) {
    const soloFare = rider.soloFareRs;
    let remainingFare = 0;

    if (splitNodeId && splitNodeId !== rider.destinationNodeId) {
      const path = rider.computedPath || [];
      const splitIdx = path.indexOf(splitNodeId);
      if (splitIdx >= 0 && splitIdx < path.length - 1) {
        const remainingPath = path.slice(splitIdx);
        const remainingDist = computePathDistance(remainingPath);
        if (remainingDist > 0) {
          remainingFare = computeSoloFare(remainingDist);
        }
      }
    }

    const pooledTotal = sharedShare + remainingFare;
    const riderSavingsPct = soloFare > 0
      ? Math.max(0, ((soloFare - pooledTotal) / soloFare) * 100)
      : 0;

    totalRiderSavingsPct += riderSavingsPct;
  }

  const avgSavingsPct = totalRiderSavingsPct / n;
  const savingsPercentage = Math.round(avgSavingsPct);

  return {
    ...cluster,
    discountedFarePerPersonRs: Math.round(sharedShare),
    savingsPercentage,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToastMsg {
  id: string;
  type: 'success' | 'error' | 'info';
  msg: string;
}

interface PoolContextValue {
  nodes: TransitNode[];
  requests: RideRequest[];
  clusters: MatchCluster[];
  isBackendLive: boolean;
  peakMode: boolean;
  weather: WeatherTelemetry | null;
  isStreaming: boolean;
  isSeeding: boolean;
  selectedCluster: MatchCluster | null;
  setSelectedCluster: (c: MatchCluster | null) => void;
  toasts: ToastMsg[];
  addToast: (type: ToastMsg['type'], msg: string) => void;
  removeToast: (id: string) => void;
  handleTogglePeakMode: () => Promise<void>;
  handleSeed: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleSnapAndRequest: (params: {
    studentName: string;
    sourceLat: number;
    sourceLng: number;
    destLat: number;
    destLng: number;
    departureTime: string;
  }) => Promise<void>;
  toggleStream: () => void;
  refreshWeather: () => Promise<void>;
}

const PoolContext = createContext<PoolContextValue | null>(null);

export function usePool(): PoolContextValue {
  const ctx = useContext(PoolContext);
  if (!ctx) throw new Error('usePool must be used within PoolProvider');
  return ctx;
}

export function PoolProvider({ children }: { children: React.ReactNode }) {
  const [nodes, setNodes] = useState<TransitNode[]>(Object.values(FALLBACK_NODES));
  const [requests, setRequests] = useState<RideRequest[]>([]);
  const [clusters, setClusters] = useState<MatchCluster[]>([]);
  const [isBackendLive, setIsBackendLive] = useState(false);
  // Peak mode defaults to OFF (false) on first load
  const [peakMode, setPeakMode] = useState(false);
  const [weather, setWeather] = useState<WeatherTelemetry | null>(DEFAULT_WEATHER);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<MatchCluster | null>(null);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  const addToast = useCallback((type: ToastMsg['type'], msg: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { id, type, msg }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshWeather = useCallback(async () => {
    const { data } = await fetchWeatherTelemetry();
    setWeather(data);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, isLive } = await fetchGraph();
      setNodes(data.nodes);
      setIsBackendLive(isLive);
      // Ensure Peak Traffic mode defaults to OFF on first load
      setPeakMode(false);
      if (isLive && data.peakMode) {
        await toggleTrafficMode(false);
      }
    })();
    refreshWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTogglePeakMode = useCallback(async () => {
    const next = !peakMode;
    const result = await toggleTrafficMode(next);
    setPeakMode(result.peakMode);
    setIsBackendLive(result.isLive);
    addToast('info', result.message);
  }, [peakMode, addToast]);

  const handleSeed = useCallback(async () => {
    setIsSeeding(true);
    try {
      const { data, isLive } = await seedSimulation(peakMode);
      setRequests(data.requests);
      setClusters((data.clusters || []).map(recalculateClusterSavings));
      setIsBackendLive(isLive);
      addToast(
        'success',
        `${isLive ? '🟢 Live' : '⚡ Fallback'}: ${data.requests.length} commuters → ${data.clusters.length} pools (saved ₹${Math.round(data.totalFareSavedRs)})`,
      );
    } finally {
      setIsSeeding(false);
    }
  }, [peakMode, addToast]);

  const handleReset = useCallback(async () => {
    await resetSimulation();
    setRequests([]);
    setClusters([]);
    setSelectedCluster(null);
    addToast('info', 'Simulation cleared.');
  }, [addToast]);

  const handleSnapAndRequest = useCallback(
    async (params: {
      studentName: string;
      sourceLat: number;
      sourceLng: number;
      destLat: number;
      destLng: number;
      departureTime: string;
    }) => {
      try {
        const { data, isLive } = await snapAndRequestRide({ ...params, peakMode });
        setRequests(data.requests);
        setClusters((data.clusters || []).map(recalculateClusterSavings));
        setIsBackendLive(isLive);
        addToast(
          'success',
          `${isLive ? '🟢' : '⚡'} Matched → ${data.snap.sourceNodeName} → ${data.snap.destNodeName}`,
        );
      } catch (e: unknown) {
        addToast('error', e instanceof Error ? e.message : 'Snap request failed');
      }
    },
    [peakMode, addToast],
  );

  const toggleStream = useCallback(() => {
    if (isStreaming) {
      sseRef.current?.close();
      sseRef.current = null;
      setIsStreaming(false);
      addToast('info', '🔴 Live stream disconnected.');
      return;
    }
    setIsStreaming(true);
    addToast('info', '🔴 Live stream active — commuters arriving every 2.5 s…');
    const sse = new EventSource(
      `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/simulation/stream`,
    );
    sseRef.current = sse;
    sse.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { requests: RideRequest[]; clusters: MatchCluster[] };
        setRequests(data.requests);
        setClusters((data.clusters || []).map(recalculateClusterSavings));
        setIsBackendLive(true);
      } catch { /* ignore */ }
    };
    sse.onerror = () => {
      sse.close();
      sseRef.current = null;
      setIsStreaming(false);
      addToast('error', 'SSE stream lost — backend may be offline.');
    };
  }, [isStreaming, addToast]);

  return (
    <PoolContext.Provider
      value={{
        nodes, requests, clusters, isBackendLive, peakMode,
        weather, isStreaming, isSeeding, selectedCluster, setSelectedCluster,
        toasts, addToast, removeToast,
        handleTogglePeakMode, handleSeed, handleReset, handleSnapAndRequest,
        toggleStream, refreshWeather,
      }}
    >
      {children}
    </PoolContext.Provider>
  );
}
