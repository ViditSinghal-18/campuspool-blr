'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import { LatLng, MatchCluster, PickModeTarget, TransitNode } from '../lib/types';
import { GRAPH_EDGES, NODES } from '../lib/fallbackEngine';
import { MapPin, Zap, AlertTriangle } from 'lucide-react';

interface MapCanvasProps {
  nodes: TransitNode[];
  clusters: MatchCluster[];
  selectedCluster: MatchCluster | null;
  peakMode: boolean;
  pickTarget: PickModeTarget;
  onMapClickPickup: (latlng: LatLng) => void;
  onMapClickDropoff: (latlng: LatLng) => void;
  pickedPickup: LatLng | null;
  pickedDropoff: LatLng | null;
  clusterColors: string[];
  tiltMode?: boolean;
}

const INITIAL_CENTER: [number, number] = [12.9520, 77.5600];
const CONGESTED_NODES = new Set(['NAYANDAHALLI', 'MYSORE_RD', 'MAJESTIC']);

// Permanent tooltips shown only for these 5 hubs; others show on hover or zoom >= 13
const PERMANENT_STATION_IDS = new Set([
  'RVCE',
  'MAJESTIC',
  'INDIRANAGAR',
  'KENGERI',
  'BANASHANKARI',
]);

// ─── Edge Geometry Caches ─────────────────────────────────────────────────────
// 1. Saved edge geometry loaded from /edge-geometry.json (pre-calculated high fidelity)
const savedEdgeGeometryCache = new Map<string, [number, number][]>();
let isSavedEdgeGeometryLoaded = false;

// 2. Live OSRM edge geometry cache for pairs missing from the pre-calculated file
const livePairGeometryCache = new Map<string, [number, number][]>();
const livePairFailed = new Set<string>();
const livePairInFlight = new Set<string>();

/**
 * Fetches real road geometry for a single edge pair from OSRM with retry once on failure.
 * Coordinates are passed to OSRM in lng,lat order: `${node.lng},${node.lat}`.
 */
async function fetchPairOsrmWithRetry(
  nodeA: TransitNode,
  nodeB: TransitNode
): Promise<[number, number][] | null> {
  const url = `https://router.project-osrm.org/route/v1/driving/${nodeA.lng},${nodeA.lat};${nodeB.lng},${nodeB.lat}?overview=full&geometries=geojson`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`OSRM error status ${res.status}`);
      }
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
        const curvedCoords: [number, number][] = data.routes[0].geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        );
        return curvedCoords;
      }
      throw new Error(`OSRM returned code ${data.code}`);
    } catch {
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 350));
      }
    }
  }

  return null;
}

/**
 * Joins multiple consecutive coordinate segments into a single smooth polyline,
 * omitting redundant duplicate junction coordinates.
 */
function joinPairGeometries(segments: [number, number][][]): [number, number][] {
  const result: [number, number][] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg || seg.length === 0) continue;
    if (result.length === 0) {
      result.push(...seg);
    } else {
      const last = result[result.length - 1];
      const first = seg[0];
      if (
        last &&
        first &&
        Math.abs(last[0] - first[0]) < 1e-4 &&
        Math.abs(last[1] - first[1]) < 1e-4
      ) {
        result.push(...seg.slice(1));
      } else {
        result.push(...seg);
      }
    }
  }
  return result;
}

/**
 * Constructs a corridor's polyline by joining consecutive node pair geometries along its path.
 * Checks savedEdgeGeometryCache first, then livePairGeometryCache, then straight line fallback.
 * Reverses the coordinate array when the pair is stored in the opposite direction.
 */
