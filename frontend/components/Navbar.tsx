'use client';

import React from 'react';
import {
  Car,
  ExternalLink,
  Flame,
  ShieldCheck,
  Zap,
  Server,
  Radio,
} from 'lucide-react';

import { WeatherTelemetry } from '../lib/types';

interface NavbarProps {
  peakMode: boolean;
  onTogglePeakMode: () => void;
  isBackendLive: boolean;
  isTogglingPeak: boolean;
  activePoolCount: number;
  weather: WeatherTelemetry | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  peakMode,
  onTogglePeakMode,
  isBackendLive,
  isTogglingPeak,
  activePoolCount,
  weather,
}) => {
  return (
    <header className="h-16 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md px-4 lg:px-6 flex items-center justify-between z-30 select-none">
      {/* Brand & RVCE Badge */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 shadow-lg shadow-emerald-500/20 text-slate-950">
          <Car className="w-5 h-5 font-bold" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
        </div>

        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-emerald-400 bg-clip-text text-transparent">
              CampusPool BLR
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shadow-sm">
              <ShieldCheck className="w-3 h-3" />
              Verified: @rvce.edu.in
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden md:block">
            Autonomous Graph Matcher · Bengaluru Purple Line &amp; Mysore Rd Corridor
          </p>
        </div>
      </div>

      {/* Center / Right controls */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* Live Bengaluru Weather & Rain Surge Pill */}
        {weather && (
          <div
            className={`hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold border backdrop-blur-md shadow-sm transition-all ${
              weather.isRaining || weather.recommendedSurgeMultiplier > 1.0
                ? 'bg-blue-950/80 border-blue-500/60 text-blue-200 shadow-blue-950/50'
                : 'bg-slate-900/90 border-slate-700/60 text-slate-200'
            }`}
            title={`Live Bengaluru Weather (Open-Meteo): ${weather.precipitationMm}mm rain, ${weather.recommendedSurgeMultiplier}x surge multiplier`}
          >
            <span className="text-sm">
              {weather.isRaining ? '🌧️' : '🌤️'}
            </span>
            <span className="font-mono">
              Bengaluru Live: {Math.round(weather.temperatureC)}°C {weather.conditionText}
            </span>
            {weather.recommendedSurgeMultiplier > 1.0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-blue-900/90 text-blue-300 border border-blue-400/40 font-bold animate-pulse">
                {weather.recommendedSurgeMultiplier}x Rain Surge Active
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800/60">
                Normal Rates
              </span>
            )}
          </div>
        )}

        {/* Backend health status pill */}
        <div
          className={`hidden xl:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium border ${
            isBackendLive
              ? 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
              : 'bg-cyan-950/50 border-cyan-800/60 text-cyan-300'
          }`}
          title={
            isBackendLive
              ? 'Connected to Spring Boot microservice on port 8080'
              : 'Standalone Vercel Mode: Interactive Client-Side Simulation Engine Active'
          }
        >
          <Server className="w-3.5 h-3.5" />
          <span>{isBackendLive ? 'Live Engine :8080' : 'Vercel Standalone Engine'}</span>
          <span
            className={`w-2 h-2 rounded-full ${
              isBackendLive ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400 animate-pulse'
            }`}
          />
        </div>

        {/* Peak Traffic Mode Switch */}
        <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5 shadow-inner">
          <div className="flex items-center space-x-1.5 text-xs font-semibold">
            <Flame
              className={`w-4 h-4 transition-colors ${
                peakMode ? 'text-amber-400 animate-pulse' : 'text-slate-500'
              }`}
            />
            <span className="hidden lg:inline text-slate-300">
              Peak Traffic Mode{' '}
              <span className="text-[10px] text-amber-400 font-mono">(1.4x Choke)</span>
            </span>
            <span className="lg:hidden text-slate-300 text-xs">Peak</span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={peakMode}
            disabled={isTogglingPeak}
            onClick={onTogglePeakMode}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-950 ${
              peakMode ? 'bg-amber-500' : 'bg-slate-700'
            } ${isTogglingPeak ? 'opacity-50 cursor-wait' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                peakMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* OpenAPI Swagger link */}
        <a
          href="http://localhost:8080/swagger-ui.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition shadow-sm"
        >
          <span>API Docs (OpenAPI)</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </header>
  );
};
