/**
 * Client-side fallback simulation engine — exact TypeScript port of the
 * Spring Boot BengaluruGraphEngine + IntervalMatcherService.
 *
 * Used when the backend is unreachable so the UI stays 100% interactive
 * when deployed standalone to Vercel.
 */

import type { RideRequest, MatchCluster, SimulationResult, TransitNode } from './types';

// ─── Graph Data ─────────────────────────────────────────────────────────────

export const NODES: Record<string, TransitNode> = {
  RVCE:         { id: 'RVCE',         name: 'RVCE Campus',          lat: 12.9237, lng: 77.4987 },
  PATTANAGERE:  { id: 'PATTANAGERE',  name: 'Pattanagere',          lat: 12.9244, lng: 77.4981 },
  KENGERI:      { id: 'KENGERI',      name: 'Kengeri',              lat: 12.9172, lng: 77.4833 },
  RR_NAGAR:     { id: 'RR_NAGAR',     name: 'Rajarajeshwari Nagar', lat: 12.9275, lng: 77.5165 },
  NAYANDAHALLI: { id: 'NAYANDAHALLI', name: 'Nayandahalli',         lat: 12.9416, lng: 77.5256 },
  MYSORE_RD:    { id: 'MYSORE_RD',    name: 'Mysore Road',          lat: 12.9467, lng: 77.5301 },
  VIJAYANAGAR:  { id: 'VIJAYANAGAR',  name: 'Vijayanagar',          lat: 12.9709, lng: 77.5376 },
  MAJESTIC:     { id: 'MAJESTIC',     name: 'Majestic (KSR)',       lat: 12.9767, lng: 77.5713 },
  MG_ROAD:      { id: 'MG_ROAD',      name: 'MG Road',              lat: 12.9756, lng: 77.6066 },
  INDIRANAGAR:  { id: 'INDIRANAGAR',  name: 'Indiranagar',          lat: 12.9784, lng: 77.6408 },
  BANASHANKARI: { id: 'BANASHANKARI', name: 'Banashankari',         lat: 12.9152, lng: 77.5736 },
};

type AdjMap = Map<string, Array<{ to: string; dist: number }>>;

const RAW_EDGES: Array<[string, string, number]> = [
  ['KENGERI',      'PATTANAGERE',  1.8],
  ['PATTANAGERE',  'RVCE',         0.8],
  ['RVCE',         'RR_NAGAR',     3.2],
  ['RR_NAGAR',     'NAYANDAHALLI', 3.1],
  ['NAYANDAHALLI', 'MYSORE_RD',    1.2],
  ['MYSORE_RD',    'VIJAYANAGAR',  3.8],
  ['VIJAYANAGAR',  'MAJESTIC',     4.5],
  ['MAJESTIC',     'MG_ROAD',      3.5],
  ['MG_ROAD',      'INDIRANAGAR',  3.4],
  ['MAJESTIC',     'BANASHANKARI', 6.2],
  ['VIJAYANAGAR',  'BANASHANKARI', 5.0],
  ['NAYANDAHALLI', 'BANASHANKARI', 5.5],
  ['RR_NAGAR',     'BANASHANKARI', 6.8],
  ['RVCE',         'KENGERI',      2.2],
  ['KENGERI',      'RR_NAGAR',     4.7],
];

const CONGESTED_NODES = new Set(['NAYANDAHALLI', 'MYSORE_RD', 'MAJESTIC']);
const PEAK_MULTIPLIER = 1.4;
const FARE_PER_KM = 16;
const MIN_FARE = 30;

function buildAdjacency(peakMode = false): AdjMap {
  const adj: AdjMap = new Map();
  for (const id of Object.keys(NODES)) adj.set(id, []);
  for (const [from, to, dist] of RAW_EDGES) {
    const peakFrom = peakMode && CONGESTED_NODES.has(from) ? dist * PEAK_MULTIPLIER : dist;
    const peakTo   = peakMode && CONGESTED_NODES.has(to)   ? dist * PEAK_MULTIPLIER : dist;
    adj.get(from)!.push({ to, dist: peakFrom });
    adj.get(to)!.push({ to: from, dist: peakTo });
  }
  return adj;
}

