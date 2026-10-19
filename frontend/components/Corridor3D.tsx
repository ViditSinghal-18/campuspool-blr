'use client';

import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Billboard, Text, Line, Stars, Sparkles } from '@react-three/drei';
import * as THREE from 'three';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface CorridorStation {
  id: string;
  name?: string;
  lat: number;
  lng: number;
}

export interface CorridorEdge {
  from: string;
  to: string;
  trafficFactor?: number;
  source?: string;
  target?: string;
  [key: string]: unknown;
}

export interface Corridor3DProps {
  stations: CorridorStation[];
  edges?: CorridorEdge[];
  activeCorridorIds?: string[];
  className?: string;
}

// ─── Default Fallback Edges ───────────────────────────────────────────────────
const DEFAULT_EDGES: CorridorEdge[] = [
  { from: 'KENGERI', to: 'PATTANAGERE', trafficFactor: 1.0 },
  { from: 'PATTANAGERE', to: 'RVCE', trafficFactor: 1.0 },
  { from: 'RVCE', to: 'RR_NAGAR', trafficFactor: 1.0 },
  { from: 'RR_NAGAR', to: 'NAYANDAHALLI', trafficFactor: 1.0 },
  { from: 'NAYANDAHALLI', to: 'MYSORE_RD', trafficFactor: 1.4 },
  { from: 'MYSORE_RD', to: 'VIJAYANAGAR', trafficFactor: 1.0 },
  { from: 'VIJAYANAGAR', to: 'MAJESTIC', trafficFactor: 1.4 },
  { from: 'MAJESTIC', to: 'MG_ROAD', trafficFactor: 1.0 },
  { from: 'MG_ROAD', to: 'INDIRANAGAR', trafficFactor: 1.0 },
  { from: 'MAJESTIC', to: 'BANASHANKARI', trafficFactor: 1.4 },
  { from: 'VIJAYANAGAR', to: 'BANASHANKARI', trafficFactor: 1.0 },
  { from: 'NAYANDAHALLI', to: 'BANASHANKARI', trafficFactor: 1.0 },
  { from: 'RR_NAGAR', to: 'BANASHANKARI', trafficFactor: 1.0 },
  { from: 'RVCE', to: 'KENGERI', trafficFactor: 1.0 },
  { from: 'KENGERI', to: 'RR_NAGAR', trafficFactor: 1.0 },
];

// Stations with labels visible by default: RVCE, Kengeri, Nayandahalli, Majestic, Indiranagar
const DEFAULT_VISIBLE_STATION_IDS = new Set([
  'RVCE',
  'KENGERI',
  'NAYANDAHALLI',
  'MAJESTIC',
  'INDIRANAGAR',
]);

function isDefaultStation(id: string, name?: string): boolean {
  const normId = (id || '').toUpperCase();
  const normName = (name || '').toUpperCase();
  for (const key of DEFAULT_VISIBLE_STATION_IDS) {
    if (normId === key || normName.includes(key)) {
      return true;
    }
  }
  return false;
}

// ─── Animated Traveling Sphere Component ─────────────────────────────────────
function ActiveCorridorTraveler({ points }: { points: [number, number, number][] }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  // Smooth centripetal spline through corridor points
  const curve = useMemo(() => {
    if (points.length < 2) return null;
    const vectors = points.map((p) => new THREE.Vector3(p[0], p[1] + 0.1, p[2]));
    return new THREE.CatmullRomCurve3(vectors, false, 'centripetal');
  }, [points]);

  useFrame(({ clock }) => {
    if (!curve || !meshRef.current) return;
    // Loop along the corridor path every 4.5 seconds
    const progress = (clock.getElapsedTime() * 0.22) % 1;
    const position = curve.getPointAt(progress);
    meshRef.current.position.copy(position);

    if (glowRef.current) {
      glowRef.current.position.copy(position);
      const pulse = 1 + 0.25 * Math.sin(clock.getElapsedTime() * 6);
      glowRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  if (!curve) return null;

  return (
    <group>
      {/* Outer ambient glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshBasicMaterial color="#d4af37" transparent opacity={0.35} />
      </mesh>

      {/* Core glowing traveling sphere */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.18, 20, 20]} />
        <meshStandardMaterial
          color="#fef08a"
          emissive="#d4af37"
          emissiveIntensity={3.5}
          roughness={0.1}
          metalness={0.8}
        />
      </mesh>
    </group>
  );
}

// ─── Camera Drift: Slight sin() Wobble (~0.3 units) ──────────────────────────
function CameraDrift({ controlsRef }: { controlsRef: React.RefObject<any> }) {
  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    // A slight sin() wobble of about 0.3 units so the scene feels alive
    const wobbleY = Math.sin(t * 0.8) * 0.3;
    camera.position.y = 7.5 + wobbleY;
    if (controlsRef.current) {
      controlsRef.current.target.y = wobbleY * 0.35;
    }
  });
  return null;
}

