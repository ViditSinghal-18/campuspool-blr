'use client';

import React from 'react';
import { Activity, Clock, Network, PiggyBank, Users } from 'lucide-react';

interface TelemetryBentoProps {
  nodeCount: number;
  latencyMs: number;
  activePools: number;
  totalSavedRs: number;
  peakMode: boolean;
}

export const TelemetryBento: React.FC<TelemetryBentoProps> = ({
  nodeCount,
  latencyMs,
  activePools,
  totalSavedRs,
  peakMode,
}) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3">
      {/* 1. Active Nodes */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-md hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Active Nodes</span>
          <Network className="w-3.5 h-3.5 text-cyan-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-slate-100">{nodeCount}</span>
          <span className="text-[10px] text-slate-400 font-medium">transit hubs</span>
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>Purple Line Spine</span>
        </div>
      </div>

      {/* 2. Latency */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-md hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Engine Latency</span>
          <Clock className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-violet-300">{latencyMs}</span>
          <span className="text-[10px] text-slate-400 font-medium">ms</span>
        </div>
        <div className="mt-1 text-[10px] text-slate-400 flex items-center gap-1 font-mono">
          <span>O(V+E) Dijkstra</span>
        </div>
      </div>

      {/* 3. Active Pools */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-md hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Active Pools</span>
          <Users className="w-3.5 h-3.5 text-emerald-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-emerald-300">{activePools}</span>
          <span className="text-[10px] text-slate-400 font-medium">clusters</span>
        </div>
        <div className="mt-1 text-[10px] text-emerald-400/90 font-medium flex items-center gap-1">
          <span>15-min Sliding Win</span>
        </div>
      </div>

      {/* 4. Fare Saved */}
      <div className="relative overflow-hidden rounded-xl bg-slate-900/80 border border-slate-800/80 p-3 shadow-md hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-[11px] font-medium tracking-wide uppercase">Total Fare Saved</span>
          <PiggyBank className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex items-baseline space-x-1.5">
          <span className="text-xl font-bold font-mono text-emerald-400">₹{totalSavedRs}</span>
        </div>
        <div className="mt-1 text-[10px] text-amber-300/80 font-medium flex items-center gap-1">
          <span>{peakMode ? 'Peak surge shared' : 'Pooled savings'}</span>
        </div>
      </div>
    </div>
  );
};
