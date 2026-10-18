// ─── Domain models matching the Spring Boot Java records exactly ───────────

export interface TransitNode {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Edge {
  targetNodeId: string;
  distanceKm: number;
}

export interface RideRequest {
  userId: string;
  studentName: string;
  sourceNodeId: string;
  destinationNodeId: string;
  departureTime: string;
  computedPath: string[];
  soloDistanceKm: number;
  soloFareRs: number;
}

export interface MatchCluster {
  clusterId: string;
  riders: RideRequest[];
  sharedCorridorNodeIds: string[];
  dropOffSplitNodeName: string;
  sharedDistanceKm: number;
  originalTotalFareRs: number;
  discountedFarePerPersonRs: number;
  savingsPercentage: number;
}

export interface SimulationResult {
  requests: RideRequest[];
  clusters: MatchCluster[];
  executionTimeMs: number;
  totalFareSavedRs: number;
}

export interface GraphData {
  nodes: TransitNode[];
  adjacency: Record<string, Edge[]>;
  peakMode: boolean;
}

export interface SnapInfo {
  sourceNodeId: string;
  sourceNodeName: string;
  sourceSnapDistKm: number;
  destNodeId: string;
  destNodeName: string;
  destSnapDistKm: number;
}

export interface SnapAndRequestResult extends SimulationResult {
  snap: SnapInfo;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type PickModeTarget = 'source' | 'dest' | null;

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface WeatherTelemetry {
  temperatureC: number;
  precipitationMm: number;
  isRaining: boolean;
  conditionText: string;
  recommendedSurgeMultiplier: number;
}