// ─── 3D Network Graph Scene ───────────────────────────────────────────────────
function NetworkScene({
  stations,
  edges,
  activeCorridorIds,
}: {
  stations: CorridorStation[];
  edges: CorridorEdge[];
  activeCorridorIds: string[];
}) {
  const [hoveredStationId, setHoveredStationId] = useState<string | null>(null);

  // Convert 11 station lat/lng values to x/z positions:
  // Normalize around centroid, scale to about 10 units (-5 to +5)
  const { stationPositions, normalizedStations } = useMemo(() => {
    if (!stations || stations.length === 0) {
      return {
        stationPositions: new Map<string, [number, number, number]>(),
        normalizedStations: [],
      };
    }

    const cLat = stations.reduce((acc, s) => acc + s.lat, 0) / stations.length;
    const cLng = stations.reduce((acc, s) => acc + s.lng, 0) / stations.length;

    let maxDelta = 0.0001;
    for (const s of stations) {
      const dLat = Math.abs(s.lat - cLat);
      const dLng = Math.abs(s.lng - cLng);
      if (dLat > maxDelta) maxDelta = dLat;
      if (dLng > maxDelta) maxDelta = dLng;
    }

    // Scale factor to span ~10 units across the viewport
    const scaleFactor = 4.8 / maxDelta;

    const posMap = new Map<string, [number, number, number]>();
    const list: Array<{ id: string; name: string; pos: [number, number, number] }> = [];

    for (const s of stations) {
      // East = +x, North = -z (looking from front/top)
      const x = (s.lng - cLng) * scaleFactor;
      const y = 0;
      const z = -(s.lat - cLat) * scaleFactor;
      const pos: [number, number, number] = [x, y, z];
      posMap.set(s.id, pos);
      list.push({ id: s.id, name: s.name || s.id, pos });
    }

    return { stationPositions: posMap, normalizedStations: list };
  }, [stations]);

  // Points along the active corridor path
  const activePoints = useMemo(() => {
    if (!activeCorridorIds || activeCorridorIds.length < 2) return [];
    const pts: [number, number, number][] = [];
    for (const id of activeCorridorIds) {
      const p = stationPositions.get(id);
      if (p) {
        pts.push([p[0], p[1] + 0.03, p[2]]);
      }
    }
    return pts;
  }, [activeCorridorIds, stationPositions]);

  // List of resolved edge line coordinates
  const resolvedEdges = useMemo(() => {
    const list: Array<{
      key: string;
      points: [[number, number, number], [number, number, number]];
      trafficFactor: number;
    }> = [];

    const effectiveEdges = edges && edges.length > 0 ? edges : DEFAULT_EDGES;

    effectiveEdges.forEach((edge, idx) => {
      const fromId = edge.from || edge.source;
      const toId = edge.to || edge.target;
      if (!fromId || !toId) return;

      const p1 = stationPositions.get(fromId);
      const p2 = stationPositions.get(toId);
      if (p1 && p2) {
        list.push({
          key: `${fromId}-${toId}-${idx}`,
          points: [p1, p2],
          trafficFactor: edge.trafficFactor ?? 1.0,
        });
      }
    });

    return list;
  }, [edges, stationPositions]);

  return (
    <group>
      {/* ── 1. Thin Slate Edges / Amber if trafficFactor > 1 ── */}
      {resolvedEdges.map((e) => {
        const isCongested = e.trafficFactor > 1;
        return (
          <Line
            key={e.key}
            points={e.points}
            color={isCongested ? '#f59e0b' : '#64748b'}
            lineWidth={isCongested ? 2.2 : 1.2}
            transparent
            opacity={isCongested ? 0.9 : 0.55}
          />
        );
      })}

      {/* ── 2. Active Pool Shared Corridor: Thick Gold Line ── */}
      {activePoints.length >= 2 && (
        <>
          {/* Subtle gold glow backing */}
          <Line
            points={activePoints}
            color="#b45309"
            lineWidth={7.0}
            transparent
            opacity={0.35}
          />
          {/* Main thick gold line */}
          <Line
            points={activePoints}
            color="#d4af37"
            lineWidth={4.2}
            transparent
            opacity={0.98}
          />
        </>
      )}

      {/* ── 3. Traveling Glowing Sphere Along Active Corridor ── */}
      {activePoints.length >= 2 && <ActiveCorridorTraveler points={activePoints} />}

      {/* ── 4. 11 Transit Stations: Glowing Emerald Spheres with Glass Pills ── */}
      {normalizedStations.map((st) => {
        const isLabelVisible =
          isDefaultStation(st.id, st.name) || hoveredStationId === st.id;

        return (
          <group
            key={st.id}
            position={st.pos}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredStationId(st.id);
            }}
            onPointerOut={() => {
              setHoveredStationId(null);
            }}
          >
            {/* Outer soft emerald aura */}
            <mesh>
              <sphereGeometry args={[0.28, 16, 16]} />
              <meshBasicMaterial color="#10b981" transparent opacity={0.25} />
            </mesh>

            {/* Small glowing emerald core sphere */}
            <mesh>
              <sphereGeometry args={[0.18, 20, 20]} />
              <meshStandardMaterial
                color="#10b981"
                emissive="#10b981"
                emissiveIntensity={2.2}
                roughness={0.2}
                metalness={0.5}
              />
            </mesh>

            {/* Billboard text label */}
            <Billboard>
              <Text
                fontSize={0.32}
                color="#ffffff"
                outlineWidth={0.03}
                outlineColor="#050807"
                anchorY="bottom"
                position={[0, 0.5, 0]}
                fillOpacity={isLabelVisible ? 1 : 0}
                outlineOpacity={isLabelVisible ? 1 : 0}
              >
                {st.name}
              </Text>
            </Billboard>
          </group>
        );
      })}

      {/* ── 5. Ground Grid: Faint Slate Color (#1e293b) at 25% Opacity ── */}
      <gridHelper args={[18, 18, '#1e293b', '#1e293b']} position={[0, -0.05, 0]}>
        <lineBasicMaterial attach="material" color="#1e293b" transparent opacity={0.25} />
      </gridHelper>
    </group>
  );
}

