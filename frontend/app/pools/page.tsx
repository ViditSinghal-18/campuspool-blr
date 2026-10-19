'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePool, getRiderFareBreakdown } from '../../context/PoolContext';
import type { MatchCluster } from '../../lib/types';
import { Users, MapPin, Zap, TrendingDown, RefreshCw, Radio, ArrowRight } from 'lucide-react';
import TiltCard3D from '../../components/TiltCard3D';

// ─── Destination Banner Image Map ─────────────────────────────────────────────
function getDestinationBanner(nodeName: string): string {
  const n = (nodeName || '').toLowerCase();
  if (n.includes('majestic')) {
    return 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80';
  }
  if (n.includes('mg_road') || n.includes('mg road') || n.includes('indiranagar')) {
    return 'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=800&q=80';
  }
  if (n.includes('vijayanagar') || n.includes('mysore')) {
    return 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=800&q=80';
  }
  if (n.includes('banashankari') || n.includes('jayanagar')) {
    return 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=800&q=80';
  }
  return 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=800&q=80';
}

// ─── Metro Stepper ────────────────────────────────────────────────────────────
function MetroStepper({ nodeIds }: { nodeIds: string[] }) {
  return (
    <div className="flex items-center flex-wrap gap-0.5 mt-3">
      {nodeIds.map((id, i) => (
        <span key={id} className="flex items-center">
          {i > 0 && <span className="mx-0.5 text-[10px]" style={{ color: 'var(--emerald-deep)' }}>→</span>}
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-mono"
            style={{ background: 'rgba(0,96,57,0.18)', color: 'var(--emerald-soft)', border: '1px solid rgba(0,96,57,0.25)' }}
          >
            {id}
          </span>
        </span>
      ))}
    </div>
  );
}

