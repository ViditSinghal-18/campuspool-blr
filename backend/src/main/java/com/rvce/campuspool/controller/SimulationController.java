package com.rvce.campuspool.controller;

import com.rvce.campuspool.engine.BengaluruGraphEngine;
import com.rvce.campuspool.engine.IntervalMatcherService;
import com.rvce.campuspool.model.Models.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * REST controller exposing the CampusPool BLR simulation API.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code GET  /api/graph/nodes}       — full graph (nodes + adjacency)</li>
 *   <li>{@code POST /api/simulation/seed}   — seed 15 RVCE commuter requests,
 *       run matcher, return results + telemetry</li>
 *   <li>{@code POST /api/rides/request}     — add a custom ride request,
 *       merge with any existing live requests, re-run matcher</li>
 * </ul>
 *
 * <p>CORS is allowed for {@code http://localhost:3000} (the Next.js dev server).
 */
@RestController
@CrossOrigin(origins = "http://localhost:3000")
public class SimulationController {

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    private final BengaluruGraphEngine    graphEngine;
    private final IntervalMatcherService  matcherService;

    /** Live ride request store — supports the custom /api/rides/request flow. */
    private final List<RideRequest> liveRequests = new ArrayList<>();

    public SimulationController(BengaluruGraphEngine graphEngine,
                                IntervalMatcherService matcherService) {
        this.graphEngine    = graphEngine;
        this.matcherService = matcherService;
    }

    // -----------------------------------------------------------------------
    // GET /api/graph/nodes
    // -----------------------------------------------------------------------

    /**
     * Returns the complete graph: every transit node and its outgoing edges.
     *
     * <p>Response shape:
     * <pre>
     * {
     *   "nodes": [ { "id", "name", "lat", "lng" }, … ],
     *   "adjacency": { "RVCE": [ { "targetNodeId", "distanceKm" }, … ], … }
     * }
     * </pre>
     */
    @GetMapping("/api/graph/nodes")
    public ResponseEntity<Map<String, Object>> getGraph() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("nodes",     graphEngine.getAllNodes().values());
        body.put("adjacency", graphEngine.getAdjacency());
        return ResponseEntity.ok(body);
    }

    // -----------------------------------------------------------------------
    // POST /api/simulation/seed
    // -----------------------------------------------------------------------

    /**
     * Seeds 15 realistic RVCE evening-peak commuter requests (16:00–16:30),
     * runs the interval matcher, and returns full results plus telemetry.
     *
     * <p>Response shape:
     * <pre>
     * {
     *   "requests":        [ RideRequest, … ],
     *   "clusters":        [ MatchCluster, … ],
     *   "executionTimeMs": 12,
     *   "totalFareSavedRs": 184.0
     * }
     * </pre>
     */
    @PostMapping("/api/simulation/seed")
    public ResponseEntity<Map<String, Object>> seed() {
        long t0 = System.currentTimeMillis();

        List<RideRequest> seeded = buildSeededRequests();

        // Sync to the live store so /api/rides/request can merge later
        liveRequests.clear();
        liveRequests.addAll(seeded);

        List<MatchCluster> clusters = matcherService.match(seeded);

        long execMs = System.currentTimeMillis() - t0;
        double fareSaved = computeTotalFareSaved(clusters);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("requests",        seeded);
        body.put("clusters",        clusters);
        body.put("executionTimeMs", execMs);
        body.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);

        return ResponseEntity.ok(body);
    }

    // -----------------------------------------------------------------------
    // POST /api/rides/request
    // -----------------------------------------------------------------------

    /**
     * Accepts a custom ride request body, merges it with the current live
     * request pool, re-runs the matcher, and returns updated results.
     *
     * <p>Request body (all fields required):
     * <pre>
     * {
     *   "userId":            "u-99",
     *   "studentName":       "Nidhi",
     *   "sourceNodeId":      "RVCE",
     *   "destinationNodeId": "INDIRANAGAR",
     *   "departureTime":     "16:10"
     * }
     * </pre>
     *
     * <p>The {@code computedPath}, {@code soloDistanceKm}, and
     * {@code soloFareRs} are computed server-side; any values sent by the
     * client for those fields are ignored.
     *
     * <p>Response shape: same as {@code POST /api/simulation/seed}.
     */
    @PostMapping("/api/rides/request")
    public ResponseEntity<?> addRideRequest(@RequestBody Map<String, String> body) {
        String userId      = body.get("userId");
        String studentName = body.get("studentName");
        String sourceId    = body.get("sourceNodeId");
        String destId      = body.get("destinationNodeId");
        String depTime     = body.get("departureTime");

        // Basic validation
        if (userId == null || studentName == null || sourceId == null
                || destId == null || depTime == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error",
                            "Missing required fields: userId, studentName, " +
                            "sourceNodeId, destinationNodeId, departureTime"));
        }
        if (graphEngine.getNode(sourceId) == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown sourceNodeId: " + sourceId));
        }
        if (graphEngine.getNode(destId) == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown destinationNodeId: " + destId));
        }

        long t0 = System.currentTimeMillis();

        RideRequest newReq = buildRequest(userId, studentName, sourceId, destId, depTime);

        // Remove any prior request from the same userId and add the new one
        liveRequests.removeIf(r -> r.userId().equals(userId));
        liveRequests.add(newReq);

        List<MatchCluster> clusters = matcherService.match(liveRequests);

        long execMs    = System.currentTimeMillis() - t0;
        double fareSaved = computeTotalFareSaved(clusters);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("requests",         List.copyOf(liveRequests));
        resp.put("clusters",         clusters);
        resp.put("executionTimeMs",  execMs);
        resp.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);

        return ResponseEntity.ok(resp);
    }

    // -----------------------------------------------------------------------
    // Seeded data factory
    // -----------------------------------------------------------------------

    /**
     * Generates 15 realistic RVCE evening-peak commuter requests spanning
     * the 16:00–16:30 window.
     *
     * <p>Origins: RVCE, KENGERI, PATTANAGERE<br>
     * Destinations: MAJESTIC, MG_ROAD, INDIRANAGAR, VIJAYANAGAR, BANASHANKARI
     */
    private List<RideRequest> buildSeededRequests() {
        // (userId, name, source, destination, departure)
        Object[][] seed = {
            // -- Batch 1: 16:00 --
            {"u-01", "Arjun Sharma",     "RVCE",        "MAJESTIC",     "16:00"},
            {"u-02", "Priya Nair",       "RVCE",        "MG_ROAD",      "16:00"},
            {"u-03", "Rohan Mehta",      "RVCE",        "MAJESTIC",     "16:02"},
            // -- Batch 2: 16:05 --
            {"u-04", "Sneha Reddy",      "KENGERI",     "INDIRANAGAR",  "16:05"},
            {"u-05", "Karthik Iyer",     "RVCE",        "INDIRANAGAR",  "16:06"},
            {"u-06", "Ananya Krishnan",  "PATTANAGERE", "MG_ROAD",      "16:07"},
            // -- Batch 3: 16:10 --
            {"u-07", "Vikram Gupta",     "RVCE",        "VIJAYANAGAR",  "16:10"},
            {"u-08", "Divya Pillai",     "KENGERI",     "VIJAYANAGAR",  "16:11"},
            {"u-09", "Aditya Rao",       "RVCE",        "BANASHANKARI", "16:12"},
            // -- Batch 4: 16:15 --
            {"u-10", "Kavya Singh",      "PATTANAGERE", "MAJESTIC",     "16:15"},
            {"u-11", "Nikhil Patil",     "KENGERI",     "MG_ROAD",      "16:16"},
            {"u-12", "Meera Thomas",     "RVCE",        "MG_ROAD",      "16:17"},
            // -- Batch 5: 16:25 --
            {"u-13", "Siddharth Bhat",   "RVCE",        "INDIRANAGAR",  "16:25"},
            {"u-14", "Pooja Venkatesh",  "PATTANAGERE", "MAJESTIC",     "16:27"},
            {"u-15", "Rahul Joshi",      "KENGERI",     "VIJAYANAGAR",  "16:30"},
        };

        List<RideRequest> requests = new ArrayList<>();
        for (Object[] row : seed) {
            requests.add(buildRequest(
                    (String) row[0],
                    (String) row[1],
                    (String) row[2],
                    (String) row[3],
                    (String) row[4]
            ));
        }
        return Collections.unmodifiableList(requests);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Creates a fully-computed {@link RideRequest} from raw parameters.
     * Dijkstra + fare estimation are applied server-side.
     */
    private RideRequest buildRequest(String userId, String studentName,
                                     String sourceId, String destId,
                                     String departureTime) {
        List<String> path    = graphEngine.shortestPath(sourceId, destId);
        double distKm        = graphEngine.pathDistance(path);
        double fare          = graphEngine.soloFare(distKm);

        return new RideRequest(
                userId, studentName,
                sourceId, destId,
                departureTime,
                path, distKm, fare
        );
    }

    /**
     * Computes total INR saved across all multi-rider clusters.
     * savings = originalTotal - (perPersonFare × riderCount)
     */
    private double computeTotalFareSaved(List<MatchCluster> clusters) {
        return clusters.stream()
                .filter(c -> c.riders().size() > 1)
                .mapToDouble(c ->
                        c.originalTotalFareRs()
                        - (c.discountedFarePerPersonRs() * c.riders().size()))
                .sum();
    }
}