const DEFAULT_EMPTY_EDGES: CorridorEdge[] = [];
const DEFAULT_ACTIVE_CORRIDOR_IDS: string[] = [
  'KENGERI',
  'RVCE',
  'RR_NAGAR',
  'NAYANDAHALLI',
  'MYSORE_RD',
  'MAJESTIC',
];

// ─── Main Exported Corridor3D Component ──────────────────────────────────────
export default function Corridor3D({
  stations,
  edges = DEFAULT_EMPTY_EDGES,
  activeCorridorIds = DEFAULT_ACTIVE_CORRIDOR_IDS,
  className = '',
}: Corridor3DProps) {
  const controlsRef = useRef<any>(null);

  // Wrap stations and edges arrays in useMemo so they are not re-created every render
  const memoizedStations = useMemo(() => stations, [stations]);
  const memoizedEdges = useMemo(() => edges, [edges]);

  return (
    <div
      className={`relative w-full h-[380px] sm:h-[460px] lg:h-[520px] rounded-3xl overflow-hidden shadow-2xl flex items-center justify-center ${className}`}
      style={{
        border: '1px solid rgba(0, 96, 57, 0.25)',
        background: 'transparent',
      }}
    >
      {/* 3D WebGL Canvas with transparent background */}
      <Canvas
        camera={{ position: [0, 7.5, 10.7], fov: 46 }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        gl={{ antialias: true, alpha: true }}
      >
        {/* Deep atmospheric fog matching obsidian background */}
        <fog attach="fog" args={['#050807', 12, 30]} />

        {/* Ambient & Starfield Environment */}
        <ambientLight intensity={0.9} />
        <directionalLight position={[10, 15, 10]} intensity={1.2} color="#ffffff" />
        <pointLight position={[-10, 8, -10]} intensity={1.0} color="#006039" />
        <pointLight position={[10, -5, 10]} intensity={0.8} color="#d4af37" />

        {/* Starfield & Golden Sparkles */}
        <Stars radius={60} depth={40} count={800} factor={3} fade speed={1} />
        <Sparkles count={80} scale={14} size={2} speed={0.4} color="#d4af37" />

        {/* 3D Spatial Corridor Network */}
        <NetworkScene
          stations={memoizedStations}
          edges={memoizedEdges}
          activeCorridorIds={activeCorridorIds}
        />

        {/* Camera Drift using useFrame (sin() wobble of ~0.3 units) */}
        <CameraDrift controlsRef={controlsRef} />

        {/* Orbit Controls with 35 degree tilt constraint and autoRotate */}
        <OrbitControls
          ref={controlsRef}
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={0.6}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={Math.PI / 8}
        />
      </Canvas>

      {/* Top HUD Badge */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col gap-1.5">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono font-medium backdrop-blur-md"
          style={{
            background: 'rgba(5,8,7,0.75)',
            border: '1px solid rgba(212,175,55,0.35)',
            color: 'var(--gold)',
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span>3D SPATIAL CORRIDOR · 35° PERSPECTIVE</span>
        </div>
        <div className="text-[11px] font-mono text-emerald-400/90 pl-1">
          {stations?.length || 11} Stations · Active Pool Corridor Highlighted
        </div>
      </div>

      {/* Interactive Drag Prompt */}
      <div className="pointer-events-none absolute bottom-4 inset-x-0 z-20 flex justify-center">
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[10px] font-mono backdrop-blur-md"
          style={{
            background: 'rgba(5,8,7,0.75)',
            border: '1px solid rgba(90,107,96,0.3)',
            color: 'var(--ivory-dim)',
          }}
        >
          <span>🖱️ Click &amp; Drag to Orbit · 35° Tilt · Auto-Rotate 0.6×</span>
        </div>
      </div>
    </div>
  );
}