// ─── Pool Card ────────────────────────────────────────────────────────────────
const PALETTE = ['#10b981', '#d4af37', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

function PoolCard({ cluster, idx, onInspect }: { cluster: MatchCluster; idx: number; onInspect: (c: MatchCluster) => void }) {
  const color = PALETTE[idx % PALETTE.length];
  const savings = Math.round(cluster.originalTotalFareRs - cluster.discountedFarePerPersonRs * cluster.riders.length);
  const firstRider = cluster.riders[0];
  const cleanId = cluster.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || cluster.clusterId;
  const bannerImage = getDestinationBanner(cluster.dropOffSplitNodeName);

  return (
    <TiltCard3D
      maxTilt={10}
      glareColor={`${color}22`}
      className="glass rounded-2xl flex flex-col overflow-hidden cursor-default h-full"
      style={{ borderTop: `2px solid ${color}60` }}
    >
      {/* Visual Destination Header Banner */}
      <div className="relative h-28 w-full overflow-hidden">
        <img
          src={bannerImage}
          alt={cluster.dropOffSplitNodeName}
          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105 brightness-[0.72]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--obsidian)] via-[var(--obsidian)]/40 to-transparent" />

        {/* Destination Pill */}
        <div
          className="absolute top-2.5 left-3 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium backdrop-blur-md"
          style={{ background: 'rgba(5,8,7,0.8)', border: '1px solid rgba(212,175,55,0.4)', color: 'var(--gold)' }}
        >
          <MapPin size={10} className="text-amber-400" />
          <span>To {cluster.dropOffSplitNodeName}</span>
        </div>

        {/* Animated Avatar Stack */}
        <div className="absolute bottom-2 right-3 flex items-center -space-x-2">
          {cluster.riders.map((r, rIdx) => (
            <div
              key={r.userId}
              className="relative flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shadow-md transition-transform hover:scale-125 hover:z-20 cursor-pointer"
              style={{
                background: `linear-gradient(135deg, ${color}, #050807)`,
                border: '2px solid rgba(5,8,7,0.9)',
                color: '#ffffff',
                zIndex: cluster.riders.length - rIdx,
              }}
              title={`${r.studentName} (${r.sourceNodeId} → ${r.destinationNodeId})`}
            >
              {r.studentName.charAt(0).toUpperCase()}
            </div>
          ))}
          <span className="ml-3 text-[10px] font-mono text-emerald-400 font-semibold backdrop-blur-sm px-1.5 py-0.5 rounded bg-black/50 border border-emerald-900/60">
            {cluster.riders.length} Pooled
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] font-mono" style={{ color: 'var(--gold-dim)' }}>
              POOL #{cleanId}
            </div>
            <div className="font-serif text-xl font-semibold mt-0.5" style={{ color: 'var(--ivory)' }}>
              ₹{Math.round(cluster.discountedFarePerPersonRs)}
              <span className="text-xs ml-1 font-normal" style={{ color: 'var(--ivory-dim)' }}>/person</span>
            </div>
          </div>
          <div className="text-right">
            <div
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
            >
              <TrendingDown size={9} />
              {cluster.savingsPercentage.toFixed(0)}% saved
            </div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--slate-light)' }}>
              Solo: ₹{Math.round(cluster.originalTotalFareRs / Math.max(cluster.riders.length, 1))}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(0,0,0,0.25)' }}>
          <div className="text-center">
            <div className="text-[10px]" style={{ color: 'var(--ivory-dim)' }}><Users size={10} className="inline mr-0.5" />Riders</div>
            <div className="font-semibold text-sm" style={{ color: 'var(--ivory)' }}>{cluster.riders.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px]" style={{ color: 'var(--ivory-dim)' }}><MapPin size={10} className="inline mr-0.5" />Distance</div>
            <div className="font-semibold text-sm" style={{ color: 'var(--ivory)' }}>{cluster.sharedDistanceKm.toFixed(1)} km</div>
          </div>
          <div className="text-center">
            <div className="text-[10px]" style={{ color: 'var(--ivory-dim)' }}>₹ Saved</div>
            <div className="font-semibold text-sm" style={{ color }}>{savings > 0 ? `+₹${savings}` : '—'}</div>
          </div>
        </div>

        {/* Drop-off */}
        <div className="text-xs" style={{ color: 'var(--ivory-dim)' }}>
          <span className="mr-1" style={{ color: 'var(--gold-dim)' }}>Split at:</span>
          <strong style={{ color: 'var(--ivory)' }}>{cluster.dropOffSplitNodeName}</strong>
        </div>

        {/* Metro stepper */}
        <MetroStepper nodeIds={cluster.sharedCorridorNodeIds} />

        {/* Riders */}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {cluster.riders.map((r) => (
            <div
              key={r.userId}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: 'rgba(90,107,96,0.18)', border: '1px solid rgba(90,107,96,0.28)', color: 'var(--ivory-dim)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
              {r.studentName.split(' ')[0]}
            </div>
          ))}
        </div>

        {/* Required Fare & Leg Breakdown */}
        <div className="rounded-xl p-3 text-xs space-y-2 bg-black/40 border border-slate-800/60 font-sans">
          {cluster.riders.map((r) => {
            const b = getRiderFareBreakdown(r, cluster);
            return (
              <div key={r.userId} className="space-y-0.5 pb-2 last:pb-0 border-b last:border-b-0 border-slate-800/40">
                {cluster.riders.length > 1 && (
                  <div className="text-[10px] font-semibold text-slate-400 font-mono">
                    {r.studentName.split(' ')[0]}:
                  </div>
                )}
                <div className="text-slate-200">
                  Ride together to {b.dropHub} ({b.sharedKm} km): Rs {b.sharedShare}
                </div>
                {b.remainingFare > 0 && (
                  <div className="text-amber-300">
                    Last leg to {b.destination}: Rs {b.remainingFare}
                  </div>
                )}
                <div className="text-emerald-400 font-semibold">
                  Total Rs {b.pooledTotal} vs solo Rs {b.soloFare} - {b.savingsPct}% saved
                </div>
              </div>
            );
          })}
        </div>

        {/* Departure window */}
        {firstRider && (
          <div className="text-[10px]" style={{ color: 'var(--slate-light)', fontFamily: 'var(--font-mono)' }}>
            Departs ~{firstRider.departureTime.replace('T', ' ').slice(0, 16)}
          </div>
        )}

        {/* Inspect button */}
        <button
          onClick={() => onInspect(cluster)}
          className="mt-auto flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-85"
          style={{ background: `${color}18`, border: `1px solid ${color}35`, color }}
        >
          <MapPin size={11} />
          Inspect on Radar
          <ArrowRight size={11} />
        </button>
      </div>
    </TiltCard3D>
  );
}

