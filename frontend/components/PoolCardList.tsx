'use client';

import React from 'react';
import {
  Users,
  Route,
  ArrowRight,
  TrendingDown,
  Sparkles,
  MapPin,
  Clock,
  Layers,
  CarFront,
} from 'lucide-react';
import { MatchCluster } from '../lib/types';

interface PoolCardListProps {
  clusters: MatchCluster[];
  selectedClusterId: string | null;
  onSelectCluster: (cluster: MatchCluster) => void;
  clusterColors: string[];
}

export const PoolCardList: React.FC<PoolCardListProps> = ({
  clusters,
  selectedClusterId,
  onSelectCluster,
  clusterColors,
}) => {
  if (clusters.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center space-y-2">
        <Users className="w-8 h-8 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-300">No Active Pool Clusters</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">
          Click the emerald <strong className="text-emerald-400">⚡ Populate 15 Mock Commuters</strong> CTA above or request a custom ride to see graph matches in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <Layers className="w-4 h-4 text-emerald-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Matched Pool Clusters ({clusters.length})
          </h2>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">
          Click card to isolate route on map
        </span>
      </div>

      <div className="space-y-2.5">
        {clusters.map((cluster, idx) => {
          const isSelected = selectedClusterId === cluster.clusterId;
          const isMultiRider = cluster.riders.length > 1;
          const color = clusterColors[idx % clusterColors.length];

          // Check if riders boarded at different source hubs (en-route pickup)
          const sourceHubs = Array.from(new Set(cluster.riders.map((r) => r.sourceNodeId)));
          const isEnRoutePickup = sourceHubs.length > 1;

          // Time range
          const times = cluster.riders.map((r) => r.departureTime).sort();
          const timeWindowStr =
            times.length > 1
              ? `${times[0]} - ${times[times.length - 1]}`
              : times[0] || '16:00';

          return (
            <div
              key={cluster.clusterId}
              onClick={() => onSelectCluster(cluster)}
              style={{
                borderColor: isSelected ? color : undefined,
              }}
              className={`group relative rounded-xl p-3.5 transition-all cursor-pointer border ${
                isSelected
                  ? 'bg-slate-900/95 shadow-xl ring-1'
                  : 'bg-slate-900/70 border-slate-800/90 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              {/* Active selection glow pill */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-xs font-mono font-bold text-slate-200">
                    {cluster.clusterId}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/60">
                    {cluster.riders.length} {cluster.riders.length === 1 ? 'Rider' : 'Riders'}
                  </span>
                  {isEnRoutePickup && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/60 flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-cyan-400" /> En-Route Pickup
                    </span>
                  )}
                </div>

                {/* Savings Pill */}
                {isMultiRider && cluster.savingsPercentage > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-sm animate-pulse">
                    <TrendingDown className="w-3 h-3" />
                    {cluster.savingsPercentage}% Fare Saved
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono">Solo Commute</span>
                )}
              </div>

              {/* Riders & departure times */}
              <div className="my-2 space-y-1 bg-slate-950/60 rounded-lg p-2 border border-slate-800/60">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1 border-b border-slate-800/60 pb-1">
                  <span className="flex items-center gap-1 font-medium text-slate-300">
                    <CarFront className="w-3 h-3 text-slate-400" /> Commuters
                  </span>
                  <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-400">
                    <Clock className="w-2.5 h-2.5" /> Window: {timeWindowStr}
                  </span>
                </div>
                <div className="space-y-1">
                  {cluster.riders.map((rider) => (
                    <div
                      key={rider.userId}
                      className="flex items-center justify-between text-[11px] font-medium"
                    >
                      <div className="flex items-center space-x-1.5 truncate max-w-[210px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                        <span className="text-slate-200 truncate">{rider.studentName}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-[10px] font-mono text-slate-400">
                        <span className="text-slate-400">{rider.sourceNodeId}</span>
                        <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
                        <span className="text-slate-400">{rider.destinationNodeId}</span>
                        <span className="text-cyan-400 font-semibold bg-cyan-950/80 px-1 rounded">
                          {rider.departureTime}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contiguous Shared Corridor */}
              <div className="my-2">
                <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1 mb-1">
                  <Route className="w-3 h-3 text-slate-500" />
                  <span>Shared Corridor ({cluster.sharedDistanceKm} km):</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 font-mono text-[10px]">
                  {cluster.sharedCorridorNodeIds.map((nodeId, nIdx) => (
                    <React.Fragment key={`${cluster.clusterId}-${nodeId}-${nIdx}`}>
                      <span
                        className={`px-1.5 py-0.5 rounded font-semibold ${
                          sourceHubs.includes(nodeId)
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                            : nIdx === cluster.sharedCorridorNodeIds.length - 1
                            ? 'bg-rose-950 text-rose-300 border border-rose-800/80'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {nodeId}
                      </span>
                      {nIdx < cluster.sharedCorridorNodeIds.length - 1 && (
                        <ArrowRight className="w-2.5 h-2.5 text-slate-600" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Fare comparison footer */}
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <div className="text-slate-400 text-[11px]">
                  {isMultiRider ? (
                    <span>
                      Orig Solo: <span className="line-through text-slate-500">₹{cluster.originalTotalFareRs}</span>
                    </span>
                  ) : (
                    <span>Solo Meter Fare</span>
                  )}
                </div>
                <div className="flex items-baseline space-x-1 font-mono">
                  <span className="text-[10px] text-slate-400">Split Fare:</span>
                  <span className="text-sm font-bold text-emerald-400">
                    ₹{cluster.discountedFarePerPersonRs}
                  </span>
                  <span className="text-[10px] text-slate-400">/rider</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