// ─── Haversine ───────────────────────────────────────────────────────────────

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function snapToNearestNode(lat: number, lng: number): TransitNode {
  let nearest: TransitNode = Object.values(NODES)[0];
  let minDist = Infinity;
  for (const node of Object.values(NODES)) {
    const d = haversineKm(lat, lng, node.lat, node.lng);
    if (d < minDist) { minDist = d; nearest = node; }
  }
  return nearest;
}

// ─── Dijkstra ────────────────────────────────────────────────────────────────

function dijkstra(adj: AdjMap, src: string, dst: string): string[] {
  if (src === dst) return [src];
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  for (const id of adj.keys()) dist.set(id, Infinity);
  dist.set(src, 0);

  // Simple min-heap via sorted array (graph is tiny — 11 nodes)
  const pq: Array<[number, string]> = [[0, src]];
  const visited = new Set<string>();

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, u] = pq.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === dst) break;
    for (const { to, dist: w } of adj.get(u) ?? []) {
      if (visited.has(to)) continue;
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, u);
        pq.push([nd, to]);
      }
    }
  }

  if ((dist.get(dst) ?? Infinity) === Infinity) return [];
  const path: string[] = [];
  let step: string | undefined = dst;
  while (step) { path.unshift(step); step = prev.get(step); }
  return path;
}

function pathDistance(path: string[]): number {
  if (path.length < 2) return 0;
  const adj = buildAdjacency(false);
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = adj.get(path[i])?.find(e => e.to === path[i + 1])?.dist ?? 0;
    total += seg;
  }
  return Math.round(total * 100) / 100;
}

function soloFare(distKm: number): number {
  return Math.round(Math.max(FARE_PER_KM * distKm, MIN_FARE));
}

// ─── LCCS (Longest Common Contiguous Subpath) ─────────────────────────────

export function findSharedCorridor(pathA: string[], pathB: string[]): string[] {
  const m = pathA.length, n = pathB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  let maxLen = 0, endA = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (pathA[i - 1] === pathB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
        if (dp[i][j] > maxLen) { maxLen = dp[i][j]; endA = i; }
      } else {
        dp[i][j] = 0;
      }
    }
  }
  return maxLen === 0 ? [] : pathA.slice(endA - maxLen, endA);
}

function findSharedCorridorMulti(paths: string[][]): string[] {
  if (!paths.length) return [];
  let corridor = [...paths[0]];
  for (let i = 1; i < paths.length; i++) {
    corridor = findSharedCorridor(corridor, paths[i]);
    if (!corridor.length) return [];
  }
  return corridor;
}

// ─── Sliding-window matcher ───────────────────────────────────────────────

const WINDOW_MINUTES = 15;
const MIN_SHARED_NODES = 3;
const MAX_CLUSTER_SIZE = 3;

function parseMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function combinations<T>(list: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (list.length < k) return [];
  const [head, ...rest] = list;
  const withHead = combinations(rest, k - 1).map(sub => [head, ...sub]);
  const withoutHead = combinations(rest, k);
  return [...withHead, ...withoutHead];
}

let seqCounter = 1;

