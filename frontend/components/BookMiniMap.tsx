'use client';

import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  Polyline,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import type { LatLng, MatchCluster, TransitNode } from '../lib/types';
import { NODES } from '../lib/fallbackEngine';

interface Props {
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
  pickMode: 'source' | 'dest' | null;
  onPick: (latlng: LatLng) => void;
  cluster: MatchCluster | null;
  nodes: TransitNode[];
}

// Permanent tooltips shown only for these 5 hubs; others show on hover or zoom >= 13 (matching Radar)
const PERMANENT_STATION_IDS = new Set([
  'RVCE',
  'MAJESTIC',
  'INDIRANAGAR',
  'KENGERI',
  'BANASHANKARI',
]);

function ClickHandler({
  pickMode,
  onPick,
}: {
  pickMode: Props['pickMode'];
  onPick: Props['onPick'];
}) {
  useMapEvents({
    click: (e) => {
      if (pickMode) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function AutoFit({
  sourceLat,
  sourceLng,
  destLat,
  destLng,
}: {
  sourceLat: number;
  sourceLng: number;
  destLat: number;
  destLng: number;
}) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([
      [sourceLat, sourceLng],
      [destLat, destLng],
    ]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
  }, [map, sourceLat, sourceLng, destLat, destLng]);
  return null;
}

function ZoomWatcher({
  onZoomChange,
}: {
  onZoomChange: (zoom: number) => void;
}) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  return null;
}

function MapResizeHandler() {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 400);

    const handleResize = () => {
      map.invalidateSize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);

  return null;
}

export default function BookMiniMap({
  sourceLat,
  sourceLng,
  destLat,
  destLng,
  pickMode,
  onPick,
  cluster,
  nodes,
}: Props) {
  const [currentZoom, setCurrentZoom] = useState(12);

  const displayNodes =
    nodes && nodes.length > 0 ? nodes : Object.values(NODES);

  return (
    <MapContainer
      center={[12.948, 77.555]}
      zoom={12}
      style={{ width: '100%', height: '100%', minHeight: 420 }}
      zoomControl={true}
      attributionControl={false}
      className={pickMode ? 'cursor-crosshair' : ''}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap"
      />
      <MapResizeHandler />
      <ZoomWatcher onZoomChange={setCurrentZoom} />
      <ClickHandler pickMode={pickMode} onPick={onPick} />
      <AutoFit
        sourceLat={sourceLat}
        sourceLng={sourceLng}
        destLat={destLat}
        destLng={destLng}
      />

      {/* Transit stations: matching Radar rules */}
      {displayNodes.map((node) => {
        const isRVCE = node.id === 'RVCE';
        const isPattanagere =
          node.id === 'PATTANAGERE' ||
          node.name.toLowerCase().includes('pattanagere');

        // Permanent tooltips only for RVCE Campus, Majestic, Indiranagar, Kengeri, and Banashankari.
        // Other station names show on hover, or when zoom >= 13.
        const isPermanent =
          PERMANENT_STATION_IDS.has(node.id) || currentZoom >= 13;

        // RVCE Campus direction "top", Pattanagere "bottom" with offsets so none overlap
        const tooltipDirection: 'top' | 'bottom' = isPattanagere
          ? 'bottom'
          : 'top';
        const tooltipOffset: [number, number] = isPattanagere
          ? [0, 10]
          : isRVCE
          ? [0, -10]
          : [0, -8];

        return (
          <CircleMarker
            key={node.id}
            center={[node.lat, node.lng]}
            radius={isRVCE ? 7.5 : 5.5}
            pathOptions={{
              color: isRVCE ? '#10b981' : 'rgba(0,96,57,0.9)',
              fillColor: isRVCE ? '#047857' : 'rgba(0,96,57,0.6)',
              fillOpacity: 0.85,
              weight: isRVCE ? 2.5 : 1.5,
            }}
          >
            <Tooltip
              key={`${node.id}-${isPermanent ? 'perm' : 'hover'}`}
              className="custom-map-tooltip font-sans"
              permanent={isPermanent}
              direction={tooltipDirection}
              offset={tooltipOffset}
              opacity={0.95}
            >
              <span
                className={
                  isRVCE
                    ? 'text-emerald-400 font-bold'
                    : 'text-slate-100 font-medium'
                }
              >
                {node.name}
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Source marker - offset to left so it never covers top/bottom station labels */}
      <CircleMarker
        center={[sourceLat, sourceLng]}
        radius={9}
        pathOptions={{
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.9,
          weight: 2.5,
        }}
      >
        <Tooltip
          className="custom-map-tooltip font-sans"
          permanent
          direction="left"
          offset={[-14, 0]}
          opacity={0.95}
        >
          <span className="font-semibold text-emerald-400 whitespace-nowrap">
            📍 Pickup
          </span>
        </Tooltip>
      </CircleMarker>

      {/* Dest marker - offset to right so it never covers top/bottom station labels */}
      <CircleMarker
        center={[destLat, destLng]}
        radius={9}
        pathOptions={{
          color: '#d4af37',
          fillColor: '#d4af37',
          fillOpacity: 0.9,
          weight: 2.5,
        }}
      >
        <Tooltip
          className="custom-map-tooltip font-sans"
          permanent
          direction="right"
          offset={[14, 0]}
          opacity={0.95}
        >
          <span className="font-semibold text-amber-300 whitespace-nowrap">
            🏁 Drop-off
          </span>
        </Tooltip>
      </CircleMarker>

      {/* Direct line */}
      <Polyline
        positions={[
          [sourceLat, sourceLng],
          [destLat, destLng],
        ]}
        pathOptions={{
          color: 'rgba(16,185,129,0.5)',
          weight: 2,
          dashArray: '6 4',
        }}
      />

      {/* Cluster corridor */}
      {cluster &&
        cluster.sharedCorridorNodeIds.length > 1 &&
        (() => {
          const coords = cluster.sharedCorridorNodeIds
            .map((id) => NODES[id])
            .filter(Boolean)
            .map((n): [number, number] => [n.lat, n.lng]);
          return (
            <Polyline
              positions={coords}
              pathOptions={{ color: '#10b981', weight: 3, opacity: 0.9 }}
            />
          );
        })()}
    </MapContainer>
  );
}
