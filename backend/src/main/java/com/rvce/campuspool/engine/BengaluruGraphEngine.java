package com.rvce.campuspool.engine;

import com.rvce.campuspool.model.Models.Edge;
import com.rvce.campuspool.model.Models.TransitNode;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * In-memory weighted undirected graph for the Bengaluru Purple Line /
 * Mysore Road corridor.
 *
 * <p>Node set (11 real stations):
 * RVCE, PATTANAGERE, KENGERI, RR_NAGAR, NAYANDAHALLI, MYSORE_RD,
 * VIJAYANAGAR, MAJESTIC, MG_ROAD, INDIRANAGAR, BANASHANKARI.
 *
 * <p>Shortest path uses a min-heap Dijkstra implementation over the
 * directed representation (each undirected edge stored twice).
 *
 * <p>Fare model: Rs 16 per km, minimum fare Rs 30.
 */
@Component
public class BengaluruGraphEngine {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    private static final double FARE_PER_KM = 16.0;
    private static final double MIN_FARE    = 30.0;

    // -----------------------------------------------------------------------
    // Graph state (populated once at startup, read-only thereafter)
    // -----------------------------------------------------------------------

    /** Master node registry:  nodeId -> TransitNode */
    private final Map<String, TransitNode> nodes = new LinkedHashMap<>();

    /** Adjacency list (directed):  nodeId -> List<Edge> */
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
        //
        // Distances are calibrated road distances (km) along the
        // Mysore Road / NICE Road / Purple Line corridor.
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
        addUndirectedEdge("MAJESTIC",    "BANASHANKARI",  6.2);
        addUndirectedEdge("VIJAYANAGAR", "BANASHANKARI",  5.0);
        addUndirectedEdge("NAYANDAHALLI","BANASHANKARI",  5.5);
        addUndirectedEdge("RR_NAGAR",    "BANASHANKARI",  6.8);

        // Direct RVCE ↔ KENGERI shortcut (campus side-road)
        addUndirectedEdge("RVCE",    "KENGERI",     2.2);
        // Kengeri ↔ RR Nagar link road
        addUndirectedEdge("KENGERI", "RR_NAGAR",    4.7);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Returns an unmodifiable view of all transit nodes. */
    public Map<String, TransitNode> getAllNodes() {
        return Collections.unmodifiableMap(nodes);
    }

    /** Returns an unmodifiable view of the full adjacency list. */
    public Map<String, List<Edge>> getAdjacency() {
        return Collections.unmodifiableMap(adjacency);
    }

    /**
     * Dijkstra's shortest path from {@code sourceId} to {@code destinationId}.
     *
     * @return Ordered list of node IDs (inclusive of source and destination),
     *         or an empty list if no path exists.
     */
    public List<String> shortestPath(String sourceId, String destinationId) {
        if (!nodes.containsKey(sourceId) || !nodes.containsKey(destinationId)) {
            return List.of();
        }
        if (sourceId.equals(destinationId)) {
            return List.of(sourceId);
        }

        // dist[node] = best known distance from source
        Map<String, Double> dist = new HashMap<>();
        Map<String, String> prev = new HashMap<>();

        for (String id : nodes.keySet()) {
            dist.put(id, Double.MAX_VALUE);
        }
        dist.put(sourceId, 0.0);

        // PriorityQueue entries: [distance, nodeId]
        PriorityQueue<double[]> pq = new PriorityQueue<>(Comparator.comparingDouble(e -> e[0]));
        Map<String, Integer> nodeIndex = new HashMap<>();
        int idx = 0;
        for (String id : nodes.keySet()) {
            nodeIndex.put(id, idx++);
        }

        // We use a (distance, nodeIndex) pair to keep the queue ordered
        pq.offer(new double[]{0.0, nodeIndex.get(sourceId)});
        String[] indexToNode = nodeIndex.entrySet().stream()
                .sorted(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .toArray(String[]::new);

        Set<String> visited = new HashSet<>();

        while (!pq.isEmpty()) {
            double[] top   = pq.poll();
            String current = indexToNode[(int) top[1]];

            if (visited.contains(current)) continue;
            visited.add(current);

            if (current.equals(destinationId)) break;

            List<Edge> neighbours = adjacency.getOrDefault(current, List.of());
            for (Edge edge : neighbours) {
                String neighbour = edge.targetNodeId();
                if (visited.contains(neighbour)) continue;

                double newDist = dist.get(current) + edge.distanceKm();
                if (newDist < dist.get(neighbour)) {
                    dist.put(neighbour, newDist);
                    prev.put(neighbour, current);
                    pq.offer(new double[]{newDist, nodeIndex.get(neighbour)});
                }
            }
        }

        // Reconstruct path
        if (dist.get(destinationId) == Double.MAX_VALUE) {
            return List.of(); // unreachable
        }

        LinkedList<String> path = new LinkedList<>();
        String step = destinationId;
        while (step != null) {
            path.addFirst(step);
            step = prev.get(step);
        }
        return Collections.unmodifiableList(path);
    }

    /**
     * Calculates the total road distance for an ordered list of node IDs.
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
            double segDist = adjacency.getOrDefault(from, List.of()).stream()
                    .filter(e -> e.targetNodeId().equals(to))
                    .mapToDouble(Edge::distanceKm)
                    .findFirst()
                    .orElse(0.0);
            total += segDist;
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
        double raw = FARE_PER_KM * distanceKm;
        return Math.round(Math.max(raw, MIN_FARE));
    }

    /**
     * Finds the longest common-prefix corridor shared by two node-ID paths.
     *
     * <p>This models the intuition that pooled riders travel together from
     * the common start until their routes first diverge.
     *
     * @param pathA First rider's computed path.
     * @param pathB Second rider's computed path.
     * @return Unmodifiable list of shared prefix node IDs (may be empty).
     */
    public List<String> findSharedCorridor(List<String> pathA, List<String> pathB) {
        List<String> shared = new ArrayList<>();
        int limit = Math.min(pathA.size(), pathB.size());
        for (int i = 0; i < limit; i++) {
            if (pathA.get(i).equals(pathB.get(i))) {
                shared.add(pathA.get(i));
            } else {
                break;
            }
        }
        return Collections.unmodifiableList(shared);
    }

    /**
     * Finds the shared corridor common to ALL supplied paths.
     *
     * <p>Reduces pairwise by progressively intersecting the prefix,
     * which handles clusters of 3 riders.
     *
     * @param paths Collection of path lists (at least one required).
     * @return Common prefix node IDs for all paths.
     */
    public List<String> findSharedCorridorMulti(List<List<String>> paths) {
        if (paths == null || paths.isEmpty()) return List.of();
        List<String> corridor = new ArrayList<>(paths.get(0));
        for (int i = 1; i < paths.size(); i++) {
            corridor = new ArrayList<>(findSharedCorridor(corridor, paths.get(i)));
        }
        return Collections.unmodifiableList(corridor);
    }

    /**
     * Returns the {@link TransitNode} for a given ID, or {@code null} if unknown.
     */
    public TransitNode getNode(String id) {
        return nodes.get(id);
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
