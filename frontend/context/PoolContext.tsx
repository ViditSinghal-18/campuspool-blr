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
import { NODES as FALLBACK_NODES } from '../lib/fallbackEngine';

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
  const [peakMode, setPeakMode] = useState(false);
  const [weather, setWeather] = useState<WeatherTelemetry | null>(null);
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
      setPeakMode(data.peakMode);
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
      setClusters(data.clusters);
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
        setClusters(data.clusters);
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
        setClusters(data.clusters);
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
