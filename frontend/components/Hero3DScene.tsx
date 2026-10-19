'use client';

import React, { useRef, useMemo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Float, Sphere, Line } from '@react-three/drei';
import * as THREE from 'three';

// ─── 11 Bengaluru Transit Hubs mapped to 3D Sphere Coordinates ───────────────
interface Hub3D {
  id: string;
  name: string;
  pos: [number, number, number];
  isHub: boolean;
  color: string;
}

const HUBS_3D: Hub3D[] = [
  { id: 'KENGERI',      name: 'Kengeri',      pos: [-1.45, -0.65, 1.15], isHub: false, color: '#34d399' },
  { id: 'PATTANAGERE',  name: 'Pattanagere',  pos: [-1.25, -0.42, 1.35], isHub: false, color: '#38bdf8' },
  { id: 'RVCE',         name: 'RVCE Campus',  pos: [-0.95, -0.15, 1.65], isHub: true,  color: '#10b981' },
  { id: 'NAYANDAHALLI', name: 'Nayandahalli', pos: [-0.55,  0.22, 1.82], isHub: false, color: '#34d399' },
  { id: 'MYSORE_RD',    name: 'Mysore Rd',    pos: [-0.15,  0.45, 1.88], isHub: false, color: '#d4af37' },
  { id: 'VIJAYANAGAR',  name: 'Vijayanagar',  pos: [-0.22,  0.92, 1.68], isHub: false, color: '#38bdf8' },
  { id: 'MAJESTIC',     name: 'Majestic',     pos: [ 0.45,  1.05, 1.55], isHub: true,  color: '#d4af37' },
  { id: 'MG_ROAD',      name: 'MG Road',      pos: [ 1.05,  0.88, 1.35], isHub: false, color: '#38bdf8' },
  { id: 'INDIRANAGAR',  name: 'Indiranagar',  pos: [ 1.55,  0.68, 1.05], isHub: false, color: '#10b981' },
  { id: 'BANASHANKARI', name: 'Banashankari', pos: [ 0.35, -0.72, 1.72], isHub: false, color: '#34d399' },
  { id: 'JAYANAGAR',    name: 'Jayanagar',    pos: [ 0.75, -0.38, 1.75], isHub: false, color: '#d4af37' },
];

// Corridor connections
const CORRIDOR_EDGES: [string, string, string][] = [
  ['KENGERI', 'PATTANAGERE', '#10b981'],
  ['PATTANAGERE', 'RVCE', '#10b981'],
  ['RVCE', 'NAYANDAHALLI', '#10b981'],
  ['NAYANDAHALLI', 'MYSORE_RD', '#d4af37'],
  ['MYSORE_RD', 'VIJAYANAGAR', '#38bdf8'],
  ['VIJAYANAGAR', 'MAJESTIC', '#d4af37'],
  ['MAJESTIC', 'MG_ROAD', '#d4af37'],
  ['MG_ROAD', 'INDIRANAGAR', '#10b981'],
  ['NAYANDAHALLI', 'BANASHANKARI', '#34d399'],
  ['BANASHANKARI', 'JAYANAGAR', '#d4af37'],
  ['JAYANAGAR', 'MAJESTIC', '#d4af37'],
  ['RVCE', 'BANASHANKARI', '#10b981'],
];

// ─── Animated Hub Sphere ─────────────────────────────────────────────────────
function HubNode({
  hub,
  onHover,
}: {
  hub: Hub3D;
  onHover: (name: string | null) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (meshRef.current) {
      const scale = hub.isHub ? 1 + 0.18 * Math.sin(t * 3) : 1 + 0.08 * Math.sin(t * 2 + hub.pos[0]);
      meshRef.current.scale.set(scale, scale, scale);
    }
    if (glowRef.current && hub.isHub) {
      const scale = 1.35 + 0.25 * Math.sin(t * 3);
      glowRef.current.scale.set(scale, scale, scale);
    }
  });

  return (
    <group position={hub.pos}>
      {/* Outer soft glow sphere */}
      {hub.isHub && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[0.09, 16, 16]} />
          <meshBasicMaterial color={hub.color} transparent opacity={0.25} />
        </mesh>
      )}

      {/* Core Node */}
      <mesh
        ref={meshRef}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(hub.name);
        }}
        onPointerOut={() => onHover(null)}
      >
        <sphereGeometry args={[hub.isHub ? 0.065 : 0.045, 16, 16]} />
        <meshStandardMaterial
          color={hub.color}
          emissive={hub.color}
          emissiveIntensity={hub.isHub ? 1.4 : 0.8}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}

