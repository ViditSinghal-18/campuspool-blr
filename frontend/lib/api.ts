import {
  GraphData,
  RideRequest,
  SimulationResult,
  SnapAndRequestResult,
  TransitNode,
} from './types';
import {
  NODES,
  buildSeededRequests,
  runFallbackSimulation,
  runFallbackSnapAndRequest,
} from './fallbackEngine';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export interface ApiState {
  isBackendLive: boolean;
  statusChecked: boolean;
}

// Global cached client state when in fallback mode
let fallbackRequests: RideRequest[] = [];
let fallbackPeakMode = false;

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/graph/nodes`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchGraph(): Promise<{ data: GraphData; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/graph/nodes`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      data: {
        nodes: json.nodes as TransitNode[],
        adjacency: json.adjacency,
        peakMode: !!json.peakMode,
      },
      isLive: true,
    };
  } catch {
    // Client-side fallback
    return {
      data: {
        nodes: Object.values(NODES),
        adjacency: {},
        peakMode: fallbackPeakMode,
      },
      isLive: false,
    };
  }
}

export async function toggleTrafficMode(
  peak: boolean
): Promise<{ peakMode: boolean; isLive: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/graph/traffic-mode?peak=${peak}`, {
      method: 'POST',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    fallbackPeakMode = !!json.peakMode;
    return {
      peakMode: !!json.peakMode,
      isLive: true,
      message: json.message || (peak ? 'Peak mode enabled (1.4x choke points)' : 'Off-peak mode restored'),
    };
  } catch {
    fallbackPeakMode = peak;
    return {
      peakMode: peak,
      isLive: false,
      message: peak
        ? 'Client Fallback: Peak traffic enabled (1.4x choke points on Nayandahalli, Mysore Rd, Majestic)'
        : 'Client Fallback: Off-peak mode restored',
    };
  }
}

export async function seedSimulation(
  peakMode: boolean
): Promise<{ data: SimulationResult; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/simulation/seed`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    fallbackRequests = json.requests || [];
    return {
      data: {
        requests: json.requests,
        clusters: json.clusters,
        executionTimeMs: json.executionTimeMs,
        totalFareSavedRs: json.totalFareSavedRs,
      },
      isLive: true,
    };
  } catch {
    const sim = runFallbackSimulation(peakMode);
    fallbackRequests = sim.requests;
    return {
      data: sim,
      isLive: false,
    };
  }
}

export async function snapAndRequestRide(params: {
  studentName: string;
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  departureTime: string;
  peakMode: boolean;
}): Promise<{ data: SnapAndRequestResult; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/rides/snap-and-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentName: params.studentName,
        sourceLat: params.sourceLat,
        sourceLng: params.sourceLng,
        destLat: params.destLat,
        destLng: params.destLng,
        departureTime: params.departureTime,
      }),
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    fallbackRequests = json.requests || [];
    return {
      data: {
        snap: json.snap,
        requests: json.requests,
        clusters: json.clusters,
        executionTimeMs: json.executionTimeMs,
        totalFareSavedRs: json.totalFareSavedRs,
      },
      isLive: true,
    };
  } catch (err: unknown) {
    if (err instanceof Error && !err.message.includes('HTTP') && !err.message.includes('fetch') && !err.message.includes('timeout')) {
      throw err;
    }
    // Fallback simulation
    if (fallbackRequests.length === 0) {
      fallbackRequests = buildSeededRequests(params.peakMode);
    }
    const fallbackRes = runFallbackSnapAndRequest(
      params.studentName,
      params.sourceLat,
      params.sourceLng,
      params.destLat,
      params.destLng,
      params.departureTime,
      fallbackRequests,
      params.peakMode
    );
    fallbackRequests = fallbackRes.result.requests;
    return {
      data: {
        snap: fallbackRes.snap,
        ...fallbackRes.result,
      },
      isLive: false,
    };
  }
}
