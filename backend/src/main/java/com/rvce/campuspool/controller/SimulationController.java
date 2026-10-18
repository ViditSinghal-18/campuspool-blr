package com.rvce.campuspool.controller;

import com.rvce.campuspool.engine.BengaluruGraphEngine;
import com.rvce.campuspool.engine.IntervalMatcherService;
import com.rvce.campuspool.engine.WeatherTelemetryService;
import com.rvce.campuspool.model.Models.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * REST controller exposing the CampusPool BLR simulation API.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code GET    /api/graph/nodes}              — full graph (nodes + adjacency)</li>
 *   <li>{@code POST   /api/graph/traffic-mode}        — toggle peak-hour congestion weights</li>
 *   <li>{@code GET    /api/telemetry/weather}         — live Open-Meteo weather & rain surge</li>
 *   <li>{@code POST   /api/simulation/seed}           — seed 15 RVCE commuter requests</li>
 *   <li>{@code GET    /api/simulation/stream}         — live SSE stream of commuters arriving every 2.5s</li>
 *   <li>{@code DELETE /api/simulation/reset}          — clear all active commuters</li>
 *   <li>{@code POST   /api/rides/request}             — add custom ride request by node ID</li>
 *   <li>{@code POST   /api/rides/snap-and-request}    — GPS lat/lng → Haversine snap → route</li>
 * </ul>
 *
 * <p>CORS is allowed for {@code http://localhost:3000} (the Next.js dev server).
 * Live ride request state is managed in {@link IntervalMatcherService} via a
 * thread-safe {@link java.util.concurrent.CopyOnWriteArrayList}.
 */
@RestController
@CrossOrigin(origins = "http://localhost:3000")
@Tag(name = "CampusPool BLR", description = "Graph-based ride-matching engine for the RVCE corridor")
public class SimulationController {

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    private final BengaluruGraphEngine    graphEngine;
    private final IntervalMatcherService  matcherService;
    private final WeatherTelemetryService weatherService;

    public SimulationController(BengaluruGraphEngine graphEngine,
                                IntervalMatcherService matcherService,
                                WeatherTelemetryService weatherService) {
        this.graphEngine    = graphEngine;
        this.matcherService = matcherService;
        this.weatherService = weatherService;
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
     *   "nodes":     [ { "id", "name", "lat", "lng" }, … ],
     *   "adjacency": { "RVCE": [ { "targetNodeId", "distanceKm" }, … ], … },
     *   "peakMode":  false
     * }
     * </pre>
     */
    @Operation(summary = "Get full graph (nodes + edges + current traffic mode)")
    @GetMapping("/api/graph/nodes")
    public ResponseEntity<Map<String, Object>> getGraph() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("nodes",     graphEngine.getAllNodes().values());
        body.put("adjacency", graphEngine.getAdjacency());
        body.put("peakMode",  graphEngine.isPeakMode());
        return ResponseEntity.ok(body);
    }

    // -----------------------------------------------------------------------
    // POST /api/graph/traffic-mode
    // -----------------------------------------------------------------------

    /**
     * Toggles peak-hour congestion weights on NAYANDAHALLI, MYSORE_RD, and
     * MAJESTIC edges (1.4× effective distance).
     *
     * <p>Request param: {@code ?peak=true|false}
     *
     * <p>Response shape:
     * <pre>{ "peakMode": true, "message": "Peak congestion mode enabled." }</pre>
     */
    @Operation(summary = "Toggle Bengaluru peak-hour congestion weights in real time")
    @PostMapping("/api/graph/traffic-mode")
    public ResponseEntity<Map<String, Object>> setTrafficMode(
            @RequestParam(name = "peak", defaultValue = "false") boolean peak) {

        graphEngine.setPeakMode(peak);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("peakMode", graphEngine.isPeakMode());
        body.put("affectedNodes", List.of("NAYANDAHALLI", "MYSORE_RD", "MAJESTIC"));
        body.put("multiplier", peak ? 1.4 : 1.0);
        body.put("message", peak
                ? "Peak congestion mode enabled. Dijkstra now uses 1.4× weights on congested edges."
                : "Off-peak mode active. Normal road distances restored.");
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
     *   "requests":         [ RideRequest, … ],
     *   "clusters":         [ MatchCluster, … ],
     *   "executionTimeMs":  12,
     *   "totalFareSavedRs": 184.0
     * }
     * </pre>
     */
    @Operation(summary = "Seed 15 RVCE student commuters, run matcher, return clusters + telemetry")
    @PostMapping("/api/simulation/seed")
    public ResponseEntity<Map<String, Object>> seed() {
        long t0 = System.currentTimeMillis();

        List<RideRequest> seeded = buildSeededRequests();

        // Replace live store atomically via the service
        matcherService.resetLiveRequests(seeded);

        List<MatchCluster> clusters = matcherService.match(seeded);

        long   execMs    = System.currentTimeMillis() - t0;
        double fareSaved = computeTotalFareSaved(clusters);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("requests",         seeded);
        body.put("clusters",         clusters);
        body.put("executionTimeMs",  execMs);
        body.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);
        return ResponseEntity.ok(body);
    }

    // -----------------------------------------------------------------------
    // GET /api/telemetry/weather
    // -----------------------------------------------------------------------

    /**
     * Fetches live weather telemetry for the Bengaluru / RVCE corridor from
     * Open-Meteo, calculates rain congestion multiplier, and updates Dijkstra routing.
     */
    @Operation(summary = "Get live Bengaluru weather and rain-surge multiplier (Open-Meteo)")
    @GetMapping("/api/telemetry/weather")
    public ResponseEntity<WeatherTelemetry> getWeatherTelemetry(
            @RequestParam(name = "simulateRain", defaultValue = "false") boolean simulateRain) {
        WeatherTelemetry telemetry = weatherService.fetchWeather(simulateRain);
        return ResponseEntity.ok(telemetry);
    }

    // -----------------------------------------------------------------------
    // GET /api/simulation/stream
    // -----------------------------------------------------------------------

    /**
     * Real-time SSE stream emitting a new incoming commuter request every 2.5s.
     * Re-runs the interval matcher on each arrival and streams updated clusters live.
     */
    @Operation(summary = "Live SSE stream of commuters arriving every 2.5s and real-time clustering")
    @GetMapping(value = "/api/simulation/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamSimulation() {
        SseEmitter emitter = new SseEmitter(180_000L); // 3 minutes timeout
        List<RideRequest> seeded = buildSeededRequests();

        // Start with a clean pool for the live arrival sequence
        matcherService.clearLiveRequests();

        ScheduledExecutorService executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "campuspool-sse-stream");
            t.setDaemon(true);
            return t;
        });

        AtomicInteger index = new AtomicInteger(0);

        Runnable cleanup = () -> {
            try {
                executor.shutdownNow();
            } catch (Exception ignored) {}
        };

        emitter.onCompletion(cleanup);
        emitter.onTimeout(cleanup);
        emitter.onError(e -> cleanup.run());

        executor.scheduleAtFixedRate(() -> {
            int i = index.getAndIncrement();
            if (i >= seeded.size()) {
                try {
                    emitter.complete();
                } catch (Exception ignored) {}
                cleanup.run();
                return;
            }

            try {
                RideRequest rider = seeded.get(i);
                long t0 = System.currentTimeMillis();
                matcherService.upsertLiveRequest(rider);
                List<MatchCluster> clusters = matcherService.matchLive();
                long execMs = System.currentTimeMillis() - t0;
                double fareSaved = computeTotalFareSaved(clusters);

                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("step", i + 1);
                payload.put("totalSteps", seeded.size());
                payload.put("latestRider", rider);
                payload.put("requests", matcherService.getLiveRequests());
                payload.put("clusters", clusters);
                payload.put("executionTimeMs", execMs);
                payload.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);

                emitter.send(SseEmitter.event()
                        .id(String.valueOf(i + 1))
                        .data(payload, MediaType.APPLICATION_JSON));
            } catch (Exception ex) {
                cleanup.run();
                try {
                    emitter.completeWithError(ex);
                } catch (Exception ignored) {}
            }
        }, 0, 2500, TimeUnit.MILLISECONDS);

        return emitter;
    }

    // -----------------------------------------------------------------------
    // DELETE /api/simulation/reset
    // -----------------------------------------------------------------------

    /**
     * Resets the commuter pool, clearing all live requests and clusters.
     */
    @Operation(summary = "Clear all active commuters and reset the simulation")
    @DeleteMapping("/api/simulation/reset")
    public ResponseEntity<Map<String, Object>> resetSimulation() {
        matcherService.clearLiveRequests();

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Active commuter pool cleared.");
        body.put("requests", Collections.emptyList());
        body.put("clusters", Collections.emptyList());
        body.put("totalFareSavedRs", 0.0);
        return ResponseEntity.ok(body);
    }

    // -----------------------------------------------------------------------
    // POST /api/rides/request
    // -----------------------------------------------------------------------

    /**
     * Accepts a custom ride request (by node IDs), merges it into the live
     * pool, re-runs the matcher, and returns updated results.
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
     */
    @Operation(summary = "Add a custom ride request by node ID and re-run the matcher")
    @PostMapping("/api/rides/request")
    public ResponseEntity<?> addRideRequest(@RequestBody Map<String, String> body) {
        String userId      = body.get("userId");
        String studentName = body.get("studentName");
        String sourceId    = body.get("sourceNodeId");
        String destId      = body.get("destinationNodeId");
        String depTime     = body.get("departureTime");

        if (userId == null || studentName == null || sourceId == null
                || destId == null || depTime == null) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Missing required fields: userId, studentName, " +
                    "sourceNodeId, destinationNodeId, departureTime"));
        }
        if (graphEngine.getNode(sourceId) == null)
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown sourceNodeId: " + sourceId));
        if (graphEngine.getNode(destId) == null)
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Unknown destinationNodeId: " + destId));

        return runAndRespond(buildRequest(userId, studentName, sourceId, destId, depTime));
    }

    // -----------------------------------------------------------------------
    // POST /api/rides/snap-and-request   (NEW)
    // -----------------------------------------------------------------------

    /**
     * Accepts raw GPS coordinates, snaps them to the nearest transit nodes via
     * Haversine distance, computes the route, and adds the request to the live
     * pool before re-running the matcher.
     *
     * <p>Request body:
     * <pre>
     * {
     *   "studentName":   "Nidhi",
     *   "sourceLat":     12.9237,
     *   "sourceLng":     77.4987,
     *   "destLat":       12.9784,
     *   "destLng":       77.6408,
     *   "departureTime": "16:15"
     * }
     * </pre>
     *
     * <p>Response includes the snapped node IDs alongside the standard
     * {@code requests / clusters / executionTimeMs / totalFareSavedRs} payload,
     * plus a {@code snap} sub-object for UI feedback:
     * <pre>
     * {
     *   "snap": {
     *     "sourceNodeId":   "RVCE",
     *     "sourceNodeName": "RVCE Campus",
     *     "destNodeId":     "INDIRANAGAR",
     *     "destNodeName":   "Indiranagar"
     *   },
     *   "requests":  [ … ],
     *   "clusters":  [ … ],
     *   …
     * }
     * </pre>
     */
    @Operation(summary = "GPS lat/lng → Haversine snap → add ride request → re-run matcher")
    @PostMapping("/api/rides/snap-and-request")
    public ResponseEntity<?> snapAndRequest(@RequestBody Map<String, Object> body) {
        // --- Parse & validate input -------------------------------------------
        String studentName = (String) body.get("studentName");
        String depTime     = (String) body.get("departureTime");

        Double sourceLat = parseDouble(body.get("sourceLat"));
        Double sourceLng = parseDouble(body.get("sourceLng"));
        Double destLat   = parseDouble(body.get("destLat"));
        Double destLng   = parseDouble(body.get("destLng"));

        if (studentName == null || depTime == null
                || sourceLat == null || sourceLng == null
                || destLat == null || destLng == null) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Required: studentName, departureTime, " +
                    "sourceLat, sourceLng, destLat, destLng"));
        }

        // --- Haversine snap ---------------------------------------------------
        TransitNode snappedSource = graphEngine.snapToNearestNode(sourceLat, sourceLng);
        TransitNode snappedDest   = graphEngine.snapToNearestNode(destLat,   destLng);

        if (snappedSource.id().equals(snappedDest.id())) {
            return ResponseEntity.badRequest().body(Map.of("error",
                    "Source and destination snapped to the same node: "
                    + snappedSource.id() + ". Please provide a longer journey."));
        }

        // Generate a deterministic userId from the student name + time
        String userId = "snap-" + studentName.replaceAll("\\s+", "").toLowerCase()
                      + "-" + depTime.replace(":", "");

        // --- Snap feedback sub-object ----------------------------------------
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("sourceNodeId",   snappedSource.id());
        snap.put("sourceNodeName", snappedSource.name());
        snap.put("sourceSnapDistKm",
                 Math.round(graphEngine.haversineKm(sourceLat, sourceLng,
                                                    snappedSource.lat(), snappedSource.lng())
                            * 1000.0) / 1000.0);
        snap.put("destNodeId",   snappedDest.id());
        snap.put("destNodeName", snappedDest.name());
        snap.put("destSnapDistKm",
                 Math.round(graphEngine.haversineKm(destLat, destLng,
                                                    snappedDest.lat(), snappedDest.lng())
                            * 1000.0) / 1000.0);

        // --- Build request & run matcher -------------------------------------
        long t0 = System.currentTimeMillis();
        RideRequest req = buildRequest(userId, studentName,
                                       snappedSource.id(), snappedDest.id(), depTime);
        matcherService.upsertLiveRequest(req);
        List<MatchCluster> clusters = matcherService.matchLive();
        long execMs    = System.currentTimeMillis() - t0;
        double fareSaved = computeTotalFareSaved(clusters);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("snap",             snap);
        resp.put("requests",         matcherService.getLiveRequests());
        resp.put("clusters",         clusters);
        resp.put("executionTimeMs",  execMs);
        resp.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);
        return ResponseEntity.ok(resp);
    }

    // -----------------------------------------------------------------------
    // Seeded data factory
    // -----------------------------------------------------------------------

    /**
     * Generates 15 realistic RVCE evening-peak commuter requests (16:00–16:30).
     * Origins: RVCE, KENGERI, PATTANAGERE.
     * Destinations: MAJESTIC, MG_ROAD, INDIRANAGAR, VIJAYANAGAR, BANASHANKARI.
     */
    private List<RideRequest> buildSeededRequests() {
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
                    (String) row[0], (String) row[1],
                    (String) row[2], (String) row[3], (String) row[4]));
        }
        return Collections.unmodifiableList(requests);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Upserts a single request into the live store and re-runs the matcher,
     * returning the standard response envelope.
     */
    private ResponseEntity<Map<String, Object>> runAndRespond(RideRequest req) {
        long t0 = System.currentTimeMillis();
        matcherService.upsertLiveRequest(req);
        List<MatchCluster> clusters = matcherService.matchLive();
        long   execMs    = System.currentTimeMillis() - t0;
        double fareSaved = computeTotalFareSaved(clusters);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("requests",         matcherService.getLiveRequests());
        resp.put("clusters",         clusters);
        resp.put("executionTimeMs",  execMs);
        resp.put("totalFareSavedRs", Math.round(fareSaved * 100.0) / 100.0);
        return ResponseEntity.ok(resp);
    }

    /** Creates a fully-computed {@link RideRequest}. Dijkstra runs server-side. */
    private RideRequest buildRequest(String userId, String studentName,
                                     String sourceId, String destId,
                                     String departureTime) {
        List<String> path = graphEngine.shortestPath(sourceId, destId);
        double distKm     = graphEngine.pathDistance(path);
        double fare       = graphEngine.soloFare(distKm);
        return new RideRequest(userId, studentName, sourceId, destId,
                               departureTime, path, distKm, fare);
    }

    /** Computes total INR saved across all multi-rider clusters. */
    private double computeTotalFareSaved(List<MatchCluster> clusters) {
        return clusters.stream()
                .filter(c -> c.riders().size() > 1)
                .mapToDouble(c -> c.originalTotalFareRs()
                                  - c.discountedFarePerPersonRs() * c.riders().size())
                .sum();
    }

    /**
     * Safely parses a JSON number value (may arrive as {@link Integer},
     * {@link Double}, or {@link String}) into a {@link Double}.
     * Returns {@code null} if the value is {@code null} or unparseable.
     */
    private Double parseDouble(Object val) {
        if (val == null) return null;
        if (val instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(val.toString()); }
        catch (NumberFormatException e) { return null; }
    }
}