// ─── Floating Starfield Dust Particles ───────────────────────────────────────
function FloatingParticles({ count = 48 }: { count?: number }) {
  const points = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 2.4 + Math.random() * 1.5;
      pts.push([
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      ]);
    }
    return pts;
  }, [count]);

  const groupRef = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.getElapsedTime() * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      {points.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.016, 8, 8]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? '#d4af37' : '#10b981'}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Interactive Constellation Scene ────────────────────────────────────────
function ConstellationScene({
  onHoverHub,
}: {
  onHoverHub: (name: string | null) => void;
}) {
  const hubMap = useMemo(() => {
    const map = new Map<string, Hub3D>();
    HUBS_3D.forEach((h) => map.set(h.id, h));
    return map;
  }, []);

  return (
    <Float speed={1.2} rotationIntensity={0.2} floatIntensity={0.35}>
      <group>
        {/* Dark inner globe */}
        <Sphere args={[1.98, 32, 32]}>
          <meshStandardMaterial
            color="#050807"
            roughness={0.9}
            metalness={0.15}
          />
        </Sphere>

        {/* Emerald wireframe spatial mesh */}
        <Sphere args={[2.0, 26, 26]}>
          <meshBasicMaterial
            wireframe
            color="#006039"
            transparent
            opacity={0.22}
          />
        </Sphere>

        {/* Equatorial accent latitude ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[2.08, 2.095, 64]} />
          <meshBasicMaterial color="#d4af37" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>

        {/* Angled orbital ring */}
        <mesh rotation={[Math.PI / 3.5, Math.PI / 4, 0]}>
          <ringGeometry args={[2.22, 2.235, 64]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.22} side={THREE.DoubleSide} />
        </mesh>

        {/* Connecting Energy Corridor Lines */}
        {CORRIDOR_EDGES.map(([srcId, dstId, color], i) => {
          const src = hubMap.get(srcId);
          const dst = hubMap.get(dstId);
          if (!src || !dst) return null;
          return (
            <Line
              key={i}
              points={[src.pos, dst.pos]}
              color={color}
              lineWidth={1.8}
              transparent
              opacity={0.7}
            />
          );
        })}

        {/* 11 Bengaluru Transit Hub Nodes */}
        {HUBS_3D.map((hub) => (
          <HubNode key={hub.id} hub={hub} onHover={onHoverHub} />
        ))}

        {/* Floating atmospheric particles */}
        <FloatingParticles count={50} />
      </group>
    </Float>
  );
}

// ─── Main Exported Hero3DScene Component ──────────────────────────────────────
export default function Hero3DScene() {
  const [hoveredHub, setHoveredHub] = useState<string | null>(null);

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] lg:h-[520px] rounded-3xl overflow-hidden glass shadow-2xl flex items-center justify-center" style={{ border: '1px solid rgba(0,96,57,0.3)', background: 'radial-gradient(circle at center, rgba(0,96,57,0.12) 0%, rgba(5,8,7,0.85) 75%)' }}>
      {/* 3D WebGL Canvas */}
      <Canvas
        camera={{ position: [0, 0.4, 4.4], fov: 48 }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.8} />
        <pointLight position={[10, 10, 10]} intensity={1.8} color="#d4af37" />
        <pointLight position={[-10, -8, -10]} intensity={1.2} color="#006039" />
        <directionalLight position={[0, 8, 4]} intensity={0.6} color="#ffffff" />

        <ConstellationScene onHoverHub={setHoveredHub} />

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={1.0}
          rotateSpeed={0.8}
        />
      </Canvas>

      {/* Floating interactive HUD / Badge */}
      <div className="pointer-events-none absolute top-4 left-4 z-20 flex flex-col gap-1.5">
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono font-medium backdrop-blur-md" style={{ background: 'rgba(5,8,7,0.75)', border: '1px solid rgba(212,175,55,0.35)', color: 'var(--gold)' }}>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          <span>3D SPATIAL GRAPH · BENGALURU</span>
        </div>
        <div className="text-[11px] font-mono text-emerald-400/90 pl-1">
          {hoveredHub ? `✦ Station: ${hoveredHub}` : '11 Transit Hubs · 15 Corridors Active'}
        </div>
      </div>

      {/* Interactive prompt at bottom */}
      <div className="pointer-events-none absolute bottom-4 inset-x-0 z-20 flex justify-center">
        <div className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-[10px] font-mono backdrop-blur-md" style={{ background: 'rgba(5,8,7,0.8)', border: '1px solid rgba(90,107,96,0.3)', color: 'var(--ivory-dim)' }}>
          <span>🖱️ Click &amp; Drag to Rotate 3D Constellation</span>
        </div>
      </div>
    </div>
  );
}
