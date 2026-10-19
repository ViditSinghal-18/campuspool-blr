'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { motion, useScroll, useTransform, useInView, useReducedMotion } from 'framer-motion';
import { usePool } from '../context/PoolContext';
import { ArrowRight, MapPin, Users, Zap, TrendingDown, ExternalLink, Compass, ShieldCheck, Sparkles } from 'lucide-react';
import TiltCard3D from '../components/TiltCard3D';

// ─── 3D WebGL Corridor Scene (Dynamic import for zero SSR issues) ────────────
const Corridor3D = dynamic(() => import('../components/Corridor3D'), {
  ssr: false,
  loading: () => (
    <div
      className="relative w-full h-[380px] sm:h-[460px] lg:h-[520px] rounded-3xl overflow-hidden glass shadow-2xl flex flex-col items-center justify-center text-center p-6"
      style={{
        border: '1px solid rgba(0,96,57,0.3)',
        background: 'radial-gradient(circle at center, rgba(0,96,57,0.15) 0%, rgba(5,8,7,0.9) 75%)',
      }}
    >
      <div className="h-10 w-10 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin mb-4" />
      <span className="font-mono text-xs uppercase tracking-widest text-emerald-400">
        Initializing 3D Corridor Network…
      </span>
      <span className="font-mono text-[11px] text-slate-500 mt-1">
        11 Bengaluru Stations · 35° Tilt
      </span>
    </div>
  ),
});

// ─── Fixed Full-Screen Parallax Background Layer ─────────────────────────────
function ParallaxBackground() {
  const { scrollY } = useScroll();
  const shouldReduceMotion = useReducedMotion();

  // Moves slowly: ~15% of scroll speed (0 to 1000px scroll -> 0 to 150px shift)
  const backgroundY = useTransform(
    scrollY,
    [0, 1000],
    [0, shouldReduceMotion ? 0 : 150]
  );

  return (
    <div
      className="fixed inset-0 -z-30 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <motion.div
        style={{ y: backgroundY }}
        className="absolute -top-[20%] -left-[5%] w-[110%] h-[140%]"
      >
        <img
          src="/images/corridor-2.jpg"
          alt=""
          className="h-full w-full object-cover filter blur-[2px] scale-105"
        />
        {/* Dark overlay (bg-black/80) */}
        <div className="absolute inset-0 bg-black/80" />
      </motion.div>
    </div>
  );
}