export function matchRides(requests: RideRequest[], peakMode = false): MatchCluster[] {
  seqCounter = 1;
  const adj = buildAdjacency(peakMode);
  const sorted = [...requests].sort(
    (a, b) => parseMinutes(a.departureTime) - parseMinutes(b.departureTime)
  );
  const assigned = new Set<string>();
  const clusters: MatchCluster[] = [];

  for (let anchor = 0; anchor < sorted.length; anchor++) {
    const anchorReq = sorted[anchor];
    if (assigned.has(anchorReq.userId)) continue;

    const anchorMin = parseMinutes(anchorReq.departureTime);
    const window = [anchorReq];
    for (let j = anchor + 1; j < sorted.length; j++) {
      const cand = sorted[j];
      if (assigned.has(cand.userId)) continue;
      if (parseMinutes(cand.departureTime) - anchorMin > WINDOW_MINUTES) break;
      window.push(cand);
    }

    let found: MatchCluster | null = null;
    outer: for (let size = Math.min(MAX_CLUSTER_SIZE, window.length); size >= 2; size--) {
      for (const combo of combinations(window, size)) {
        const paths = combo.map(r => r.computedPath);
        const corridor = findSharedCorridorMulti(paths);
        if (corridor.length >= MIN_SHARED_NODES) {
          found = buildCluster(combo, corridor, adj);
          break outer;
        }
      }
    }

    if (found) {
      found.riders.forEach(r => assigned.add(r.userId));
      clusters.push(found);
    } else {
      assigned.add(anchorReq.userId);
      clusters.push(soloCluster(anchorReq));
    }
  }
  return clusters;
}

function buildCluster(
  riders: RideRequest[],
  corridor: string[],
  adj: AdjMap
): MatchCluster {
  const sharedDistKm = (() => {
    let t = 0;
    for (let i = 0; i < corridor.length - 1; i++) {
      t += adj.get(corridor[i])?.find(e => e.to === corridor[i + 1])?.dist ?? 0;
    }
    return Math.round(t * 100) / 100;
  })();

  const sharedFare = soloFare(sharedDistKm);
  const n = riders.length;
  const perPerson = Math.ceil(sharedFare / n);
  const splitNodeId = corridor[corridor.length - 1];
  const splitNode = NODES[splitNodeId];
  const originalTotal = riders.reduce((s, r) => s + r.soloFareRs, 0);
  const avgSolo = originalTotal / n;
  const savingsPct = avgSolo > 0 ? Math.max(0, Math.round((1 - perPerson / avgSolo) * 100)) : 0;

  return {
    clusterId: `CL-${seqCounter++}`,
    riders,
    sharedCorridorNodeIds: corridor,
    dropOffSplitNodeName: splitNode?.name ?? splitNodeId,
    sharedDistanceKm: sharedDistKm,
    originalTotalFareRs: Math.round(originalTotal * 100) / 100,
    discountedFarePerPersonRs: perPerson,
    savingsPercentage: savingsPct,
  };
}

function soloCluster(rider: RideRequest): MatchCluster {
  return {
    clusterId: `CL-${seqCounter++}`,
    riders: [rider],
    sharedCorridorNodeIds: rider.computedPath,
    dropOffSplitNodeName: rider.destinationNodeId,
    sharedDistanceKm: rider.soloDistanceKm,
    originalTotalFareRs: rider.soloFareRs,
    discountedFarePerPersonRs: rider.soloFareRs,
    savingsPercentage: 0,
  };
}

// ─── Seeded requests ─────────────────────────────────────────────────────────

function buildRequest(
  userId: string,
  studentName: string,
  src: string,
  dst: string,
  departureTime: string,
  peakMode = false
): RideRequest {
  const adj = buildAdjacency(peakMode);
  const path = dijkstra(adj, src, dst);
  const distKm = pathDistance(path);
  return { userId, studentName, sourceNodeId: src, destinationNodeId: dst,
           departureTime, computedPath: path, soloDistanceKm: distKm,
           soloFareRs: soloFare(distKm) };
}

