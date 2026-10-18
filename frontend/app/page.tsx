'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePool } from '../context/PoolContext';
import { ArrowRight, MapPin, Users, Zap, TrendingDown, ExternalLink } from 'lucide-react';

// ─── 3D Mouse-Tilt Hook ────────────────────────────────────────────────────────
function useTilt(strength = 15) {
  const ref = useRef<HTMLDivElement>(null);
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${x * strength}deg) rotateX(${-y * strength}deg) scale(1.03)`;
  };
  const onMouseLeave = () => {
    if (ref.current) ref.current.style.transform = 'perspective(900px) rotateY(0deg) rotateX(0deg) scale(1)';
  };
  return { ref, onMouseMove, onMouseLeave };
}

// ─── Pedestal Counter ─────────────────────────────────────────────────────────
function Pedestal({
  value,
  label,
  suffix = '',
  color = 'var(--emerald-glow)',
}: {
  value: number;
  label: string;
  suffix?: string;
  color?: string;
}) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = value / 40;
    const timer = setInterval(() => {
      start += step;
      if (start >= value) { setDisplayed(value); clearInterval(timer); }
      else setDisplayed(Math.floor(start));
    }, 30);
    return () => clearInterval(timer);
  }, [value]);

  return (
    <div
      className="glass flex flex-col items-center justify-center rounded-2xl px-6 py-5 animate-float"
      style={{ border: '1px solid rgba(212,175,55,0.25)', minWidth: 130 }}
    >
      <span className="font-serif text-3xl font-bold text-amber-400" style={color ? { color } : undefined}>
        {displayed.toLocaleString()}{suffix}
      </span>
      <span className="mt-1 text-[11px] uppercase tracking-widest" style={{ color: 'var(--ivory-dim)' }}>
        {label}
      </span>
    </div>
  );
}

// ─── How-It-Works Card ────────────────────────────────────────────────────────
function HowCard({
  step,
  icon,
  title,
  body,
  href,
  delay,
}: {
  step: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  href: string;
  delay: number;
}) {
  const tilt = useTilt(10);
  return (
    <Link href={href} className="block" style={{ animationDelay: `${delay}ms` }}>
      <div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        className="glass group cursor-pointer rounded-2xl p-6 h-full transition-shadow duration-300 hover:shadow-[0_8px_40px_rgba(0,96,57,0.25)]"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
            style={{ background: 'linear-gradient(135deg, var(--emerald-deep), var(--emerald-mid))' }}
          >
            {icon}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--gold-dim)' }}>
              Step {step}
            </div>
            <h3 className="font-serif text-lg font-semibold mt-0.5" style={{ color: 'var(--ivory)' }}>
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ivory-dim)' }}>
              {body}
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex items-center gap-1 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          style={{ color: 'var(--emerald-glow)' }}
        >
          <span>Open</span>
          <ArrowRight size={12} />
        </div>
      </div>
    </Link>
  );
}

// ─── Main Hero Page ───────────────────────────────────────────────────────────
export default function HomePage() {
  const { clusters, requests, weather, isBackendLive, handleSeed, isSeeding } = usePool();
  const tiltMain = useTilt(8);

  const totalSaved = clusters.reduce(
    (acc, c) => acc + (c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length),
    0,
  );
  const avgSavings = clusters.length
    ? Math.round(clusters.reduce((a, c) => a + c.savingsPercentage, 0) / clusters.length)
    : 0;

  return (
    <div
      className="relative min-h-screen overflow-x-hidden ambient-emerald"
      style={{ paddingTop: '3.5rem' }}
    >
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

      <div className="relative z-10 mx-auto max-w-screen-xl px-4 pt-16 pb-20">
        {/* ── Hero Text ── */}
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 inline-flex items-center rounded-full px-4 py-1.5 text-xs font-medium"
            style={{
              background: 'rgba(0,96,57,0.18)',
              border: '1px solid rgba(0,96,57,0.4)',
              color: 'var(--emerald-soft)',
            }}
          >
            <span className="mr-2 animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {isBackendLive ? 'Connected to Spring Boot API' : 'Running client-side simulation'}
            {weather && ` · ${weather.temperatureC.toFixed(1)}°C Bengaluru`}
          </div>

          <h1
            className="font-serif text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.08] tracking-tight"
            style={{ color: 'var(--ivory)' }}
          >
            Smart Rides for{' '}
            <span
              className="shimmer-text"
            >
              RVCE Students
            </span>
          </h1>

          <p
            className="mt-6 max-w-2xl text-base sm:text-lg leading-relaxed"
            style={{ color: 'var(--ivory-dim)' }}
          >
            Graph-powered Dijkstra routing + en-route interval matching across the
            Bengaluru Purple Metro Corridor — split fares, zero friction.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/book"
              className="btn-gold flex items-center gap-2 rounded-full px-7 py-3 shadow-lg"
            >
              Book a Ride
              <ArrowRight size={14} />
            </Link>
            <Link
              href="/pools"
              className="btn-emerald flex items-center gap-2 rounded-full px-7 py-3"
            >
              <Users size={14} />
              Browse Pools
            </Link>
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="flex items-center gap-2 rounded-full px-7 py-3 text-xs font-semibold uppercase tracking-widest transition-all duration-200 hover:opacity-80 disabled:opacity-50"
              style={{
                background: 'rgba(90,107,96,0.18)',
                border: '1px solid rgba(90,107,96,0.3)',
                color: 'var(--ivory-dim)',
              }}
            >
              <Zap size={13} />
              {isSeeding ? 'Simulating…' : 'Simulate 15 Commuters'}
            </button>
          </div>
        </div>

        {/* ── Floating 3D Showcase Card ── */}
        <div className="mt-20 flex justify-center">
          <div
            ref={tiltMain.ref}
            onMouseMove={tiltMain.onMouseMove}
            onMouseLeave={tiltMain.onMouseLeave}
            className="glass rounded-3xl p-8 max-w-2xl w-full shadow-2xl"
            style={{ transformStyle: 'preserve-3d', transition: 'transform 0.18s ease, box-shadow 0.18s ease' }}
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
                { label: 'Matched Pools',    val: clusters.length, suffix: '',   icon: <MapPin size={14} /> },
                { label: 'Fare Saved',       val: Math.round(totalSaved), suffix: '₹', icon: <TrendingDown size={14} /> },
              ].map((s) => (
                <div key={s.label} className="rounded-xl p-4 text-center" style={{ background: 'rgba(0,96,57,0.08)', border: '1px solid rgba(0,96,57,0.15)' }}>
                  <div className="flex justify-center mb-1" style={{ color: 'var(--emerald-glow)' }}>{s.icon}</div>
                  <div className="font-serif text-xl font-bold" style={{ color: 'var(--ivory)' }}>{s.suffix}{s.val.toLocaleString()}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Dijkstra path sample */}
            {clusters[0] && (
              <div className="mt-5 rounded-xl px-4 py-3" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(90,107,96,0.2)' }}>
                <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: 'var(--gold-dim)' }}>
                  Sample Dijkstra Corridor
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {clusters[0].sharedCorridorNodeIds.map((nodeId, i) => (
                    <span key={nodeId} className="flex items-center gap-1">
                      {i > 0 && <span style={{ color: 'var(--emerald-deep)' }}>→</span>}
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-mono" style={{ background: 'rgba(0,96,57,0.2)', color: 'var(--emerald-soft)' }}>
                        {nodeId}
                      </span>
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs" style={{ color: 'var(--ivory-dim)' }}>
                  {clusters[0].riders.length} riders · {clusters[0].sharedDistanceKm.toFixed(1)} km shared · ₹{Math.round(clusters[0].discountedFarePerPersonRs)}/person
                  {avgSavings > 0 && <span style={{ color: 'var(--emerald-glow)' }}> · ~{avgSavings}% avg savings</span>}
                </div>
              </div>
            )}

            {clusters.length === 0 && (
              <div className="mt-4 rounded-xl px-4 py-3 text-center text-sm" style={{ background: 'rgba(0,0,0,0.25)', color: 'var(--ivory-dim)' }}>
                Click <strong>Simulate 15 Commuters</strong> above to watch the algorithm run live.
              </div>
            )}
          </div>
        </div>

        {/* ── Floating Pedestals ── */}
        <div className="mt-16 flex flex-wrap justify-center gap-6">
          <Pedestal value={11}  label="Transit Hubs"      color="#34d399" />
          <Pedestal value={15}  label="Raw Edges"         color="#fbbf24" />
          <Pedestal value={clusters.filter((c) => c.riders.length >= 2).length || 0} label="Live Pools" color="#34d399" />
          <Pedestal value={Math.round(totalSaved)} label="₹ Saved"  color="#fbbf24" suffix="" />
        </div>

        {/* ── How It Works ── */}
        <div className="mt-24">
          <div className="text-center mb-12">
            <div className="text-[11px] uppercase tracking-[0.3em] font-mono mb-3" style={{ color: 'var(--gold-dim)' }}>
              How It Works
            </div>
            <h2 className="font-serif text-3xl sm:text-4xl font-bold" style={{ color: 'var(--ivory)' }}>
              Three steps to a smarter commute
            </h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            <HowCard
              step="01"
              icon={<MapPin size={18} />}
              title="Book Your Ride"
              body="Drop your GPS coordinates or pick from our 11 RVCE-area transit hubs. Haversine snapping finds your nearest node in milliseconds."
              href="/book"
              delay={0}
            />
            <HowCard
              step="02"
              icon={<Users size={18} />}
              title="Match a Pool"
              body="Dijkstra finds the cheapest shared corridor. Our interval-overlap engine clusters commuters departing within 15 minutes of each other."
              href="/pools"
              delay={100}
            />
            <HowCard
              step="03"
              icon={<Zap size={18} />}
              title="Radar Live View"
              body="Watch the real Bengaluru road geometry on a live Leaflet map. Toggle 1.4× peak traffic mode to see dynamic fare recalculation in real time."
              href="/radar"
              delay={200}
            />
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="mt-24 divider-gold" />
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
      </div>
    </div>
  );
}