function getCorridorGeometry(nodeIds: string[]): {
  positions: [number, number][];
  isFromOsrm: boolean;
} {
  if (!nodeIds || nodeIds.length < 2) {
    return { positions: [], isFromOsrm: false };
  }

  const segments: [number, number][][] = [];
  let allFromOsrm = true;

  for (let i = 0; i < nodeIds.length - 1; i++) {
    const u = nodeIds[i];
    const v = nodeIds[i + 1];
    const nu = NODES[u];
    const nv = NODES[v];
    if (!nu || !nv) continue;

    const [a, b] = [u, v].sort();
    const edgeKey = `${a}|${b}`;

    let pairCoords: [number, number][] | null = null;
    let fromOsrm = false;

    // 1. Check saved edge geometry from file
    if (savedEdgeGeometryCache.has(edgeKey)) {
      const raw = savedEdgeGeometryCache.get(edgeKey)!;
      pairCoords = u === a ? raw : [...raw].reverse();
      fromOsrm = true;
    }
    // 2. Check live OSRM cache
    else if (livePairGeometryCache.has(edgeKey)) {
      const raw = livePairGeometryCache.get(edgeKey)!;
      pairCoords = u === a ? raw : [...raw].reverse();
      fromOsrm = true;
    }
    // 3. Fall back to straight line last
    else {
      pairCoords = [
        [nu.lat, nu.lng],
        [nv.lat, nv.lng],
      ];
      fromOsrm = false;
    }

    if (!fromOsrm) {
      allFromOsrm = false;
    }

    segments.push(pairCoords);
  }

  const joined = joinPairGeometries(segments);
  if (joined.length >= 2) {
    return { positions: joined, isFromOsrm: allFromOsrm };
  }

  const straightCoords: [number, number][] = nodeIds
    .map((id) => NODES[id])
    .filter(Boolean)
    .map((node) => [node.lat, node.lng]);

  return { positions: straightCoords, isFromOsrm: false };
}

// ─── Map Resize Handler ───────────────────────────────────────────────────────
// Invalidate size after mount, staggered ticks, and on window resize so tiles fill with no black bands
function MapResizeHandler({ tiltMode }: { tiltMode?: boolean }) {
  const map = useMap();

  useEffect(() => {
    // Immediate invalidation
    map.invalidateSize();

    // Staggered ticks to ensure DOM layout settles completely
    const t1 = setTimeout(() => map.invalidateSize(), 100);
    const t2 = setTimeout(() => map.invalidateSize(), 300);
    const t3 = setTimeout(() => map.invalidateSize(), 600);

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResize);
    };
  }, [map, tiltMode]);

  return null;
}