export function buildSeededRequests(peakMode = false): RideRequest[] {
  const seed: Array<[string, string, string, string, string]> = [
    ['u-01', 'Arjun Sharma',    'RVCE',        'MAJESTIC',     '16:00'],
    ['u-02', 'Priya Nair',      'RVCE',        'MG_ROAD',      '16:00'],
    ['u-03', 'Rohan Mehta',     'RVCE',        'MAJESTIC',     '16:02'],
    ['u-04', 'Sneha Reddy',     'KENGERI',     'INDIRANAGAR',  '16:05'],
    ['u-05', 'Karthik Iyer',    'RVCE',        'INDIRANAGAR',  '16:06'],
    ['u-06', 'Ananya Krishnan', 'PATTANAGERE', 'MG_ROAD',      '16:07'],
    ['u-07', 'Vikram Gupta',    'RVCE',        'VIJAYANAGAR',  '16:10'],
    ['u-08', 'Divya Pillai',    'KENGERI',     'VIJAYANAGAR',  '16:11'],
    ['u-09', 'Aditya Rao',      'RVCE',        'BANASHANKARI', '16:12'],
    ['u-10', 'Kavya Singh',     'PATTANAGERE', 'MAJESTIC',     '16:15'],
    ['u-11', 'Nikhil Patil',    'KENGERI',     'MG_ROAD',      '16:16'],
    ['u-12', 'Meera Thomas',    'RVCE',        'MG_ROAD',      '16:17'],
    ['u-13', 'Siddharth Bhat',  'RVCE',        'INDIRANAGAR',  '16:25'],
    ['u-14', 'Pooja Venkatesh', 'PATTANAGERE', 'MAJESTIC',     '16:27'],
    ['u-15', 'Rahul Joshi',     'KENGERI',     'VIJAYANAGAR',  '16:30'],
  ];
  return seed.map(([id, name, src, dst, time]) =>
    buildRequest(id, name, src, dst, time, peakMode)
  );
}

export function runFallbackSimulation(peakMode = false): SimulationResult {
  const t0 = performance.now();
  const requests = buildSeededRequests(peakMode);
  const clusters = matchRides(requests, peakMode);
  const execMs = Math.round(performance.now() - t0);
  const totalFareSavedRs = clusters
    .filter(c => c.riders.length > 1)
    .reduce((s, c) => s + c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length, 0);
  return { requests, clusters, executionTimeMs: execMs,
           totalFareSavedRs: Math.round(totalFareSavedRs * 100) / 100 };
}

export function runFallbackSnapAndRequest(
  studentName: string,
  sourceLat: number, sourceLng: number,
  destLat: number, destLng: number,
  departureTime: string,
  existingRequests: RideRequest[],
  peakMode = false
): { snap: { sourceNodeId: string; sourceNodeName: string; sourceSnapDistKm: number;
             destNodeId: string; destNodeName: string; destSnapDistKm: number };
    result: SimulationResult } {
  const srcNode  = snapToNearestNode(sourceLat, sourceLng);
  const dstNode  = snapToNearestNode(destLat, destLng);
  const snapDistSrc = Math.round(haversineKm(sourceLat, sourceLng, srcNode.lat, srcNode.lng) * 1000) / 1000;
  const snapDistDst = Math.round(haversineKm(destLat, destLng, dstNode.lat, dstNode.lng) * 1000) / 1000;

  const userId = `snap-${studentName.replace(/\s+/g, '').toLowerCase()}-${departureTime.replace(':', '')}`;
  const newReq = buildRequest(userId, studentName, srcNode.id, dstNode.id, departureTime, peakMode);

  const merged = existingRequests.filter(r => r.userId !== userId).concat(newReq);
  const t0 = performance.now();
  const clusters = matchRides(merged, peakMode);
  const execMs = Math.round(performance.now() - t0);
  const totalFareSaved = clusters
    .filter(c => c.riders.length > 1)
    .reduce((s, c) => s + c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length, 0);

  return {
    snap: { sourceNodeId: srcNode.id, sourceNodeName: srcNode.name, sourceSnapDistKm: snapDistSrc,
            destNodeId: dstNode.id, destNodeName: dstNode.name, destSnapDistKm: snapDistDst },
    result: { requests: merged, clusters, executionTimeMs: execMs,
              totalFareSavedRs: Math.round(totalFareSaved * 100) / 100 },
  };
}

// Export raw edge list for map rendering
export const GRAPH_EDGES = RAW_EDGES;