// ─── Filter types ──────────────────────────────────────────────────────────────
type Filter = 'all' | '2+ riders' | '30%+ savings' | 'long route';

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PoolsPage() {
  const { clusters, requests, handleSeed, handleReset, isSeeding, isStreaming, toggleStream, setSelectedCluster } = usePool();
  const [filter, setFilter] = useState<Filter>('all');

  // Filter out 1-rider "solo" clusters (riders < 2 or savingsPercentage <= 0) from the main Matched Pools grid
  const matchedClusters = clusters.filter(
    (c) => c.riders.length >= 2 && c.savingsPercentage > 0
  );
  const soloClusters = clusters.filter(
    (c) => c.riders.length < 2 || c.savingsPercentage <= 0
  );

  const filtered = matchedClusters.filter((c) => {
    if (filter === '2+ riders')      return c.riders.length >= 2;
    if (filter === '30%+ savings')   return c.savingsPercentage >= 30;
    if (filter === 'long route')     return c.sharedDistanceKm >= 5;
    return true;
  });

  const handleInspect = useCallback((c: MatchCluster) => {
    setSelectedCluster(c);
    window.location.href = '/radar';
  }, [setSelectedCluster]);

  const totalSaved = matchedClusters.reduce((a, c) => a + (c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length), 0);

  return (
    <div className="relative min-h-screen" style={{ paddingTop: '3.5rem', background: 'var(--obsidian)' }}>
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-32 left-10 h-[300px] w-[300px] rounded-full opacity-8" style={{ background: 'radial-gradient(circle, rgba(0,96,57,0.25) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 mx-auto max-w-screen-xl px-4 py-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] font-mono mb-1" style={{ color: 'var(--gold-dim)' }}>Matched Pool Clusters</div>
            <h1 className="font-serif text-4xl font-bold" style={{ color: 'var(--ivory)' }}>Active Pools</h1>
          </div>
          {/* Action bar */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={toggleStream}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-85"
              style={{
                background: isStreaming ? 'rgba(239,68,68,0.18)' : 'rgba(90,107,96,0.18)',
                border: `1px solid ${isStreaming ? 'rgba(239,68,68,0.4)' : 'rgba(90,107,96,0.3)'}`,
                color: isStreaming ? '#ef4444' : 'var(--ivory-dim)',
              }}
            >
              <Radio size={12} className={isStreaming ? 'animate-pulse-dot' : ''} />
              {isStreaming ? 'Stop Stream' : 'Live Stream'}
            </button>
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="btn-emerald flex items-center gap-2 rounded-xl px-4 py-2.5"
            >
              <Zap size={12} />
              {isSeeding ? 'Seeding…' : 'Populate 15'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
              style={{ background: 'rgba(90,107,96,0.18)', border: '1px solid rgba(90,107,96,0.3)', color: 'var(--ivory-dim)' }}
            >
              <RefreshCw size={12} />
              Reset
            </button>
            <Link href="/book" className="btn-gold flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs">
              + Book Ride
            </Link>
          </div>
        </div>

        {/* Telemetry row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Commuters', val: requests.length, color: 'var(--emerald-glow)' },
            { label: 'Pools',     val: matchedClusters.length, color: 'var(--gold)' },
            { label: 'Matching',  val: filtered.length, color: 'var(--emerald-soft)' },
            { label: '₹ Saved',   val: `₹${Math.round(totalSaved)}`, color: 'var(--gold-light)', isStr: true },
          ].map((m) => (
            <div key={m.label} className="glass rounded-xl px-4 py-3 text-center" style={{ border: '1px solid rgba(0,96,57,0.2)' }}>
              <div className="font-serif text-2xl font-bold" style={{ color: m.color }}>
                {m.isStr ? m.val : (m.val as number).toLocaleString()}
              </div>
              <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: 'var(--ivory-dim)' }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {(['all', '2+ riders', '30%+ savings', 'long route'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-4 py-1.5 text-xs font-medium capitalize transition-all duration-200"
              style={{
                background: filter === f ? 'var(--emerald-deep)' : 'rgba(90,107,96,0.18)',
                color: filter === f ? 'var(--ivory)' : 'var(--ivory-dim)',
                border: `1px solid ${filter === f ? 'rgba(0,96,57,0.6)' : 'rgba(90,107,96,0.3)'}`,
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Pool Cards grid */}
        {filtered.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center">
            <div className="font-serif text-2xl mb-3" style={{ color: 'var(--ivory-dim)' }}>No pools yet</div>
            <p className="text-sm mb-6" style={{ color: 'var(--slate-light)' }}>
              {matchedClusters.length > 0 ? 'No matched pools fit this filter.' : 'Click Populate 15 to run the matching algorithm.'}
            </p>
            {matchedClusters.length === 0 && (
              <button onClick={handleSeed} disabled={isSeeding} className="btn-emerald rounded-xl px-8 py-3 flex items-center gap-2 mx-auto">
                <Zap size={14} />{isSeeding ? 'Simulating…' : 'Simulate Now'}
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((c, i) => (
              <PoolCard key={c.clusterId} cluster={c} idx={i} onInspect={handleInspect} />
            ))}
          </div>
        )}

        {/* Solo Requests Waiting for Match */}
        {soloClusters.length > 0 && (
          <div className="mt-16 pt-8" style={{ borderTop: '1px solid rgba(90,107,96,0.25)' }}>
            <div className="flex flex-col sm:flex-row sm:items-start sm:items-center justify-between gap-2 mb-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] font-mono mb-1" style={{ color: 'var(--gold-dim)' }}>
                  Unmatched Commuters · {soloClusters.length} {soloClusters.length === 1 ? 'Request' : 'Requests'}
                </div>
                <h2 className="font-serif text-2xl font-bold" style={{ color: 'var(--ivory)' }}>
                  Solo Requests Waiting for Match
                </h2>
              </div>
              <p className="text-xs max-w-md" style={{ color: 'var(--slate-light)' }}>
                Single riders waiting for compatible corridors or time windows. They will automatically merge into pools as new requests arrive.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {soloClusters.map((cluster) => {
                const rider = cluster.riders[0];
                const cleanId = cluster.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || cluster.clusterId;
                const timeStr = rider?.departureTime ? rider.departureTime.replace('T', ' ').slice(0, 16) : '';

                return (
                  <div
                    key={cluster.clusterId}
                    className="glass rounded-xl p-4 flex flex-col gap-2.5 transition-all hover:border-[rgba(212,175,55,0.4)]"
                    style={{ border: '1px solid rgba(90,107,96,0.2)', background: 'rgba(10,18,14,0.4)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs"
                          style={{ background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}
                        >
                          {rider ? rider.studentName.charAt(0).toUpperCase() : 'R'}
                        </div>
                        <div>
                          <div className="font-semibold text-sm leading-tight" style={{ color: 'var(--ivory)' }}>
                            {rider ? rider.studentName : 'Solo Rider'}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: 'var(--gold-dim)' }}>
                            REQ #{cleanId}
                          </div>
                        </div>
                      </div>
                      <span
                        className="text-[9px] uppercase tracking-wider font-mono px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.25)' }}
                      >
                        Waiting
                      </span>
                    </div>

                    <div className="text-xs flex items-center gap-1.5 font-mono" style={{ color: 'var(--ivory-dim)' }}>
                      <span className="text-[11px] font-semibold text-white">{rider?.sourceNodeId}</span>
                      <span style={{ color: 'var(--gold)' }}>→</span>
                      <span className="text-[11px] font-semibold text-white">{rider?.destinationNodeId}</span>
                      <span className="ml-auto text-[10px]" style={{ color: 'var(--slate-light)' }}>
                        {cluster.sharedDistanceKm.toFixed(1)} km
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t" style={{ borderColor: 'rgba(90,107,96,0.15)', color: 'var(--slate-light)' }}>
                      <span className="font-mono text-[10px]">
                        {timeStr ? `Departs ~${timeStr}` : 'Flexible window'}
                      </span>
                      <span className="font-semibold" style={{ color: 'var(--ivory-dim)' }}>
                        Solo: ₹{Math.round(cluster.originalTotalFareRs)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleInspect(cluster)}
                      className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-medium transition-all hover:opacity-85"
                      style={{ background: 'rgba(90,107,96,0.15)', border: '1px solid rgba(90,107,96,0.25)', color: 'var(--ivory-dim)' }}
                    >
                      <MapPin size={10} />
                      View Route on Radar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


