'use client';

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Crosshair,
  Send,
  Navigation,
  Clock,
  User,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { LatLng, PickModeTarget, SnapInfo, TransitNode } from '../lib/types';
import { NODES } from '../lib/fallbackEngine';

interface RideRequestPanelProps {
  onRequestRide: (params: {
    studentName: string;
    sourceLat: number;
    sourceLng: number;
    destLat: number;
    destLng: number;
    departureTime: string;
  }) => Promise<void>;
  isSubmittingRide: boolean;
  pickTarget: PickModeTarget;
  setPickTarget: (target: PickModeTarget) => void;
  pickedPickup: LatLng | null;
  pickedDropoff: LatLng | null;
  lastSnapInfo: SnapInfo | null;
  nodesList: TransitNode[];
}

export const RideRequestPanel: React.FC<RideRequestPanelProps> = ({
  onRequestRide,
  isSubmittingRide,
  pickTarget,
  setPickTarget,
  pickedPickup,
  pickedDropoff,
  lastSnapInfo,
  nodesList,
}) => {
  // Unlocked state for all form fields with Vidit Singhal default
  const [studentName, setStudentName] = useState('Vidit Singhal (RVCE CSE)');
  const [departureTime, setDepartureTime] = useState('16:15');

  // Input coordinate state (fully editable & reactive to map picks)
  const [sourceLat, setSourceLat] = useState('12.9237');
  const [sourceLng, setSourceLng] = useState('77.4987');
  const [destLat, setDestLat] = useState('12.9784');
  const [destLng, setDestLng] = useState('77.6408');

  const [selectedSrcNode, setSelectedSrcNode] = useState('RVCE');
  const [selectedDstNode, setSelectedDstNode] = useState('INDIRANAGAR');

  // When picked from map, update local coordinate state
  useEffect(() => {
    if (pickedPickup) {
      setSourceLat(pickedPickup.lat.toFixed(5));
      setSourceLng(pickedPickup.lng.toFixed(5));
      setSelectedSrcNode('CUSTOM');
    }
  }, [pickedPickup]);

  useEffect(() => {
    if (pickedDropoff) {
      setDestLat(pickedDropoff.lat.toFixed(5));
      setDestLng(pickedDropoff.lng.toFixed(5));
      setSelectedDstNode('CUSTOM');
    }
  }, [pickedDropoff]);

  const handleSelectSrcNode = (id: string) => {
    setSelectedSrcNode(id);
    if (id !== 'CUSTOM' && NODES[id]) {
      setSourceLat(NODES[id].lat.toFixed(5));
      setSourceLng(NODES[id].lng.toFixed(5));
    }
  };

  const handleSelectDstNode = (id: string) => {
    setSelectedDstNode(id);
    if (id !== 'CUSTOM' && NODES[id]) {
      setDestLat(NODES[id].lat.toFixed(5));
      setDestLng(NODES[id].lng.toFixed(5));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sLat = parseFloat(sourceLat);
    const sLng = parseFloat(sourceLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (isNaN(sLat) || isNaN(sLng) || isNaN(dLat) || isNaN(dLng)) {
      alert('Please enter valid numeric latitude and longitude coordinates.');
      return;
    }

    await onRequestRide({
      studentName: studentName.trim() || 'Vidit Singhal (RVCE CSE)',
      sourceLat: sLat,
      sourceLng: sLng,
      destLat: dLat,
      destLng: dLng,
      departureTime: departureTime.trim() || '16:15',
    });
  };

  return (
    <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 shadow-lg space-y-3.5">
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2">
          <Crosshair className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-bold text-slate-100 tracking-tight">
            Click-to-Snap GPS Ride Request
          </h2>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
          Haversine Snapping
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 text-xs">
        {/* Commuter Name & Time */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1 flex items-center gap-1">
              <User className="w-3 h-3 text-slate-500" /> Student / Staff Name
            </label>
            <input
              type="text"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="Vidit Singhal (RVCE CSE)"
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none transition font-mono"
              required
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 font-medium mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-500" /> Departure Time (HH:MM)
            </label>
            <input
              type="text"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              placeholder="16:15"
              className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none transition font-mono"
              required
            />
          </div>
        </div>

        {/* Pickup Selection */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              Pickup Origin
            </span>
            <button
              type="button"
              onClick={() => setPickTarget(pickTarget === 'source' ? null : 'source')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition ${
                pickTarget === 'source'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20 animate-pulse'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Crosshair className="w-2.5 h-2.5" />
              {pickTarget === 'source' ? 'Click Map for Pickup' : 'Pick on Map'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Preset Hub</label>
              <select
                value={selectedSrcNode}
                onChange={(e) => handleSelectSrcNode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-300 text-[11px] focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="CUSTOM">Custom GPS</option>
                {nodesList.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Latitude</label>
              <input
                type="text"
                value={sourceLat}
                onChange={(e) => {
                  setSourceLat(e.target.value);
                  setSelectedSrcNode('CUSTOM');
                }}
                placeholder="12.9237"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Longitude</label>
              <input
                type="text"
                value={sourceLng}
                onChange={(e) => {
                  setSourceLng(e.target.value);
                  setSelectedSrcNode('CUSTOM');
                }}
                placeholder="77.4987"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Drop-off Selection */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1.5">
              <Navigation className="w-3.5 h-3.5 text-rose-400" />
              Drop-off Destination
            </span>
            <button
              type="button"
              onClick={() => setPickTarget(pickTarget === 'dest' ? null : 'dest')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 transition ${
                pickTarget === 'dest'
                  ? 'bg-rose-500 text-slate-950 shadow-md shadow-rose-500/20 animate-pulse'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Crosshair className="w-2.5 h-2.5" />
              {pickTarget === 'dest' ? 'Click Map for Drop-off' : 'Pick on Map'}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Preset Hub</label>
              <select
                value={selectedDstNode}
                onChange={(e) => handleSelectDstNode(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-300 text-[11px] focus:outline-none focus:border-rose-500 cursor-pointer"
              >
                <option value="CUSTOM">Custom GPS</option>
                {nodesList.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Latitude</label>
              <input
                type="text"
                value={destLat}
                onChange={(e) => {
                  setDestLat(e.target.value);
                  setSelectedDstNode('CUSTOM');
                }}
                placeholder="12.9784"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
            <div className="col-span-1">
              <label className="block text-[10px] text-slate-500 mb-0.5">Longitude</label>
              <input
                type="text"
                value={destLng}
                onChange={(e) => {
                  setDestLng(e.target.value);
                  setSelectedDstNode('CUSTOM');
                }}
                placeholder="77.6408"
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-[11px] font-mono focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmittingRide}
          className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.99] text-slate-950 shadow-lg shadow-emerald-950/40 flex items-center justify-center space-x-2 transition disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5 fill-slate-950" />
          <span>
            {isSubmittingRide ? 'Snapping Coordinates & Matching Pools...' : 'Snap Coordinates & Request Pool'}
          </span>
        </button>
      </form>

      {/* Live Snapping Toast / Badge Feedback */}
      {lastSnapInfo && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/50 text-emerald-200 text-[11px] space-y-1.5 animate-fadeIn">
          <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>Haversine GPS Snapped Successfully</span>
          </div>
          <div className="font-mono text-[10px] text-slate-300 pl-5">
            Pickup snapped to{' '}
            <strong className="text-emerald-300 font-bold">{lastSnapInfo.sourceNodeName}</strong>{' '}
            ({lastSnapInfo.sourceSnapDistKm} km away)
          </div>
          <div className="font-mono text-[10px] text-slate-300 pl-5">
            Drop-off snapped to{' '}
            <strong className="text-emerald-300 font-bold">{lastSnapInfo.destNodeName}</strong>{' '}
            ({lastSnapInfo.destSnapDistKm} km away)
          </div>
        </div>
      )}
    </div>
  );
};
