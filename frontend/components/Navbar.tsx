'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePool } from '../context/PoolContext';
import { API_BASE } from '../lib/api';
import { ExternalLink, CloudRain, Sun, CloudSnow, Zap, Activity } from 'lucide-react';

const NAV_LINKS = [
  { href: '/',       label: 'Home'  },
  { href: '/book',   label: 'Book'  },
  { href: '/pools',  label: 'Pools' },
  { href: '/radar',  label: 'Radar' },
];

export default function Navbar() {
  const pathname = usePathname();
  const { weather, peakMode, handleTogglePeakMode, isBackendLive } = usePool();

  const weatherIcon = weather?.isRaining
    ? <CloudRain size={13} className="text-blue-400 shrink-0" />
    : weather?.conditionText?.toLowerCase().includes('snow')
    ? <CloudSnow size={13} className="text-blue-200 shrink-0" />
    : <Sun size={13} className="shrink-0" style={{ color: 'var(--gold)' }} />;

  const surgeLabel = weather?.isRaining
    ? `${weather.recommendedSurgeMultiplier.toFixed(2)}x Rain Surge`
    : 'Normal';

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 glass"
      style={{ borderBottom: '1px solid var(--glass-border)' }}
    >
      <div className="mx-auto flex h-14 max-w-screen-xl items-center px-4 gap-3 sm:gap-4 md:gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <span
            className="animate-pulse-dot h-2 w-2 rounded-full"
            style={{ backgroundColor: 'var(--emerald-glow)' }}
          />
          <span
            className="font-serif text-base font-semibold tracking-wide"
            style={{ color: 'var(--ivory)' }}
          >
            Campus
            <span style={{ color: 'var(--emerald-glow)' }}>Pool</span>
            <span className="text-xs ml-1" style={{ color: 'var(--gold)' }}>BLR</span>
          </span>
          <span
            className="hidden md:inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{ background: 'rgba(0,96,57,0.25)', color: 'var(--emerald-soft)', border: '1px solid rgba(0,96,57,0.4)' }}
          >
            @rvce.edu.in
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 flex-1">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200"
                style={{
                  color: active ? 'var(--emerald-glow)' : 'var(--ivory-dim)',
                  background: active ? 'rgba(0,96,57,0.18)' : 'transparent',
                }}
              >
                {link.label}
                {active && (
                  <span
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-3/4 rounded-full"
                    style={{ background: 'var(--emerald-glow)', opacity: 0.7 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Weather Chip (Shown consistently across views and screen sizes) */}
        {weather && (
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 text-xs shrink-0 transition-all"
            style={{
              background: weather.isRaining ? 'rgba(59,130,246,0.12)' : 'rgba(0,96,57,0.12)',
              border: `1px solid ${weather.isRaining ? 'rgba(59,130,246,0.3)' : 'rgba(0,96,57,0.3)'}`,
              color: 'var(--ivory-dim)',
            }}
          >
            {weatherIcon}
            <span className="font-mono text-xs">{weather.temperatureC.toFixed(1)}°C</span>
            <span className="opacity-60 hidden sm:inline">·</span>
            <span
              className="hidden sm:inline font-medium"
              style={{ color: weather.isRaining ? '#93c5fd' : 'var(--emerald-soft)' }}
            >
              {surgeLabel}
            </span>
          </div>
        )}

        {/* Peak Toggle (Shown consistently across views and screen sizes) */}
        <button
          onClick={handleTogglePeakMode}
          className="flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all duration-200 shrink-0"
          style={{
            background: peakMode ? 'rgba(212,175,55,0.15)' : 'rgba(90,107,96,0.18)',
            border: `1px solid ${peakMode ? 'rgba(212,175,55,0.35)' : 'rgba(90,107,96,0.3)'}`,
            color: peakMode ? 'var(--gold)' : 'var(--ivory-dim)',
          }}
          title="Toggle 1.4x Peak Traffic Dijkstra weight scaling"
        >
          <Zap size={12} className={peakMode ? 'text-amber-400' : 'text-slate-400'} />
          <span>Peak {peakMode ? 'ON' : 'OFF'}</span>
        </button>

        {/* Backend status */}
        <div className="flex items-center gap-1.5 text-[10px] shrink-0" style={{ color: 'var(--slate-light)' }}>
          <Activity size={11} style={{ color: isBackendLive ? 'var(--emerald-glow)' : '#f59e0b' }} />
          <span className="hidden sm:inline">{isBackendLive ? 'Live API' : 'Demo mode'}</span>
        </div>

        {/* API Docs */}
        <a
          href={`${API_BASE}/swagger-ui.html`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden lg:flex items-center gap-1 rounded-lg px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:opacity-80 shrink-0"
          style={{
            background: 'rgba(90,107,96,0.14)',
            border: '1px solid rgba(90,107,96,0.28)',
            color: 'var(--ivory-dim)',
          }}
        >
          <ExternalLink size={11} />
          <span>API Docs</span>
        </a>
      </div>
    </header>
  );
}