// ─── Zoom Watcher ─────────────────────────────────────────────────────────────
// Tracks map zoom level to dynamically display station tooltips when zoom >= 13
function ZoomWatcher({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

// Click listener inside Leaflet context
function MapClickHandler({
  pickTarget,
  onMapClickPickup,
  onMapClickDropoff,
}: {
  pickTarget: PickModeTarget;
  onMapClickPickup: (latlng: LatLng) => void;
  onMapClickDropoff: (latlng: LatLng) => void;
}) {
  useMapEvents({
    click: (e) => {
      const latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (pickTarget === 'source') {
        onMapClickPickup(latlng);
      } else if (pickTarget === 'dest') {
        onMapClickDropoff(latlng);
      }
    },
  });
  return null;
}

// Initial bounds fitter across all 11 transit hubs
function InitialBoundsFitter({ nodes }: { nodes: TransitNode[] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (nodes && nodes.length > 0) {
      const bounds = L.latLngBounds(nodes.map((n) => [n.lat, n.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: false });
    } else {
      map.setView(INITIAL_CENTER, 12);
    }
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 200);
    return () => clearTimeout(timer);
  }, [map, nodes]);
  return null;
}

// Bounds fitter when selecting a cluster
function AutoPanHandler({ selectedCluster }: { selectedCluster: MatchCluster | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selectedCluster || selectedCluster.sharedCorridorNodeIds.length === 0) return;

    const coords: [number, number][] = selectedCluster.sharedCorridorNodeIds
      .map((id) => NODES[id])
      .filter(Boolean)
      .map((node) => [node.lat, node.lng]);

    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
    }
  }, [selectedCluster, map]);

  return null;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  nodes,
  clusters,
  selectedCluster,
  peakMode,
  pickTarget,
  onMapClickPickup,
  onMapClickDropoff,
  pickedPickup,
  pickedDropoff,
  clusterColors,
  tiltMode,
}) => {
  // Revision counters to trigger re-renders when saved edge geometry or live pair geometry arrives
  const [savedGeometryVersion, setSavedGeometryVersion] = useState(0);
  const [livePairVersion, setLivePairVersion] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(12);

  // 1. Fetch saved edge geometry from /edge-geometry.json on mount
  useEffect(() => {
    if (isSavedEdgeGeometryLoaded) {
      setSavedGeometryVersion((v) => v + 1);
      return;
    }

    let active = true;
    fetch('/edge-geometry.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Record<string, [number, number][]>) => {
        if (data && typeof data === 'object') {
          for (const [key, coords] of Object.entries(data)) {
            if (Array.isArray(coords)) {
              savedEdgeGeometryCache.set(key, coords);
            }
          }
        }
        isSavedEdgeGeometryLoaded = true;
        if (active) setSavedGeometryVersion((v) => v + 1);
      })
      .catch(() => {
        // File may not exist yet if script has not been run
        isSavedEdgeGeometryLoaded = true;
        if (active) setSavedGeometryVersion((v) => v + 1);
      });

    return () => {
      active = false;
    };
  }, []);

  // 2. Fetch live OSRM only for pairs missing from the saved edge-geometry.json file
  useEffect(() => {
    if (!isSavedEdgeGeometryLoaded) return;

    let isCancelled = false;

    // Identify all missing pairs across all active clusters
    const missingPairs: Array<{ key: string; a: string; b: string }> = [];

    for (const cluster of clusters) {
      const nodeIds = cluster.sharedCorridorNodeIds;
      if (!nodeIds || nodeIds.length < 2) continue;

      for (let i = 0; i < nodeIds.length - 1; i++) {
        const u = nodeIds[i];
        const v = nodeIds[i + 1];
        const [a, b] = [u, v].sort();
        const edgeKey = `${a}|${b}`;

        // If pair is already saved in edge-geometry.json, do not call live OSRM
        if (savedEdgeGeometryCache.has(edgeKey)) continue;

        // If already in live cache, failed, or currently fetching, skip
        if (
          livePairGeometryCache.has(edgeKey) ||
          livePairFailed.has(edgeKey) ||
          livePairInFlight.has(edgeKey)
        ) {
          continue;
        }

        if (!missingPairs.some((p) => p.key === edgeKey)) {
          missingPairs.push({ key: edgeKey, a, b });
        }
      }
    }

    if (missingPairs.length === 0) return;

    const fetchMissingPairs = async () => {
      for (const pair of missingPairs) {
        if (isCancelled) break;
        if (
          savedEdgeGeometryCache.has(pair.key) ||
          livePairGeometryCache.has(pair.key) ||
          livePairFailed.has(pair.key)
        ) {
          continue;
        }

        const nodeA = NODES[pair.a];
        const nodeB = NODES[pair.b];
        if (!nodeA || !nodeB) continue;

        livePairInFlight.add(pair.key);
        const coords = await fetchPairOsrmWithRetry(nodeA, nodeB);
        livePairInFlight.delete(pair.key);

        if (isCancelled) break;

        if (coords) {
          livePairGeometryCache.set(pair.key, coords);
        } else {
          livePairFailed.add(pair.key);
        }
        setLivePairVersion((v) => v + 1);

        // Polite delay between sequential calls
        await new Promise((r) => setTimeout(r, 200));
      }
    };

    fetchMissingPairs();

    return () => {
      isCancelled = true;
    };
  }, [clusters, savedGeometryVersion]);

  // Base graph edges geometry
  const baseEdgeLines = useMemo(() => {
    return GRAPH_EDGES.map(([u, v, dist]) => {
      const nu = NODES[u];
      const nv = NODES[v];
      if (!nu || !nv) return null;
      const isCongested =
        peakMode && (CONGESTED_NODES.has(u) || CONGESTED_NODES.has(v));
      return {
        id: `${u}-${v}`,
        positions: [
          [nu.lat, nu.lng] as [number, number],
          [nv.lat, nv.lng] as [number, number],
        ],
        dist,
        isCongested,
      };
    }).filter(Boolean);
  }, [peakMode]);

  // Check corridor OSRM statuses for legend
  const { hasOsrmCorridors, hasStraightCorridors } = useMemo(() => {
    let hasOsrm = false;
    let hasStraight = false;

    clusters.forEach((c) => {
      if (!c.sharedCorridorNodeIds || c.sharedCorridorNodeIds.length < 2) return;
      const { isFromOsrm } = getCorridorGeometry(c.sharedCorridorNodeIds);
      if (isFromOsrm) {
        hasOsrm = true;
      } else {
        hasStraight = true;
      }
    });

    return { hasOsrmCorridors: hasOsrm, hasStraightCorridors: hasStraight };
  }, [clusters, savedGeometryVersion, livePairVersion]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* Pick mode active banner overlay */}
      {pickTarget && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] px-4 py-2 rounded-xl bg-slate-900/90 border border-emerald-500/80 shadow-2xl backdrop-blur-md flex items-center space-x-2 text-xs font-semibold animate-pulse text-emerald-300">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span>
            {pickTarget === 'source'
              ? 'Click anywhere on Bengaluru map to set Pickup GPS'
              : 'Click anywhere on Bengaluru map to set Drop-off GPS'}
          </span>
        </div>
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-6 right-6 z-[1000] w-64 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] text-slate-300 backdrop-blur-md shadow-2xl space-y-2 hidden md:block">
        <div className="font-bold text-slate-200 flex items-center justify-between pb-2 border-b border-slate-800 gap-3">
          <span className="tracking-tight text-slate-100">Bengaluru Graph Legend</span>
          <span className="text-[10px] text-emerald-400 font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-800/60 whitespace-nowrap">
            @rvce.edu.in
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-emerald-400 border border-emerald-200"></span>
          <span>RVCE Campus (Anchor Hub)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-3 h-3 rounded-full bg-cyan-400 border border-slate-700"></span>
          <span>Purple Line Transit Stations</span>
        </div>
        {peakMode && (
          <div className="flex items-center space-x-2 text-amber-400">
            <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Peak Choke Points (1.4x Surge)</span>
          </div>
        )}
        <div className="flex items-center space-x-2">
          <span className="w-6 h-0.5 border-t-2 border-dashed border-slate-500"></span>
          <span>Base Metro &amp; Road Graph</span>
        </div>

        {/* Dynamic Corridor Geometry Legend: OSRM Curving vs Straight (OSRM unavailable) */}
        {hasOsrmCorridors && (
          <div className="flex items-center space-x-2">
            <span className="w-6 h-1 rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400"></span>
            <span>Active Pooled Corridors (OSRM Curving)</span>
          </div>
        )}
        {hasStraightCorridors && (
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="w-6 h-1 rounded-full bg-slate-500"></span>
            <span>Active Pooled Corridors (Straight (OSRM unavailable))</span>
          </div>
        )}
        {!hasOsrmCorridors && !hasStraightCorridors && (
          <div className="flex items-center space-x-2 text-slate-400">
            <span className="w-6 h-1 rounded-full bg-slate-600"></span>
            <span>Active Pooled Corridors (Straight (OSRM unavailable))</span>
          </div>
        )}
      </div>

      <MapContainer
        center={INITIAL_CENTER}
        zoom={12}
        scrollWheelZoom={true}
        zoomControl={false}
        attributionControl={false}
        className="w-full h-full"
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap"
        />

        {/* Resize Handler: invalidates size after mount and on window resize */}
        <MapResizeHandler tiltMode={tiltMode} />

        {/* Zoom Watcher: allows station labels to expand on zoom >= 13 */}
        <ZoomWatcher onZoomChange={setCurrentZoom} />

        {/* Fits bounds on initial load so RVCE, Kengeri, Majestic, and Indiranagar fit cleanly */}
        <InitialBoundsFitter nodes={nodes} />

        {/* Global Click Handler */}
        <MapClickHandler
          pickTarget={pickTarget}
          onMapClickPickup={onMapClickPickup}
          onMapClickDropoff={onMapClickDropoff}
        />

        {/* Pan to selected cluster bounds */}
        <AutoPanHandler selectedCluster={selectedCluster} />

        {/* 1. Base Graph Edges (dashed lines) */}
        {baseEdgeLines.map((edge) => {
          if (!edge) return null;
          return (
            <Polyline
              key={edge.id}
              positions={edge.positions}
              pathOptions={{
                color: edge.isCongested ? '#f59e0b' : '#334155',
                weight: edge.isCongested ? 2.5 : 1.8,
                dashArray: edge.isCongested ? '5, 5' : '4, 8',
                opacity: edge.isCongested ? 0.85 : 0.5,
              }}
            />
          );
        })}

        {/* 2. MatchCluster Shared Corridors (joined consecutive edge geometries with reversal & fallbacks) */}
        {clusters.map((cluster, idx) => {
          const isSelected = selectedCluster?.clusterId === cluster.clusterId;
          const { positions: corridorPositions, isFromOsrm } = getCorridorGeometry(
            cluster.sharedCorridorNodeIds
          );

          if (corridorPositions.length < 2) return null;

          const color = clusterColors[idx % clusterColors.length];
          const cleanId = cluster.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || cluster.clusterId;

          return (
            <React.Fragment key={`corridor-${cluster.clusterId}`}>
              {/* Outer soft glow line */}
              <Polyline
                positions={corridorPositions}
                pathOptions={{
                  color,
                  weight: isSelected ? 12 : 8,
                  opacity: isSelected ? 0.45 : 0.25,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
              {/* Inner crisp neon line */}
              <Polyline
                positions={corridorPositions}
                pathOptions={{
                  color,
                  weight: isSelected ? 6 : 4,
                  opacity: isSelected ? 1.0 : 0.85,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              >
                <Popup>
                  <div className="text-xs space-y-1">
                    <div className="font-bold text-slate-100 flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pool #{cleanId}</span>
                    </div>
                    <div className="text-slate-300">
                      Riders: <strong>{cluster.riders.length} commuters</strong>
                    </div>
                    <div className="text-slate-300">
                      Corridor: <strong>{cluster.sharedDistanceKm.toFixed(1)} km</strong>
                    </div>
                    <div className="text-emerald-400 font-semibold">
                      Fare: ₹{Math.round(cluster.discountedFarePerPersonRs)}/rider ({cluster.savingsPercentage.toFixed(0)}% Saved)
                    </div>
                    <div className="text-[10px] font-mono pt-1 border-t border-slate-800">
                      {isFromOsrm ? (
                        <span className="text-cyan-300">⚡ OSRM Curving (Real Road Geometry)</span>
                      ) : (
                        <span className="text-amber-300">Straight (OSRM unavailable)</span>
                      )}
                    </div>
                  </div>
                </Popup>
              </Polyline>
            </React.Fragment>
          );
        })}

        {/* 3. Bengaluru Transit Hubs (11 Nodes) */}
        {nodes.map((node) => {
          const isRVCE = node.id === 'RVCE';
          const isPattanagere = node.id === 'PATTANAGERE' || node.name.toLowerCase().includes('pattanagere');
          const isCongested = peakMode && CONGESTED_NODES.has(node.id);

          // Permanent tooltips only for RVCE Campus, Majestic, Indiranagar, Kengeri, and Banashankari.
          // Other station names show on hover, or when zoom >= 13.
          const isPermanent = PERMANENT_STATION_IDS.has(node.id) || currentZoom >= 13;

          // RVCE Campus direction "top", Pattanagere "bottom" with offsets so none overlap
          const tooltipDirection: 'top' | 'bottom' = isPattanagere ? 'bottom' : 'top';
          const tooltipOffset: [number, number] = isPattanagere
            ? [0, 10]
            : isRVCE
            ? [0, -10]
            : [0, -8];

          return (
            <CircleMarker
              key={node.id}
              center={[node.lat, node.lng]}
              radius={isRVCE ? 9 : 6.5}
              pathOptions={{
                color: isRVCE
                  ? '#10b981'
                  : isCongested
                  ? '#f59e0b'
                  : '#38bdf8',
                fillColor: isRVCE
                  ? '#047857'
                  : isCongested
                  ? '#b45309'
                  : '#0284c7',
                fillOpacity: 0.9,
                weight: isRVCE ? 3 : 2,
              }}
            >
              <Tooltip
                key={`${node.id}-${isPermanent ? 'perm' : 'hover'}`}
                permanent={isPermanent}
                direction={tooltipDirection}
                offset={tooltipOffset}
                opacity={0.95}
                className="custom-map-tooltip font-sans"
              >
                <div className="text-[11px] font-semibold text-slate-100 flex items-center gap-1 whitespace-nowrap">
                  <span
                    className={
                      isRVCE
                        ? 'text-emerald-400 font-bold'
                        : isCongested
                        ? 'text-amber-300 font-bold'
                        : 'text-cyan-300 font-medium'
                    }
                  >
                    {node.name}
                  </span>
                  {isCongested && (
                    <span className="text-[9px] bg-amber-950 text-amber-300 px-1 py-0.5 rounded border border-amber-700/60 font-mono">
                      1.4x
                    </span>
                  )}
                </div>
              </Tooltip>

              <Popup>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-100 flex items-center justify-between">
                    <span>{node.name}</span>
                    <span className="text-[10px] font-mono text-cyan-400">#{node.id}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    GPS: {node.lat.toFixed(5)}, {node.lng.toFixed(5)}
                  </div>
                  {isRVCE && (
                    <div className="text-[11px] text-emerald-400 font-medium pt-1 border-t border-slate-800">
                      Primary Campus Hub · R.V. College of Engineering
                    </div>
                  )}
                  {isCongested && (
                    <div className="text-[11px] text-amber-400 font-medium pt-1 border-t border-slate-800 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-amber-400" />
                      Peak Traffic Bottleneck (1.4x distance penalty active)
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* 4. Picked Pickup Pin */}
        {pickedPickup && (
          <CircleMarker
            center={[pickedPickup.lat, pickedPickup.lng]}
            radius={8}
            pathOptions={{
              color: '#34d399',
              fillColor: '#10b981',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="text-[10px] font-bold text-emerald-400 font-mono">
                Pickup ({pickedPickup.lat.toFixed(4)}, {pickedPickup.lng.toFixed(4)})
              </span>
            </Tooltip>
          </CircleMarker>
        )}

        {/* 5. Picked Dropoff Pin */}
        {pickedDropoff && (
          <CircleMarker
            center={[pickedDropoff.lat, pickedDropoff.lng]}
            radius={8}
            pathOptions={{
              color: '#fb7185',
              fillColor: '#f43f5e',
              fillOpacity: 1,
              weight: 3,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="text-[10px] font-bold text-rose-400 font-mono">
                Drop-off ({pickedDropoff.lat.toFixed(4)}, {pickedDropoff.lng.toFixed(4)})
              </span>
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
};

export default MapCanvas;
