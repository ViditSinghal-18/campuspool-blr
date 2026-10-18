package com.rvce.campuspool.engine;

import com.rvce.campuspool.model.Models.Edge;
import com.rvce.campuspool.model.Models.TransitNode;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * In-memory weighted undirected graph for the Bengaluru Purple Line /
 * Mysore Road corridor.
 *
 * <p>Node set (11 real stations):
 * RVCE, PATTANAGERE, KENGERI, RR_NAGAR, NAYANDAHALLI, MYSORE_RD,
 * VIJAYANAGAR, MAJESTIC, MG_ROAD, INDIRANAGAR, BANASHANKARI.
 *
 * <h3>Upgrades (v2)</h3>
 * <ul>
 *   <li><b>Haversine GPS snapping</b> — {@link #snapToNearestNode(double, double)}
 *       maps raw GPS coordinates to the closest transit hub.</li>
 *   <li><b>Peak congestion multipliers</b> — NAYANDAHALLI, MYSORE_RD, and
 *       MAJESTIC edges carry a 1.4× traffic factor during peak hours.</li>
 *   <li><b>LCCS shared corridor</b> — {@link #findSharedCorridor(List, List)}
 *       now finds the <em>Longest Common Contiguous Subpath</em> instead of
 *       a strict common prefix, enabling en-route pickup matching.</li>
 * </ul>
 *
 * <p>Fare model: Rs 16 per km (on effective congested distance), min Rs 30.
 * Thread safety: {@code peakMode} flag is an {@link AtomicBoolean}.
 */
@Component
public class BengaluruGraphEngine {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    private static final double FARE_PER_KM      = 16.0;
    private static final double MIN_FARE          = 30.0;
    private static final double PEAK_MULTIPLIER   = 1.4;
    private static final double EARTH_RADIUS_KM   = 6371.0;

    /** Nodes whose outgoing edges get the 1.4× peak factor when peak is active. */
    private static final Set<String> CONGESTED_NODES =
            Set.of("NAYANDAHALLI", "MYSORE_RD", "MAJESTIC");

    // -----------------------------------------------------------------------
    // Thread-safe state
    // -----------------------------------------------------------------------

    /**
     * Controls whether Dijkstra applies peak-hour congestion weights.
     * Toggle via {@link #setPeakMode(boolean)}.
     */
    private final AtomicBoolean peakMode = new AtomicBoolean(false);

    // -----------------------------------------------------------------------
    // Graph state (populated once at startup, read-only thereafter)
    // -----------------------------------------------------------------------

    /** Master node registry: nodeId → TransitNode */
    private final Map<String, TransitNode> nodes = new LinkedHashMap<>();

    /**
     * Adjacency list (directed): nodeId → List&lt;Edge&gt;.
     * Stored as raw (non-congested) distances; congestion is applied on-the-fly
     * in Dijkstra so toggling peakMode affects subsequent calls immediately.
     */
    private final Map<String, List<Edge>> adjacency = new HashMap<>();

    // -----------------------------------------------------------------------
    // Graph initialisation
    // -----------------------------------------------------------------------

    @PostConstruct
    public void initGraph() {
        // --- Nodes ----------------------------------------------------------------
        addNode("RVCE",          "RVCE Campus",          12.9237, 77.4987);
        addNode("PATTANAGERE",   "Pattanagere",          12.9244, 77.4981);
        addNode("KENGERI",       "Kengeri",              12.9172, 77.4833);
        addNode("RR_NAGAR",      "Rajarajeshwari Nagar", 12.9275, 77.5165);
        addNode("NAYANDAHALLI",  "Nayandahalli",         12.9416, 77.5256);
        addNode("MYSORE_RD",     "Mysore Road",          12.9467, 77.5301);
        addNode("VIJAYANAGAR",   "Vijayanagar",          12.9709, 77.5376);
        addNode("MAJESTIC",      "Majestic (KSR)",       12.9767, 77.5713);
        addNode("MG_ROAD",       "MG Road",              12.9756, 77.6066);
        addNode("INDIRANAGAR",   "Indiranagar",          12.9784, 77.6408);
        addNode("BANASHANKARI",  "Banashankari",         12.9152, 77.5736);

        // --- Edges (undirected — each pair added in both directions) ---------------
        // Distances are calibrated road distances (km) — congestion applied runtime.
        //
        // Main Mysore-Road spine (west → east)
        addUndirectedEdge("KENGERI",      "PATTANAGERE",  1.8);
        addUndirectedEdge("PATTANAGERE",  "RVCE",         0.8);
        addUndirectedEdge("RVCE",         "RR_NAGAR",     3.2);
        addUndirectedEdge("RR_NAGAR",     "NAYANDAHALLI", 3.1);
        addUndirectedEdge("NAYANDAHALLI", "MYSORE_RD",    1.2);
        addUndirectedEdge("MYSORE_RD",    "VIJAYANAGAR",  3.8);
        addUndirectedEdge("VIJAYANAGAR",  "MAJESTIC",     4.5);
        addUndirectedEdge("MAJESTIC",     "MG_ROAD",      3.5);
        addUndirectedEdge("MG_ROAD",      "INDIRANAGAR",  3.4);

        // Southern branch — Banashankari interchange
        addUndirectedEdge("MAJESTIC",     "BANASHANKARI", 6.2);
        addUndirectedEdge("VIJAYANAGAR",  "BANASHANKARI", 5.0);
        addUndirectedEdge("NAYANDAHALLI", "BANASHANKARI", 5.5);
        addUndirectedEdge("RR_NAGAR",     "BANASHANKARI", 6.8);

        // Direct RVCE ↔ KENGERI shortcut (campus side-road)
        addUndirectedEdge("RVCE",    "KENGERI",  2.2);
        // Kengeri ↔ RR Nagar link road
        addUndirectedEdge("KENGERI", "RR_NAGAR", 4.7);
    }

    // -----------------------------------------------------------------------
    // Public API — graph access
    // -----------------------------------------------------------------------

    /** Returns an unmodifiable view of all transit nodes. */
    public Map<String, TransitNode> getAllNodes() {
        return Collections.unmodifiableMap(nodes);
    }

    /** Returns an unmodifiable view of the raw (non-congested) adjacency list. */
    public Map<String, List<Edge>> getAdjacency() {
        return Collections.unmodifiableMap(adjacency);
    }

    /**
     * Returns the {@link TransitNode} for a given ID, or {@code null} if unknown.
     */
    public TransitNode getNode(String id) {
        return nodes.get(id);
    }

    /** Returns {@code true} when peak-hour congestion weights are active. */
    public boolean isPeakMode() {
        return peakMode.get();
    }

    /**
     * Atomically toggles peak-hour congestion mode.
     * Thread-safe; Dijkstra reads this flag on every call.
     *
     * @param peak {@code true} to activate 1.4× multiplier on congested edges.
     */
    public void setPeakMode(boolean peak) {
        peakMode.set(peak);
    }

    // -----------------------------------------------------------------------
    // Public API — Haversine GPS snapping (NEW)
    // -----------------------------------------------------------------------

    /**
     * Snaps a raw GPS coordinate pair to the nearest transit node using the
     * Haversine great-circle distance formula.
     *
     * <p>Suitable for map-click inputs from the frontend — the caller receives
     * the closest network node together with the snapping distance in km so
     * the UI can display a "snapped to X (0.3 km away)" hint.
     *
     * @param lat WGS-84 latitude in decimal degrees.
     * @param lng WGS-84 longitude in decimal degrees.
     * @return The nearest {@link TransitNode}; never {@code null} if the graph
     *         is non-empty.
     */
    public TransitNode snapToNearestNode(double lat, double lng) {
        TransitNode nearest = null;
        double minDist = Double.MAX_VALUE;

        for (TransitNode node : nodes.values()) {
            double d = haversineKm(lat, lng, node.lat(), node.lng());
            if (d < minDist) {
                minDist = d;
                nearest = node;
            }
        }
        return nearest;
    }

    /**
     * Returns the Haversine great-circle distance in kilometres between two
     * WGS-84 coordinate pairs.
     *
     * @param lat1 Latitude of point 1 (decimal degrees).
     * @param lng1 Longitude of point 1 (decimal degrees).
     * @param lat2 Latitude of point 2 (decimal degrees).
     * @param lng2 Longitude of point 2 (decimal degrees).
     * @return Distance in kilometres.
     */
    public double haversineKm(double lat1, double lng1,
                               double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                 + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                   * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_KM * c;
    }

    // -----------------------------------------------------------------------
    // Public API — routing & fare
    // -----------------------------------------------------------------------

    /**
     * Dijkstra's shortest path from {@code sourceId} to {@code destinationId}.
     *
     * <p>When {@link #peakMode} is {@code true}, edges leaving NAYANDAHALLI,
     * MYSORE_RD, or MAJESTIC have their distance multiplied by
     * {@value #PEAK_MULTIPLIER} for routing purposes (higher effective cost
     * steers paths around congested segments and raises fares).
     *
     * @return Ordered list of node IDs (source → destination inclusive),
     *         or an empty list if no path exists.
     */
    public List<String> shortestPath(String sourceId, String destinationId) {
        if (!nodes.containsKey(sourceId) || !nodes.containsKey(destinationId)) {
            return List.of();
        }
        if (sourceId.equals(destinationId)) {
            return List.of(sourceId);
        }

        boolean peak = peakMode.get();

        Map<String, Double> dist = new HashMap<>();
        Map<String, String> prev = new HashMap<>();

        for (String id : nodes.keySet()) dist.put(id, Double.MAX_VALUE);
        dist.put(sourceId, 0.0);

        // Build a stable index so we can use double[] in the PriorityQueue
        Map<String, Integer> nodeIndex = new HashMap<>();
        int idx = 0;
        for (String id : nodes.keySet()) nodeIndex.put(id, idx++);

        String[] indexToNode = nodeIndex.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .toArray(String[]::new);

        // PriorityQueue entries: [effectiveDist, nodeIndex]
        PriorityQueue<double[]> pq =
                new PriorityQueue<>(Comparator.comparingDouble(e -> e[0]));
        pq.offer(new double[]{0.0, nodeIndex.get(sourceId)});

        Set<String> visited = new HashSet<>();

        while (!pq.isEmpty()) {
            double[] top   = pq.poll();
            String current = indexToNode[(int) top[1]];

            if (visited.contains(current)) continue;
            visited.add(current);
            if (current.equals(destinationId)) break;

            for (Edge edge : adjacency.getOrDefault(current, List.of())) {
                String neighbour = edge.targetNodeId();
                if (visited.contains(neighbour)) continue;

                // Apply peak multiplier when this edge leaves a congested node
                double edgeCost = edge.distanceKm();
                if (peak && CONGESTED_NODES.contains(current)) {
                    edgeCost *= PEAK_MULTIPLIER;
                }

                double newDist = dist.get(current) + edgeCost;
                if (newDist < dist.get(neighbour)) {
                    dist.put(neighbour, newDist);
                    prev.put(neighbour, current);
                    pq.offer(new double[]{newDist, nodeIndex.get(neighbour)});
                }
            }
        }

        if (dist.get(destinationId) == Double.MAX_VALUE) return List.of();

        LinkedList<String> path = new LinkedList<>();
        String step = destinationId;
        while (step != null) {
            path.addFirst(step);
            step = prev.get(step);
        }
        return Collections.unmodifiableList(path);
    }

    /**
     * Calculates the total raw road distance for an ordered list of node IDs
     * (ignores traffic factor — use for reporting, not routing).
     *
     * @param path List of consecutive node IDs.
     * @return Distance in km, or {@code 0.0} for paths shorter than 2 nodes.
     */
    public double pathDistance(List<String> path) {
        if (path == null || path.size() < 2) return 0.0;

        double total = 0.0;
        for (int i = 0; i < path.size() - 1; i++) {
            String from = path.get(i);
            String to   = path.get(i + 1);
            double seg  = adjacency.getOrDefault(from, List.of()).stream()
                    .filter(e -> e.targetNodeId().equals(to))
                    .mapToDouble(Edge::distanceKm)
                    .findFirst()
                    .orElse(0.0);
            total += seg;
        }
        return Math.round(total * 100.0) / 100.0;
    }

    /**
     * Estimates the solo auto fare in INR.
     * Formula: max(Rs 16 × distKm, Rs 30), rounded to nearest rupee.
     *
     * @param distanceKm Road distance in kilometres.
     * @return Fare in rupees.
     */
    public double soloFare(double distanceKm) {
        return Math.round(Math.max(FARE_PER_KM * distanceKm, MIN_FARE));
    }

    // -----------------------------------------------------------------------
    // Public API — shared corridor (LCCS — upgraded from prefix match)
    // -----------------------------------------------------------------------

    /**
     * Finds the <b>Longest Common Contiguous Subpath (LCCS)</b> shared between
     * two node-ID paths.
     *
     * <p>Unlike the old prefix-only approach, LCCS allows <em>en-route
     * pickup</em>: a rider starting at KENGERI whose path is
     * {@code [KENGERI, RVCE, RR_NAGAR, NAYANDAHALLI, MYSORE_RD, MAJESTIC]}
     * can be matched with a rider starting at RVCE whose path is
     * {@code [RVCE, RR_NAGAR, NAYANDAHALLI, MYSORE_RD, MAJESTIC, MG_ROAD]}
     * — they share the contiguous sub-sequence
     * {@code [RVCE, RR_NAGAR, NAYANDAHALLI, MYSORE_RD, MAJESTIC]}.
     *
     * <p>Algorithm: O(|A| × |B|) dynamic programming over subpath lengths.
     * Practical sizes are tiny (≤ 11 nodes) so this is effectively O(1).
     *
     * @param pathA First rider's computed path.
     * @param pathB Second rider's computed path.
     * @return Unmodifiable list of the longest shared contiguous node IDs,
     *         or an empty list if no common segment exists.
     */
    public List<String> findSharedCorridor(List<String> pathA, List<String> pathB) {
        int m = pathA.size();
        int n = pathB.size();

        // dp[i][j] = length of the longest common subpath ending at
        //            pathA[i-1] and pathB[j-1]
        int[][] dp = new int[m + 1][n + 1];
        int maxLen = 0;
        int endIdxA = 0; // index in pathA where the LCCS ends (exclusive)

        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (pathA.get(i - 1).equals(pathB.get(j - 1))) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                    if (dp[i][j] > maxLen) {
                        maxLen  = dp[i][j];
                        endIdxA = i; // exclusive end in pathA
                    }
                } else {
                    dp[i][j] = 0;
                }
            }
        }

        if (maxLen == 0) return List.of();

        // Reconstruct from pathA
        List<String> shared = new ArrayList<>(
                pathA.subList(endIdxA - maxLen, endIdxA));
        return Collections.unmodifiableList(shared);
    }

    /**
     * Finds the shared corridor common to ALL supplied paths.
     *
     * <p>Uses pairwise LCCS reduction: start with path[0], then iteratively
     * intersect with each subsequent path. The result is the longest contiguous
     * sub-sequence present in every path.
     *
     * @param paths Collection of path lists (at least one required).
     * @return Longest contiguous common node IDs across all paths.
     */
    public List<String> findSharedCorridorMulti(List<List<String>> paths) {
        if (paths == null || paths.isEmpty()) return List.of();
        List<String> corridor = new ArrayList<>(paths.get(0));
        for (int i = 1; i < paths.size(); i++) {
            corridor = new ArrayList<>(findSharedCorridor(corridor, paths.get(i)));
            if (corridor.isEmpty()) return List.of(); // early exit
        }
        return Collections.unmodifiableList(corridor);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private void addNode(String id, String name, double lat, double lng) {
        nodes.put(id, new TransitNode(id, name, lat, lng));
        adjacency.put(id, new ArrayList<>());
    }

    private void addUndirectedEdge(String fromId, String toId, double distanceKm) {
        adjacency.get(fromId).add(new Edge(toId,   distanceKm));
        adjacency.get(toId).add(new Edge(fromId, distanceKm));
    }
}
