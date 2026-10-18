'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePool } from '../../context/PoolContext';
import { NODES } from '../../lib/fallbackEngine';
import type { LatLng } from '../../lib/types';
import { MapPin, Navigation, ArrowRight, CheckCircle, User, Clock, Loader, Zap } from 'lucide-react';

// SSR-disabled mini map
const MiniMap = dynamic(() => import('../../components/BookMiniMap'), { ssr: false, loading: () => (
  <div className="flex h-full items-center justify-center" style={{ color: 'var(--slate-light)' }}>
    Loading map…
  </div>
) });

const STATION_IDS = Object.keys(NODES);
const DEFAULT_DEPARTURE = '16:05';

type Step = 1 | 2 | 3;

export default function BookPage() {
  const { nodes, clusters, handleSnapAndRequest, addToast } = usePool();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [departure, setDeparture] = useState(DEFAULT_DEPARTURE);
  const [sourceId, setSourceId] = useState('RVCE');
  const [destId, setDestId]     = useState('MAJESTIC');
  const [sourceLat, setSourceLat] = useState(NODES.RVCE.lat);
  const [sourceLng, setSourceLng] = useState(NODES.RVCE.lng);
  const [destLat, setDestLat]     = useState(NODES.MAJESTIC.lat);
  const [destLng, setDestLng]     = useState(NODES.MAJESTIC.lng);
  const [submitting, setSubmitting] = useState(false);
  const [matchedClusterIdx, setMatchedClusterIdx] = useState<number | null>(null);
  const [pickMode, setPickMode] = useState<'source' | 'dest' | null>(null);
  const [gpsLoading, setGpsLoading] = useState<'source' | 'dest' | null>(null);

  // Sync lat/lng from dropdown
  useEffect(() => {
    const n = NODES[sourceId];
    if (n) { setSourceLat(n.lat); setSourceLng(n.lng); }
  }, [sourceId]);

  useEffect(() => {
    const n = NODES[destId];
    if (n) { setDestLat(n.lat); setDestLng(n.lng); }
  }, [destId]);

  const handleGps = useCallback((target: 'source' | 'dest') => {
    if (!navigator.geolocation) { addToast('error', 'Geolocation not supported'); return; }
    setGpsLoading(target);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (target === 'source') { setSourceLat(pos.coords.latitude); setSourceLng(pos.coords.longitude); setSourceId(''); }
        else                     { setDestLat(pos.coords.latitude);   setDestLng(pos.coords.longitude);   setDestId(''); }
        setGpsLoading(null);
        addToast('success', `📍 ${target === 'source' ? 'Pickup' : 'Drop-off'} GPS captured`);
      },
      () => { setGpsLoading(null); addToast('error', 'GPS permission denied'); },
      { timeout: 8000 },
    );
  }, [addToast]);

  const handleMapPick = useCallback((latlng: LatLng) => {
    if (pickMode === 'source') { setSourceLat(latlng.lat); setSourceLng(latlng.lng); setSourceId(''); }
    if (pickMode === 'dest')   { setDestLat(latlng.lat);   setDestLng(latlng.lng);   setDestId(''); }
    setPickMode(null);
  }, [pickMode]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim()) { addToast('error', 'Please enter your name'); return; }
    if (sourceLat === destLat && sourceLng === destLng) { addToast('error', 'Pickup and drop-off cannot be the same'); return; }
    setSubmitting(true);
    try {
      await handleSnapAndRequest({ studentName: name.trim(), sourceLat, sourceLng, destLat, destLng, departureTime: departure });
      setMatchedClusterIdx(clusters.length - 1);
      setStep(3);
    } finally {
      setSubmitting(false);
    }
  }, [name, sourceLat, sourceLng, destLat, destLng, departure, handleSnapAndRequest, clusters.length, addToast]);

  const sourceNode = nodes.find((n) => n.id === sourceId);
  const destNode   = nodes.find((n) => n.id === destId);

  return (
    <div className="relative min-h-screen" style={{ paddingTop: '3.5rem', background: 'var(--obsidian)' }}>
      {/* Background ambient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute top-20 right-10 h-[350px] w-[350px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.4) 0%, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-screen-lg px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <div className="text-[10px] uppercase tracking-[0.3em] font-mono mb-2" style={{ color: 'var(--gold-dim)' }}>
            Ride Request Wizard
          </div>
          <h1 className="font-serif text-4xl font-bold" style={{ color: 'var(--ivory)' }}>
            Book Your Pool
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ivory-dim)' }}>
            Haversine GPS snapping · Dijkstra routing · en-route matching
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-10">
          {(['1', '2', '3'] as const).map((s, i) => {
            const num = (i + 1) as Step;
            const active  = step === num;
            const done    = step > num;
            return (
              <div key={s} className="flex items-center flex-1 last:flex-none">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all duration-300"
                  style={{
                    background: done ? 'var(--emerald-deep)' : active ? 'var(--gold)' : 'rgba(90,107,96,0.2)',
                    color: done || active ? (active ? 'var(--obsidian)' : 'var(--ivory)') : 'var(--slate-light)',
                    border: `2px solid ${done ? 'var(--emerald-deep)' : active ? 'var(--gold)' : 'transparent'}`,
                  }}
                >
                  {done ? <CheckCircle size={16} /> : s}
                </div>
                {i < 2 && (
                  <div className="flex-1 h-px mx-2" style={{ background: step > num ? 'var(--emerald-deep)' : 'rgba(90,107,96,0.3)' }} />
                )}
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* ── Left Panel ── */}
          <div className="flex flex-col gap-6">
            {step === 1 && (
              <div className="glass rounded-2xl p-8 animate-fade-up">
                <h2 className="font-serif text-xl font-semibold mb-6" style={{ color: 'var(--ivory)' }}>
                  Who are you?
                </h2>
                <div className="flex flex-col gap-5">
                  <label className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>
                      <User size={11} className="inline mr-1" />Student Name
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Vidit Singhal (RVCE CSE)"
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(90,107,96,0.35)',
                        color: 'var(--ivory)',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--emerald-glow)')}
                      onBlur={(e)  => (e.target.style.borderColor = 'rgba(90,107,96,0.35)')}
                    />
                  </label>
                  <div className="flex flex-col gap-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>
                      <Clock size={11} className="inline mr-1" />Departure Time
                    </span>
                    <input
                      type="time"
                      value={departure}
                      onChange={(e) => setDeparture(e.target.value)}
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 font-mono"
                      style={{
                        background: 'rgba(0,0,0,0.4)',
                        border: '1px solid rgba(90,107,96,0.35)',
                        color: 'var(--ivory)',
                        colorScheme: 'dark',
                      }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--emerald-glow)')}
                      onBlur={(e)  => (e.target.style.borderColor = 'rgba(90,107,96,0.35)')}
                    />
                    {/* Quick-select peak commuter time pills */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] uppercase font-mono tracking-wider mr-1" style={{ color: 'var(--gold-dim)' }}>
                        Quick:
                      </span>
                      {(['16:00', '16:05', '16:10', '16:15'] as const).map((t) => {
                        const isSelected = departure === t;
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setDeparture(t)}
                            className="flex-1 py-1.5 px-2 rounded-lg text-xs font-mono font-medium transition-all duration-150"
                            style={{
                              background: isSelected ? 'rgba(212,175,55,0.25)' : 'rgba(90,107,96,0.18)',
                              color: isSelected ? 'var(--gold)' : 'var(--ivory-dim)',
                              border: `1px solid ${isSelected ? 'rgba(212,175,55,0.6)' : 'rgba(90,107,96,0.3)'}`,
                            }}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <button
                    onClick={() => { if (!name.trim()) { addToast('error', 'Please enter your name'); return; } setStep(2); }}
                    className="btn-gold rounded-xl py-3 mt-2 flex items-center justify-center gap-2"
                  >
                    Continue <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="glass rounded-2xl p-8 animate-fade-up">
                <h2 className="font-serif text-xl font-semibold mb-6" style={{ color: 'var(--ivory)' }}>
                  Where to?
                </h2>

                {/* Pickup */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>
                      <MapPin size={11} className="inline mr-1" style={{ color: 'var(--emerald-glow)' }} />Pickup Station
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGps('source')}
                        disabled={gpsLoading === 'source'}
                        className="text-[10px] flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
                        style={{ background: 'rgba(0,96,57,0.2)', color: 'var(--emerald-glow)', border: '1px solid rgba(0,96,57,0.35)' }}
                      >
                        {gpsLoading === 'source' ? <Loader size={9} className="animate-spin" /> : <Navigation size={9} />}
                        My GPS
                      </button>
                      <button
                        onClick={() => setPickMode(pickMode === 'source' ? null : 'source')}
                        className="text-[10px] flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
                        style={{
                          background: pickMode === 'source' ? 'rgba(212,175,55,0.25)' : 'rgba(90,107,96,0.2)',
                          color: pickMode === 'source' ? 'var(--gold)' : 'var(--ivory-dim)',
                          border: `1px solid ${pickMode === 'source' ? 'rgba(212,175,55,0.4)' : 'rgba(90,107,96,0.3)'}`,
                        }}
                      >
                        <MapPin size={9} />Pick on Map
                      </button>
                    </div>
                  </div>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(90,107,96,0.35)', color: 'var(--ivory)', colorScheme: 'dark' }}
                  >
                    <option value="">— Custom GPS (picked on map) —</option>
                    {STATION_IDS.map((id) => (
                      <option key={id} value={id}>{NODES[id].name}</option>
                    ))}
                  </select>
                  <div className="mt-1.5 flex gap-3">
                    <input type="number" value={sourceLat.toFixed(4)} onChange={(e) => setSourceLat(+e.target.value)} placeholder="Lat" className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(90,107,96,0.2)', color: 'var(--ivory-dim)', fontFamily: 'var(--font-mono)' }} />
                    <input type="number" value={sourceLng.toFixed(4)} onChange={(e) => setSourceLng(+e.target.value)} placeholder="Lng" className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(90,107,96,0.2)', color: 'var(--ivory-dim)', fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>

                {/* Drop-off */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--ivory-dim)' }}>
                      <MapPin size={11} className="inline mr-1" style={{ color: 'var(--gold)' }} />Drop-off Station
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleGps('dest')}
                        disabled={gpsLoading === 'dest'}
                        className="text-[10px] flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
                        style={{ background: 'rgba(0,96,57,0.2)', color: 'var(--emerald-glow)', border: '1px solid rgba(0,96,57,0.35)' }}
                      >
                        {gpsLoading === 'dest' ? <Loader size={9} className="animate-spin" /> : <Navigation size={9} />}
                        My GPS
                      </button>
                      <button
                        onClick={() => setPickMode(pickMode === 'dest' ? null : 'dest')}
                        className="text-[10px] flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:opacity-80"
                        style={{
                          background: pickMode === 'dest' ? 'rgba(212,175,55,0.25)' : 'rgba(90,107,96,0.2)',
                          color: pickMode === 'dest' ? 'var(--gold)' : 'var(--ivory-dim)',
                          border: `1px solid ${pickMode === 'dest' ? 'rgba(212,175,55,0.4)' : 'rgba(90,107,96,0.3)'}`,
                        }}
                      >
                        <MapPin size={9} />Pick on Map
                      </button>
                    </div>
                  </div>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(90,107,96,0.35)', color: 'var(--ivory)', colorScheme: 'dark' }}
                  >
                    <option value="">— Custom GPS (picked on map) —</option>
                    {STATION_IDS.map((id) => (
                      <option key={id} value={id}>{NODES[id].name}</option>
                    ))}
                  </select>
                  <div className="mt-1.5 flex gap-3">
                    <input type="number" value={destLat.toFixed(4)} onChange={(e) => setDestLat(+e.target.value)} placeholder="Lat" className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(90,107,96,0.2)', color: 'var(--ivory-dim)', fontFamily: 'var(--font-mono)' }} />
                    <input type="number" value={destLng.toFixed(4)} onChange={(e) => setDestLng(+e.target.value)} placeholder="Lng" className="flex-1 rounded-lg px-3 py-2 text-xs outline-none" style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(90,107,96,0.2)', color: 'var(--ivory-dim)', fontFamily: 'var(--font-mono)' }} />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 rounded-xl py-3 text-xs font-semibold uppercase tracking-wider transition-all hover:opacity-80"
                    style={{ background: 'rgba(90,107,96,0.18)', border: '1px solid rgba(90,107,96,0.3)', color: 'var(--ivory-dim)' }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-2 btn-emerald flex flex-1 items-center justify-center gap-2 rounded-xl py-3"
                  >
                    {submitting ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                    {submitting ? 'Matching…' : 'Find My Pool'}
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="glass rounded-2xl p-8 animate-fade-up">
                <div className="flex items-center gap-3 mb-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: 'rgba(0,96,57,0.25)' }}>
                    <CheckCircle size={22} style={{ color: 'var(--emerald-glow)' }} />
                  </div>
                  <div>
                    <h2 className="font-serif text-xl font-semibold" style={{ color: 'var(--ivory)' }}>Pool Matched!</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--emerald-soft)' }}>You&apos;re in a shared ride cluster</p>
                  </div>
                </div>
                {clusters.length > 0 && (() => {
                  const c = clusters[clusters.length - 1];
                  return (
                    <div className="rounded-xl p-5" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,96,57,0.25)' }}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="text-[10px] uppercase tracking-widest font-mono" style={{ color: 'var(--gold-dim)' }}>
                            POOL #{c.clusterId.replace(/^[A-Z]+-?/i, '').replace(/^-+/, '') || c.clusterId}
                          </div>
                          <div className="font-serif text-2xl font-bold mt-0.5" style={{ color: 'var(--ivory)' }}>₹{Math.round(c.discountedFarePerPersonRs)}<span className="text-sm ml-1 font-normal" style={{ color: 'var(--ivory-dim)' }}>/person</span></div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--gold-dim)' }}>Savings</div>
                          <div className="font-serif text-xl font-bold" style={{ color: 'var(--emerald-glow)' }}>{c.savingsPercentage.toFixed(0)}%</div>
                        </div>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--ivory-dim)' }}>
                        <span>{c.riders.length} riders · {c.sharedDistanceKm.toFixed(1)} km shared · drop at <strong>{c.dropOffSplitNodeName}</strong></span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {c.riders.map((r) => (
                          <span key={r.userId} className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: 'rgba(0,96,57,0.2)', color: 'var(--emerald-soft)' }}>
                            {r.studentName.split(' ')[0]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 rounded-xl py-3 text-xs font-semibold uppercase tracking-wider hover:opacity-80 transition-opacity"
                    style={{ background: 'rgba(90,107,96,0.18)', border: '1px solid rgba(90,107,96,0.3)', color: 'var(--ivory-dim)' }}
                  >
                    Book Another
                  </button>
                  <Link href="/pools" className="flex-1 btn-gold rounded-xl py-3 text-center text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2">
                    View All Pools <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* ── Right Map Panel ── */}
          <div className="glass rounded-2xl overflow-hidden" style={{ minHeight: 420, position: 'relative' }}>
            {pickMode && (
              <div
                className="absolute inset-x-0 top-0 z-20 flex items-center justify-center py-2 text-xs font-medium"
                style={{ background: 'rgba(212,175,55,0.9)', color: 'var(--obsidian)' }}
              >
                <MapPin size={12} className="mr-1" />
                Click map to set {pickMode === 'source' ? 'Pickup' : 'Drop-off'} · Press Esc to cancel
              </div>
            )}
            <MiniMap
              sourceLat={sourceLat} sourceLng={sourceLng}
              destLat={destLat}     destLng={destLng}
              pickMode={pickMode}
              onPick={handleMapPick}
              cluster={clusters[clusters.length - 1] ?? null}
              nodes={nodes}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


