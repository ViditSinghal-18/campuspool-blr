'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePool } from '../../context/PoolContext';
import { Zap, Radio, RefreshCw, RotateCcw, ExternalLink, ChevronRight, Users, MapPin, TrendingDown, X } from 'lucide-react';

// SSR-disabled radar map
const RadarMap = dynamic(() => import('../../components/MapCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center" style={{ color: 'var(--slate-light)', background: 'var(--obsidian)' }}>
      <div className="text-center">
        <div className="font-mono text-xs mb-2" style={{ color: 'var(--gold-dim)' }}>LOADING MAP</div>
        <div className="text-[10px]" style={{ color: 'var(--slate-light)' }}>Initialising Leaflet…</div>
      </div>
    </div>
  ),
});

const CLUSTER_COLORS = ['#10b981', '#d4af37', '#60a5fa', '#f472b6', '#a78bfa', '#fb923c'];

export default function RadarPage() {
  const {
    nodes, clusters, requests, selectedCluster, setSelectedCluster,
    peakMode, handleTogglePeakMode, handleSeed, handleReset,
    isSeeding, isStreaming, toggleStream, isBackendLive,
  } = usePool();

  const [tiltMode, setTiltMode] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [pickedPickup, setPickedPickup]   = useState<{ lat: number; lng: number } | null>(null);
  const [pickedDropoff, setPickedDropoff] = useState<{ lat: number; lng: number } | null>(null);
  const [pickTarget, setPickTarget]       = useState<'source' | 'dest' | null>(null);

  const handleMapPickup  = useCallback((ll: { lat: number; lng: number }) => { setPickedPickup(ll);  setPickTarget(null); }, []);
  const handleMapDropoff = useCallback((ll: { lat: number; lng: number }) => { setPickedDropoff(ll); setPickTarget(null); }, []);

  const matchedPools = clusters.filter((c) => c.riders.length >= 2);
  const mapClusters = selectedCluster && selectedCluster.riders.length < 2
    ? [...matchedPools, selectedCluster]
    : matchedPools;

  const selectedIdx = selectedCluster
    ? clusters.findIndex((c) => c.clusterId === selectedCluster.clusterId)
    : -1;

  return (
    <div
      className="relative flex flex-col"
      style={{ height: '100vh', paddingTop: '3.5rem', background: 'var(--obsidian)' }}
    >
      {/* 3D tilt wrapper */}
      <div
        className="flex-1 relative overflow-hidden transition-all duration-700"
        style={tiltMode ? { perspective: '1400px', perspectiveOrigin: '50% 40%' } : {}}
      >
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={tiltMode ? { transform: 'rotateX(22deg) scale(1.1)', transformOrigin: '50% 60%' } : {}}
        >
          <RadarMap
            nodes={nodes}
            clusters={mapClusters}
            selectedCluster={selectedCluster}
            peakMode={peakMode}
            pickTarget={pickTarget}
            onMapClickPickup={handleMapPickup}
            onMapClickDropoff={handleMapDropoff}
            pickedPickup={pickedPickup}
            pickedDropoff={pickedDropoff}
            clusterColors={CLUSTER_COLORS}
          />
        </div>

        {/* ── Floating glass control dock ── */}
        <div className="absolute top-4 left-4 z-[500] flex flex-col gap-2">
          {/* Brand badge */}
          <div
            className="glass rounded-xl px-3 py-2 text-xs font-semibold"
            style={{ border: '1px solid var(--glass-border)', color: 'var(--emerald-glow)' }}
          >
            <span className="animate-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 mr-2" />
            Bengaluru Live Radar
          </div>

          {/* 3D Tilt toggle */}
          <button
            onClick={() => setTiltMode(!tiltMode)}
            className="glass rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-85"
            style={{
              border: `1px solid ${tiltMode ? 'rgba(212,175,55,0.45)' : 'var(--glass-border)'}`,
              color: tiltMode ? 'var(--gold)' : 'var(--ivory-dim)',
            }}
          >
            {tiltMode ? '⬛ Flat View' : '◈ 3D Tilt View'}
          </button>

          {/* Peak mode */}
          <button
            onClick={handleTogglePeakMode}
            className="glass rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-85"
            style={{
              border: `1px solid ${peakMode ? 'rgba(212,175,55,0.45)' : 'var(--glass-border)'}`,
              color: peakMode ? 'var(--gold)' : 'var(--ivory-dim)',
            }}
          >
            <Zap size={11} className="inline mr-1" />
            Peak {peakMode ? '1.4× ON' : 'OFF'}
          </button>

          {/* Seed */}
          <button
            onClick={handleSeed}
            disabled={isSeeding}
            className="glass rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-85 disabled:opacity-40"
            style={{ border: 'var(--glass-border)', color: 'var(--emerald-soft)' }}
          >
            <Zap size={11} className="inline mr-1" />
            {isSeeding ? 'Seeding…' : 'Populate 15'}
          </button>

          {/* Live stream */}
          <button
            onClick={toggleStream}
            className="glass rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-85"
            style={{
              border: `1px solid ${isStreaming ? 'rgba(239,68,68,0.45)' : 'var(--glass-border)'}`,
              color: isStreaming ? '#ef4444' : 'var(--ivory-dim)',
            }}
          >
            <Radio size={11} className={`inline mr-1 ${isStreaming ? 'animate-pulse-dot' : ''}`} />
            {isStreaming ? 'Stop Stream' : 'Live Stream'}
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="glass rounded-xl px-3 py-2 text-xs font-medium transition-all hover:opacity-85"
            style={{ border: '1px solid var(--glass-border)', color: 'var(--slate-light)' }}
          >
            <RefreshCw size={11} className="inline mr-1" />
            Reset
          </button>
        </div>

        {/* ── Cluster list panel (top-right) ── */}
        <div className="absolute top-4 right-4 z-[500] w-56">
          <div className="glass rounded-xl overflow-hidden" style={{ border: '1px solid var(--glass-border)' }}>
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--glass-border)' }}>
              <span className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'var(--gold-dim)' }}>
                Active Pools ({matchedPools.length})
              </span>
              <button onClick={() => setShowDrawer(true)} className="text-[10px] flex items-center gap-0.5 hover:opacity-80" style={{ color: 'var(--emerald-glow)' }}>
                All <ChevronRight size={10} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {matchedPools.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-center" style={{ color: 'var(--slate-light)' }}>
                  No active pools.<br />Populate to begin.
                </div>
              ) : (
                matchedPools.map((c, i) => {
                  const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
                  const active = selectedCluster?.clusterId === c.clusterId;
                  const cleanId = c.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || c.clusterId;
                  return (
                    <button
                      key={c.clusterId}
                      onClick={() => setSelectedCluster(active ? null : c)}
                      className="w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/5"
                      style={{ borderBottom: '1px solid rgba(90,107,96,0.12)', background: active ? `${color}12` : 'transparent' }}
                    >
                      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
                      <div>
                        <div className="text-[11px] font-medium" style={{ color: 'var(--ivory)' }}>
                          #{cleanId} · {c.riders.length} riders
                        </div>
                        <div className="text-[9px]" style={{ color: 'var(--slate-light)' }}>
                          ₹{Math.round(c.discountedFarePerPersonRs)}/p · {c.savingsPercentage.toFixed(0)}% saved
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ── Backend status ── */}
        <div
          className="absolute bottom-4 left-4 z-[500] glass rounded-full px-3 py-1.5 flex items-center gap-2 text-[10px]"
          style={{ border: '1px solid var(--glass-border)', color: 'var(--slate-light)' }}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isBackendLive ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
          {isBackendLive ? 'Spring Boot API · Live' : 'Client Fallback Engine'}
          <span className="opacity-50">·</span>
          <a
            href="http://localhost:8080/swagger-ui.html"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-0.5 hover:opacity-80"
            style={{ color: 'var(--emerald-glow)' }}
          >
            <ExternalLink size={9} />
            API Docs
          </a>
        </div>

        {/* ── Stats badge (bottom right) ── */}
        <div
          className="absolute bottom-4 right-4 z-[500] glass rounded-xl px-4 py-3 flex items-center gap-4 text-xs"
          style={{ border: '1px solid var(--glass-border)' }}
        >
          <div className="text-center">
            <div className="font-serif font-bold" style={{ color: 'var(--emerald-glow)' }}>{requests.length}</div>
            <div style={{ color: 'var(--slate-light)' }}>commuters</div>
          </div>
          <div className="h-6 w-px" style={{ background: 'rgba(90,107,96,0.3)' }} />
          <div className="text-center">
            <div className="font-serif font-bold" style={{ color: 'var(--gold)' }}>{matchedPools.length}</div>
            <div style={{ color: 'var(--slate-light)' }}>pools</div>
          </div>
        </div>
      </div>

      {/* ── Slide-over cluster drawer ── */}
      {showDrawer && (
        <div
          className="fixed inset-0 z-[600] flex"
          onClick={() => setShowDrawer(false)}
        >
          <div className="flex-1" />
          <div
            className="relative h-full w-80 glass overflow-y-auto"
            style={{ borderLeft: '1px solid var(--glass-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-5 py-4" style={{ background: 'rgba(5,8,7,0.9)', borderBottom: '1px solid var(--glass-border)' }}>
              <h3 className="font-serif text-lg font-semibold" style={{ color: 'var(--ivory)' }}>All Pools</h3>
              <button onClick={() => setShowDrawer(false)} className="rounded-full p-1 hover:bg-white/10 transition-colors">
                <X size={16} style={{ color: 'var(--ivory-dim)' }} />
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {matchedPools.map((c, i) => {
                const color = CLUSTER_COLORS[i % CLUSTER_COLORS.length];
                const active = selectedCluster?.clusterId === c.clusterId;
                const savings = Math.round(c.originalTotalFareRs - c.discountedFarePerPersonRs * c.riders.length);
                const cleanId = c.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || c.clusterId;
                return (
                  <button
                    key={c.clusterId}
                    onClick={() => { setSelectedCluster(active ? null : c); setShowDrawer(false); }}
                    className="text-left rounded-xl p-4 transition-all hover:opacity-85"
                    style={{
                      background: active ? `${color}18` : 'rgba(0,0,0,0.3)',
                      border: `1px solid ${active ? color + '50' : 'rgba(90,107,96,0.2)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                      <span className="font-semibold text-sm" style={{ color: 'var(--ivory)' }}>
                        Pool #{cleanId}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-[10px]" style={{ color: 'var(--ivory-dim)' }}>
                      <div><Users size={9} className="inline mr-0.5" />{c.riders.length}</div>
                      <div><MapPin size={9} className="inline mr-0.5" />{c.sharedDistanceKm.toFixed(1)} km</div>
                      <div><TrendingDown size={9} className="inline mr-0.5" />{c.savingsPercentage.toFixed(0)}%</div>
                    </div>
                    <div className="mt-2 text-[10px]" style={{ color }}>
                      ₹{Math.round(c.discountedFarePerPersonRs)}/person · +₹{savings} saved
                    </div>
                  </button>
                );
              })}
              {matchedPools.length === 0 && (
                <div className="text-center py-8 text-sm" style={{ color: 'var(--slate-light)' }}>
                  No active pools yet. Go to Pools → Populate 15.
                </div>
              )}
              <Link href="/pools" className="mt-2 btn-gold rounded-xl py-2.5 text-center text-xs flex items-center justify-center gap-1">
                View Gallery <ChevronRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
