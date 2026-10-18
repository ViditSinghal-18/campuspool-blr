'use client';

import { useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Polyline, useMapEvents, useMap } from 'react-leaflet';
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

function ClickHandler({ pickMode, onPick }: { pickMode: Props['pickMode']; onPick: Props['onPick'] }) {
  useMapEvents({
    click: (e) => {
      if (pickMode) onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function AutoFit({ sourceLat, sourceLng, destLat, destLng }: { sourceLat: number; sourceLng: number; destLat: number; destLng: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([[sourceLat, sourceLng], [destLat, destLng]]);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14, animate: true });
  }, [map, sourceLat, sourceLng, destLat, destLng]);
  return null;
}

const CLUSTER_COLORS = ['#10b981', '#d4af37', '#60a5fa', '#f472b6', '#a78bfa'];

export default function BookMiniMap({ sourceLat, sourceLng, destLat, destLng, pickMode, onPick, cluster, nodes }: Props) {
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
      <ClickHandler pickMode={pickMode} onPick={onPick} />
      <AutoFit sourceLat={sourceLat} sourceLng={sourceLng} destLat={destLat} destLng={destLng} />

      {/* All transit nodes */}
      {Object.values(NODES).map((node) => (
        <CircleMarker
          key={node.id}
          center={[node.lat, node.lng]}
          radius={5}
          pathOptions={{ color: 'rgba(0,96,57,0.9)', fillColor: 'rgba(0,96,57,0.6)', fillOpacity: 0.8, weight: 1.5 }}
        >
          <Tooltip className="custom-map-tooltip" permanent direction="top">{node.name}</Tooltip>
        </CircleMarker>
      ))}

      {/* Source marker */}
      <CircleMarker
        center={[sourceLat, sourceLng]}
        radius={9}
        pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.9, weight: 2 }}
      >
        <Tooltip className="custom-map-tooltip" permanent direction="top">📍 Pickup</Tooltip>
      </CircleMarker>

      {/* Dest marker */}
      <CircleMarker
        center={[destLat, destLng]}
        radius={9}
        pathOptions={{ color: '#d4af37', fillColor: '#d4af37', fillOpacity: 0.9, weight: 2 }}
      >
        <Tooltip className="custom-map-tooltip" permanent direction="top">🏁 Drop-off</Tooltip>
      </CircleMarker>

      {/* Direct line */}
      <Polyline
        positions={[[sourceLat, sourceLng], [destLat, destLng]]}
        pathOptions={{ color: 'rgba(16,185,129,0.5)', weight: 2, dashArray: '6 4' }}
      />

      {/* Cluster corridor */}
      {cluster && cluster.sharedCorridorNodeIds.length > 1 && (() => {
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