// ─── Pedestal Counter (Scroll In View + prefers-reduced-motion) ───────────────
function Pedestal({
  value,
  label,
  suffix = '',
  color = '#fbbf24',
}: {
  value: number;
  label: string;
  suffix?: string;
  color?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-20px' });
  const shouldReduceMotion = useReducedMotion();
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    if (shouldReduceMotion) {
      setDisplayed(value);
      return;
    }

    if (value === 0) {
      setDisplayed(0);
      return;
    }

    let start = 0;
    const duration = 1200;
    const steps = 36;
    const stepTime = duration / steps;
    const increment = value / steps;

    const timer = setInterval(() => {
      start += increment;
      if (start >= value) {
        setDisplayed(value);
        clearInterval(timer);
      } else {
        setDisplayed(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [isInView, value, shouldReduceMotion]);

  return (
    <div
      ref={ref}
      className={`glass flex flex-col items-center justify-center rounded-2xl px-6 py-5 ${shouldReduceMotion ? '' : 'animate-float'
        }`}
      style={{ border: '1px solid rgba(212,175,55,0.25)', minWidth: 135 }}
    >
      <span
        className="font-serif text-3xl font-bold text-amber-400"
        style={color ? { color } : undefined}
      >
        {displayed.toLocaleString()}
        {suffix}
      </span>
      <span
        className="mt-1 text-[11px] uppercase tracking-widest"
        style={{ color: 'var(--ivory-dim)' }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Featured Corridors Data ──────────────────────────────────────────────────
const FEATURED_CORRIDORS = [
  {
    id: 'corridor-majestic',
    title: 'RVCE → Majestic Metro Spine',
    tag: 'Purple Line Arterial · 14.8 km',
    savings: 'Up to 58% Fare Saved',
    color: '#10b981',
    image: '/images/corridor-1.jpg',
    route: ['KENGERI', 'RVCE', 'NAYANDAHALLI', 'MYSORE_RD', 'MAJESTIC'],
    description: 'The core transit corridor for RVCE commuters heading to Bangalore City Railway & Majestic Bus Terminus. High-density en-route interval matching guarantees instant pairing.',
    link: '/pools',
  },
  {
    id: 'corridor-tech',
    title: 'MG Road & Indiranagar Tech Corridor',
    tag: 'CBD & Tech Hub · 19.2 km',
    savings: 'Express Carpooling',
    color: '#d4af37',
    image: '/images/corridor-2.jpg',
    route: ['RVCE', 'MAJESTIC', 'MG_ROAD', 'INDIRANAGAR'],
    description: 'Direct east-bound transit connection linking RVCE engineering students with Bangalore’s premier startup district, coworking spaces, and metro stations with transparent split billing.',
    link: '/book',
  },
  {
    id: 'corridor-rain',
    title: 'Smart Rain & Peak Traffic Routing',
    tag: 'Dynamic Surge Mitigation',
    savings: '1.4× Dijkstra Re-route',
    color: '#38bdf8',
    image: '/images/corridor-3.jpg',
    route: ['RVCE', 'NAYANDAHALLI', 'BANASHANKARI', 'JAYANAGAR'],
    description: 'Live Bengaluru weather telemetry from Open-Meteo dynamically triggers rain multipliers. Dijkstra calculates alternative southern bypass routes to avoid clogged choke points.',
    link: '/radar',
  },
];

// ─── Main Hero Page ───────────────────────────────────────────────────────────
export default function HomePage() {
  const {
    nodes,
    clusters,
    requests,
    weather,
    isBackendLive,
    handleSeed,
    isSeeding,
    peakMode,
    selectedCluster,
  } = usePool();

  const [corridorErrors, setCorridorErrors] = useState<Record<string, boolean>>({});

  const shouldReduceMotion = useReducedMotion();
  const sectionMotionProps = shouldReduceMotion
    ? {}
    : {
      initial: { opacity: 0, y: 40 },
      whileInView: { opacity: 1, y: 0 },
      viewport: { once: true },
      transition: { duration: 0.7 },
    };

  const matchedClusters = clusters.filter((c) => c.riders.length >= 2);
  const totalSaved = matchedClusters.reduce(
    (acc, c) => acc + (c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length),
    0,
  );
  const avgSavings = matchedClusters.length
    ? Math.round(matchedClusters.reduce((a, c) => a + c.savingsPercentage, 0) / matchedClusters.length)
    : 0;

  // 15 Bengaluru transit corridor edges mapped to trafficFactor from PoolContext
  const CONGESTED_NODES = useMemo(() => new Set(['NAYANDAHALLI', 'MYSORE_RD', 'MAJESTIC']), []);
  const corridorEdges = useMemo(() => {
    const rawEdges: Array<[string, string]> = [
      ['KENGERI', 'PATTANAGERE'],
      ['PATTANAGERE', 'RVCE'],
      ['RVCE', 'RR_NAGAR'],
      ['RR_NAGAR', 'NAYANDAHALLI'],
      ['NAYANDAHALLI', 'MYSORE_RD'],
      ['MYSORE_RD', 'VIJAYANAGAR'],
      ['VIJAYANAGAR', 'MAJESTIC'],
      ['MAJESTIC', 'MG_ROAD'],
      ['MG_ROAD', 'INDIRANAGAR'],
      ['MAJESTIC', 'BANASHANKARI'],
      ['VIJAYANAGAR', 'BANASHANKARI'],
      ['NAYANDAHALLI', 'BANASHANKARI'],
      ['RR_NAGAR', 'BANASHANKARI'],
      ['RVCE', 'KENGERI'],
      ['KENGERI', 'RR_NAGAR'],
    ];

    return rawEdges.map(([from, to]) => {
      const isPeakCongested = peakMode && (CONGESTED_NODES.has(from) || CONGESTED_NODES.has(to));
      const rainSurge = (weather?.precipitationMm ?? 0) > 0 || !!weather?.isRaining;
      const trafficFactor = isPeakCongested ? 1.4 : rainSurge ? (weather?.recommendedSurgeMultiplier ?? 1.25) : 1.0;
      return {
        from,
        to,
        trafficFactor,
      };
    });
  }, [peakMode, weather, CONGESTED_NODES]);

  // Active pool corridor node IDs from selectedCluster or first matched cluster
  const activeCorridorIds = useMemo(() => {
    if (selectedCluster?.sharedCorridorNodeIds?.length) {
      return selectedCluster.sharedCorridorNodeIds;
    }
    const matched = clusters.find((c) => c.riders.length >= 2);
    if (matched?.sharedCorridorNodeIds?.length) {
      return matched.sharedCorridorNodeIds;
    }
    if (clusters[0]?.sharedCorridorNodeIds?.length) {
      return clusters[0].sharedCorridorNodeIds;
    }
    return ['KENGERI', 'RVCE', 'RR_NAGAR', 'NAYANDAHALLI', 'MYSORE_RD', 'MAJESTIC'];
  }, [selectedCluster, clusters]);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden ambient-emerald"
      style={{ paddingTop: '3.5rem' }}
    >
      {/* ── Fixed Full-Screen Parallax Background Layer ── */}
      <ParallaxBackground />

      {/* Ambient radial spotlights */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-40 left-1/4 h-[600px] w-[600px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, rgba(0,96,57,0.4) 0%, transparent 70%)' }}
        />
        <div
          className="absolute top-1/3 right-1/4 h-[400px] w-[400px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-screen-xl px-4 pt-10 sm:pt-16 pb-20">
        {/* ── Section 1: Split-Screen Hero Section (Headline + Interactive 3D WebGL Canvas) ── */}
        <motion.section
          {...sectionMotionProps}
          className="grid lg:grid-cols-12 gap-10 lg:gap-8 items-center mb-16"
        >
          {/* Left Column: Headline & Action Buttons */}
          <div className="lg:col-span-6 flex flex-col items-start text-left">
            <div
              className="mb-4 inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium backdrop-blur-md"
              style={{
                background: 'rgba(0,96,57,0.22)',
                border: '1px solid rgba(0,96,57,0.45)',
                color: 'var(--emerald-soft)',
              }}
            >
              <span className="mr-2 animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {isBackendLive ? 'Connected to Spring Boot API' : 'Running client-side simulation'}
              {weather && ` · ${weather.temperatureC.toFixed(1)}°C Bengaluru`}
            </div>

            <h1
              className="font-serif text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight"
              style={{ color: 'var(--ivory)' }}
            >
              Smart Rides for{' '}
              <span className="shimmer-text">
                RVCE Students
              </span>
            </h1>

            <p
              className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed"
              style={{ color: 'var(--ivory-dim)' }}
            >
              Graph-powered Dijkstra routing + en-route interval matching across the
              Bengaluru Purple Metro Corridor — split fares, eliminate peak surge, and travel together.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/book"
                className="btn-gold flex items-center gap-2 rounded-full px-7 py-3 text-xs uppercase tracking-wider font-semibold shadow-lg"
              >
                Book a Ride
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/pools"
                className="btn-emerald flex items-center gap-2 rounded-full px-7 py-3 text-xs uppercase tracking-wider font-semibold"
              >
                <Users size={14} />
                Browse Pools
              </Link>
              <button
                onClick={handleSeed}
                disabled={isSeeding}
                className="flex items-center gap-2 rounded-full px-6 py-3 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:opacity-85 disabled:opacity-50"
                style={{
                  background: 'rgba(90,107,96,0.18)',
                  border: '1px solid rgba(90,107,96,0.3)',
                  color: 'var(--ivory-dim)',
                }}
              >
                <Zap size={13} className="text-amber-400" />
                {isSeeding ? 'Simulating…' : 'Simulate 15'}
              </button>
            </div>

            {/* Micro Highlights */}
            <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-mono" style={{ color: 'var(--slate-light)' }}>
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={13} className="text-emerald-400" />
                @rvce.edu.in Verified
              </span>
              <span className="flex items-center gap-1.5">
                <Compass size={13} className="text-amber-400" />
                15-Min Dynamic Interval
              </span>
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-cyan-400" />
                Real Curving OSRM Paths
              </span>
            </div>
          </div>

          {/* Right Column: Live Interactive 3D WebGL Corridor Scene */}
          <div className="lg:col-span-6 w-full">
            <Corridor3D
              stations={nodes}
              edges={corridorEdges}
              activeCorridorIds={activeCorridorIds}
            />
          </div>
        </motion.section>

        {/* ── Section 2: Floating 3D Showcase Card ── */}
        <motion.section
          {...sectionMotionProps}
          className="mt-8 flex justify-center"
        >
          <TiltCard3D
            maxTilt={8}
            glareColor="rgba(0,96,57,0.22)"
            className="glass rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-mono" style={{ color: 'var(--gold-dim)' }}>
                  Live Algorithm Status
                </div>
                <h2 className="font-serif text-2xl font-semibold mt-1" style={{ color: 'var(--ivory)' }}>
                  Bengaluru Graph Engine
                </h2>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
                style={{
                  background: isBackendLive ? 'rgba(16,185,129,0.15)' : 'rgba(212,175,55,0.12)',
                  border: `1px solid ${isBackendLive ? 'rgba(16,185,129,0.4)' : 'rgba(212,175,55,0.3)'}`,
                  color: isBackendLive ? 'var(--emerald-glow)' : 'var(--gold)',
                }}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isBackendLive ? 'bg-emerald-400 animate-pulse-dot' : 'bg-yellow-400'}`} />
                {isBackendLive ? 'Live API' : 'Fallback Engine'}
              </div>
            </div>

            <div className="divider-gold mb-6" />

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Active Commuters', val: requests.length, suffix: '', icon: <Users size={14} /> },
                { label: 'Matched Pools', val: matchedClusters.length, suffix: '', icon: <MapPin size={14} /> },
                { label: 'Fare Saved', val: Math.round(totalSaved), suffix: '₹', icon: <TrendingDown size={14} /> },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(0,96,57,0.08)', border: '1px solid rgba(0,96,57,0.15)' }}>
                  <div className="flex justify-center mb-1" style={{ color: 'var(--emerald-glow)' }}>{s.icon}</div>
                  <div className="font-serif text-xl font-bold" style={{ color: 'var(--ivory)' }}>{s.suffix}{s.val.toLocaleString()}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Dijkstra path sample */}
            {matchedClusters[0] && (
              <div className="mt-5 rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(90,107,96,0.2)' }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--gold-dim)' }}>
                  Sample Dijkstra Corridor
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {matchedClusters[0].sharedCorridorNodeIds.map((nodeId, i) => (
                    <span key={nodeId} className="flex items-center gap-1">
                      {i > 0 && <span style={{ color: 'var(--emerald-deep)' }}>→</span>}
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-mono" style={{ background: 'rgba(0,96,57,0.2)', color: 'var(--emerald-soft)' }}>
                        {nodeId}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs" style={{ color: 'var(--ivory-dim)' }}>
                  {matchedClusters[0].riders.length} riders · {matchedClusters[0].sharedDistanceKm.toFixed(1)} km shared · ₹{Math.round(matchedClusters[0].discountedFarePerPersonRs)}/person
                  {avgSavings > 0 && <span style={{ color: 'var(--emerald-glow)' }}> · ~{avgSavings}% avg savings</span>}
                </div>
              </div>
            )}

            {matchedClusters.length === 0 && (
              <div className="mt-4 rounded-xl px-4 py-3 text-center text-sm" style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--ivory-dim)' }}>
                Click <strong>Simulate 15</strong> above to run Dijkstra interval matching live.
              </div>
            )}
          </TiltCard3D>
        </motion.section>

        {/* ── Section 3: Floating Pedestals (High-Visibility Bright Stats) ── */}
        <motion.section
          {...sectionMotionProps}
          className="mt-16 flex flex-wrap justify-center gap-6"
        >
          <Pedestal value={11} label="Transit Hubs" color="#34d399" />
          <Pedestal value={15} label="Raw Edges" color="#fbbf24" />
          <Pedestal value={matchedClusters.length || 0} label="Live Pools" color="#34d399" />
          <Pedestal value={Math.round(totalSaved)} label="₹ Saved" color="#fbbf24" suffix="" />
        </motion.section>

        {/* ── Section 4: Featured Bengaluru Corridors Visual Photo Showcase ── */}
        <motion.section
          {...sectionMotionProps}
          className="mt-24"
        >
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.3em] font-mono mb-3" style={{ color: 'var(--gold-dim)' }}>
              Transit Corridors · Real Bengaluru Geometry
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold" style={{ color: 'var(--ivory)' }}>
              Featured Bengaluru Corridors
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-sm" style={{ color: 'var(--ivory-dim)' }}>
              Optimized travel corridors along Purple Line metro stations, connecting RVCE students with high-demand destinations across Bengaluru.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURED_CORRIDORS.map((corridor) => (
              <TiltCard3D
                key={corridor.id}
                maxTilt={12}
                glareColor={`${corridor.color}25`}
                className="glass rounded-2xl flex flex-col overflow-hidden h-full border transition-all duration-300 hover:border-[rgba(0,96,57,0.5)]"
                style={{ border: '1px solid rgba(90,107,96,0.25)' }}
              >
                {/* Photo Header: h-48 with object-cover and dark gradient overlay */}
                <div
                  className="relative h-48 w-full overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #006039 0%, #050807 100%)' }}
                >
                  {corridorErrors[corridor.id] ? (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-[#006039] to-[#050807]">
                      <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">
                        {corridor.title}
                      </span>
                    </div>
                  ) : (
                    <img
                      src={corridor.image}
                      alt={corridor.title}
                      className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                      onError={() =>
                        setCorridorErrors((prev) => ({ ...prev, [corridor.id]: true }))
                      }
                    />
                  )}
                  {/* Dark gradient overlay (from-black/70 to-transparent) so text stays readable */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent pointer-events-none" />

                  {/* Top Badge */}
                  <div
                    className="absolute top-3 left-3 rounded-full px-2.5 py-1 text-[10px] font-mono font-medium backdrop-blur-md shadow-md"
                    style={{ background: 'rgba(5,8,7,0.85)', border: `1px solid ${corridor.color}60`, color: corridor.color }}
                  >
                    {corridor.tag}
                  </div>

                  {/* Savings pill */}
                  <div
                    className="absolute bottom-2.5 right-3 rounded-full px-2.5 py-1 text-[10px] font-mono font-semibold backdrop-blur-md shadow-md"
                    style={{ background: 'rgba(5,8,7,0.9)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.15)' }}
                  >
                    {corridor.savings}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-white">
                      {corridor.title}
                    </h3>

                    {/* Route badges */}
                    <div className="flex flex-wrap items-center gap-1 my-3">
                      {corridor.route.map((node, nIdx) => (
                        <span key={node} className="flex items-center gap-1">
                          {nIdx > 0 && <span className="text-[10px] text-emerald-400 font-bold">→</span>}
                          <span
                            className="rounded px-1.5 py-0.5 text-[9px] font-mono font-semibold"
                            style={{ background: 'rgba(0,96,57,0.3)', color: '#34d399', border: '1px solid rgba(0,96,57,0.45)' }}
                          >
                            {node}
                          </span>
                        </span>
                      ))}
                    </div>

                    <p className="text-xs leading-relaxed text-slate-300">
                      {corridor.description}
                    </p>
                  </div>

                  <Link
                    href={corridor.link}
                    className="mt-5 inline-flex items-center justify-between w-full rounded-xl py-2.5 px-4 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-90 shadow-md"
                    style={{
                      background: `${corridor.color}20`,
                      border: `1px solid ${corridor.color}50`,
                      color: corridor.color,
                    }}
                  >
                    <span>Explore Corridor</span>
                    <ArrowRight size={12} />
                  </Link>
                </div>
              </TiltCard3D>
            ))}
          </div>
        </motion.section>

        {/* ── Section 5: How It Works ── */}
        <motion.section
          {...sectionMotionProps}
          className="mt-28"
        >
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.3em] font-mono mb-3" style={{ color: 'var(--gold-dim)' }}>
              How It Works
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold" style={{ color: 'var(--ivory)' }}>
              Three steps to a smarter commute
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <TiltCard3D maxTilt={10} glareColor="rgba(16,185,129,0.2)">
              <Link href="/book" className="block glass group rounded-2xl p-6 h-full transition-all hover:border-[rgba(0,96,57,0.6)]" style={{ border: '1px solid rgba(90,107,96,0.25)' }}>
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg, var(--emerald-deep), var(--emerald-mid))' }}
                  >
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--gold-dim)' }}>
                      Step 01
                    </div>
                    <h3 className="font-serif text-lg font-semibold mt-0.5" style={{ color: 'var(--ivory)' }}>
                      Book Your Ride
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ivory-dim)' }}>
                      Drop your GPS coordinates or select your nearest station. Haversine snapping automatically binds you to the optimal metro node.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-emerald-400 group-hover:translate-x-1 transition-transform">
                  <span>Open Ride Form</span>
                  <ArrowRight size={12} />
                </div>
              </Link>
            </TiltCard3D>

            <TiltCard3D maxTilt={10} glareColor="rgba(212,175,55,0.2)">
              <Link href="/pools" className="block glass group rounded-2xl p-6 h-full transition-all hover:border-[rgba(212,175,55,0.5)]" style={{ border: '1px solid rgba(90,107,96,0.25)' }}>
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg, #b45309, #d4af37)' }}
                  >
                    <Users size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--gold-dim)' }}>
                      Step 02
                    </div>
                    <h3 className="font-serif text-lg font-semibold mt-0.5" style={{ color: 'var(--ivory)' }}>
                      Match a Pool
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ivory-dim)' }}>
                      Dijkstra finds the cheapest shared corridor. Our interval-overlap engine clusters commuters departing within 15 minutes of each other.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-amber-400 group-hover:translate-x-1 transition-transform">
                  <span>Explore Pools</span>
                  <ArrowRight size={12} />
                </div>
              </Link>
            </TiltCard3D>

            <TiltCard3D maxTilt={10} glareColor="rgba(56,189,248,0.2)">
              <Link href="/radar" className="block glass group rounded-2xl p-6 h-full transition-all hover:border-[rgba(56,189,248,0.5)]" style={{ border: '1px solid rgba(90,107,96,0.25)' }}>
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                    style={{ background: 'linear-gradient(135deg, #0369a1, #38bdf8)' }}
                  >
                    <Zap size={18} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--gold-dim)' }}>
                      Step 03
                    </div>
                    <h3 className="font-serif text-lg font-semibold mt-0.5" style={{ color: 'var(--ivory)' }}>
                      Radar Live View
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ivory-dim)' }}>
                      Watch real Bengaluru curving street geometry on our live Leaflet map. Toggle 1.4× peak traffic mode to observe dynamic recalculations.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1 text-xs font-medium text-sky-400 group-hover:translate-x-1 transition-transform">
                  <span>Open Live Radar</span>
                  <ArrowRight size={12} />
                </div>
              </Link>
            </TiltCard3D>
          </div>
        </motion.section>

        {/* ── Section 6: Footer ── */}
        <motion.section
          {...sectionMotionProps}
          className="mt-24"
        >
          <div className="divider-gold" />
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs" style={{ color: 'var(--slate-light)' }}>
            <span>© 2026 CampusPool BLR · RVCE CSE · Bengaluru, Karnataka</span>
            <div className="flex items-center gap-4">
              <a
                href="http://localhost:8080/swagger-ui.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                style={{ color: 'var(--emerald-glow)' }}
              >
                <ExternalLink size={11} />
                OpenAPI Docs
              </a>
              <Link href="/radar" className="hover:opacity-80 transition-opacity" style={{ color: 'var(--gold)' }}>
                Live Radar →
              </Link>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
