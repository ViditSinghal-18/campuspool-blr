package com.rvce.campuspool.engine;

import com.rvce.campuspool.model.Models.MatchCluster;
import com.rvce.campuspool.model.Models.RideRequest;
import com.rvce.campuspool.model.Models.TransitNode;
import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Sliding-window interval matcher for CampusPool BLR.
 *
 * <h3>Algorithm</h3>
 * <ol>
 *   <li>Sort all {@link RideRequest}s chronologically by {@code departureTime}.</li>
 *   <li>Use a 15-minute sliding window: for each anchor request, gather all
 *       subsequent requests whose departure time is within 15 minutes.</li>
 *   <li>Within the window, try every 3- then 2-rider combination. Accept a
 *       group if their routes share at least 3 contiguous corridor nodes
 *       (LCCS from {@link BengaluruGraphEngine#findSharedCorridorMulti}).</li>
 *   <li>Greedily assign each request to at most one cluster. Unmatched
 *       requests are wrapped in solo clusters.</li>
 *   <li>For every accepted cluster, compute the split fare and savings %.</li>
 * </ol>
 *
 * <h3>Thread safety</h3>
 * <ul>
 *   <li>The live request store ({@link #liveRequests}) is a
 *       {@link CopyOnWriteArrayList} — safe for concurrent reads + infrequent writes.</li>
 *   <li>Cluster sequence IDs are generated with an {@link AtomicInteger} so
 *       concurrent calls to {@link #match} never produce duplicate IDs.</li>
 * </ul>
 *
 * <h3>Fare split for the shared corridor</h3>
 * <pre>
 *   sharedFare       = soloFare(sharedDistanceKm)
 *   perPersonFare    = ceil(sharedFare / riderCount)
 *   savingsPct       = round((1 - perPersonFare / avgSoloFare) × 100)
 * </pre>
 */
@Service
public class IntervalMatcherService {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /** Maximum departure-time gap between two riders in the same cluster. */
    private static final int WINDOW_MINUTES = 15;

    /** Minimum shared corridor nodes required to form a valid cluster (LCCS). */
    private static final int MIN_SHARED_NODES = 3;

    /** Maximum riders per cluster. */
    private static final int MAX_CLUSTER_SIZE = 3;

    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm");

    // -----------------------------------------------------------------------
    // Thread-safe state
    // -----------------------------------------------------------------------

    /**
     * Live ride request store.
     * {@link CopyOnWriteArrayList} is read-optimised: iteration never throws
     * {@code ConcurrentModificationException} even under concurrent writes.
     */
    private final CopyOnWriteArrayList<RideRequest> liveRequests =
            new CopyOnWriteArrayList<>();

    /**
     * Monotonically incrementing cluster sequence counter.
     * Thread-safe without locking.
     */
    private final AtomicInteger clusterSeq = new AtomicInteger(1);

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    private final BengaluruGraphEngine graphEngine;

    public IntervalMatcherService(BengaluruGraphEngine graphEngine) {
        this.graphEngine = graphEngine;
    }

    // -----------------------------------------------------------------------
    // Live-store management (called by the controller)
    // -----------------------------------------------------------------------

    /**
     * Atomically replaces the entire live request pool.
     * Used by {@code POST /api/simulation/seed}.
     */
    public void resetLiveRequests(List<RideRequest> requests) {
        liveRequests.clear();
        liveRequests.addAll(requests);
    }

    /**
     * Clears all requests from the live store.
     * Used by {@code DELETE /api/simulation/reset}.
     */
    public void clearLiveRequests() {
        liveRequests.clear();
    }

    /**
     * Adds or replaces a single request by userId.
     * Thread-safe — uses CopyOnWriteArrayList bulk-replace approach.
     */
    public void upsertLiveRequest(RideRequest request) {
        liveRequests.removeIf(r -> r.userId().equals(request.userId()));
        liveRequests.add(request);
    }

    /** Returns a snapshot of the current live request list. */
    public List<RideRequest> getLiveRequests() {
        return List.copyOf(liveRequests);
    }

    // -----------------------------------------------------------------------
    // Public API — matching
    // -----------------------------------------------------------------------

    /**
     * Matches a supplied list of ride requests into pooled clusters.
     * Stateless — does not read or write {@link #liveRequests}.
     *
     * @param requests Raw, unsorted list of ride requests.
     * @return Unmodifiable list of {@link MatchCluster}s (includes solo
     *         clusters for unmatched requests).
     */
    public List<MatchCluster> match(List<RideRequest> requests) {
        if (requests == null || requests.isEmpty()) return List.of();

        // 1. Stable sort by departure time (copy to avoid mutating the caller's list)
        List<RideRequest> sorted = new ArrayList<>(requests);
        sorted.sort(Comparator.comparing(r -> LocalTime.parse(r.departureTime(), TIME_FMT)));

        Set<String>        assigned = new HashSet<>();
        List<MatchCluster> clusters = new ArrayList<>();

        // 2. Sliding-window sweep
        for (int anchor = 0; anchor < sorted.size(); anchor++) {
            RideRequest anchorReq = sorted.get(anchor);
            if (assigned.contains(anchorReq.userId())) continue;

            // Collect all unassigned candidates within the 15-minute window
            List<RideRequest> windowCandidates = new ArrayList<>();
            windowCandidates.add(anchorReq);

            LocalTime anchorTime = LocalTime.parse(anchorReq.departureTime(), TIME_FMT);
            for (int j = anchor + 1; j < sorted.size(); j++) {
                RideRequest candidate = sorted.get(j);
                if (assigned.contains(candidate.userId())) continue;
                LocalTime t = LocalTime.parse(candidate.departureTime(), TIME_FMT);
                long gap = java.time.Duration.between(anchorTime, t).toMinutes();
                if (gap > WINDOW_MINUTES) break; // list is sorted — no more matches
                windowCandidates.add(candidate);
            }

            // 3. Try largest groups first (3-rider → 2-rider)
            //    LCCS gating: at least MIN_SHARED_NODES contiguous shared nodes
            MatchCluster found = null;
            outer:
            for (int size = Math.min(MAX_CLUSTER_SIZE, windowCandidates.size());
                 size >= 2; size--) {
                for (List<RideRequest> combo : combinations(windowCandidates, size)) {
                    List<String> corridor = computeSharedCorridor(combo);
                    if (corridor.size() >= MIN_SHARED_NODES) {
                        String id = "CL-" + clusterSeq.getAndIncrement();
                        found = buildCluster(id, combo, corridor);
                        break outer;
                    }
                }
            }

            if (found != null) {
                found.riders().forEach(r -> assigned.add(r.userId()));
                clusters.add(found);
            } else {
                String id = "CL-" + clusterSeq.getAndIncrement();
                assigned.add(anchorReq.userId());
                clusters.add(soloCluster(id, anchorReq));
            }
        }

        return Collections.unmodifiableList(clusters);
    }

    /**
     * Convenience overload: matches the current live request pool.
     */
    public List<MatchCluster> matchLive() {
        return match(getLiveRequests());
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Delegates to {@link BengaluruGraphEngine#findSharedCorridorMulti} which
     * now uses LCCS rather than prefix matching.
     */
    private List<String> computeSharedCorridor(List<RideRequest> group) {
        List<List<String>> paths = group.stream()
                .map(RideRequest::computedPath)
                .toList();
        return graphEngine.findSharedCorridorMulti(paths);
    }

    /**
     * Builds a {@link MatchCluster} for a matched group.
     * Split fare: {@code ceil(sharedCorridorFare / n)} per rider.
     */
    private MatchCluster buildCluster(String clusterId,
                                      List<RideRequest> riders,
                                      List<String> corridor) {
        double sharedDistKm = graphEngine.pathDistance(corridor);
        double sharedFare   = graphEngine.soloFare(sharedDistKm);
        int    n            = riders.size();
        double perPerson    = Math.ceil(sharedFare / n);

        String splitNodeId   = corridor.get(corridor.size() - 1);
        TransitNode splitNode = graphEngine.getNode(splitNodeId);
        String splitNodeName  = (splitNode != null) ? splitNode.name() : splitNodeId;

        double originalTotal = riders.stream()
                .mapToDouble(RideRequest::soloFareRs).sum();
        double avgSoloFare   = originalTotal / n;

        int savingsPct = (avgSoloFare > 0)
                ? Math.max(0, (int) Math.round((1.0 - perPerson / avgSoloFare) * 100))
                : 0;

        return new MatchCluster(
                clusterId,
                Collections.unmodifiableList(new ArrayList<>(riders)),
                Collections.unmodifiableList(new ArrayList<>(corridor)),
                splitNodeName,
                Math.round(sharedDistKm * 100.0) / 100.0,
                Math.round(originalTotal * 100.0) / 100.0,
                perPerson,
                savingsPct
        );
    }

    /** Wraps a single unmatched rider in a trivial single-rider cluster. */
    private MatchCluster soloCluster(String clusterId, RideRequest rider) {
        return new MatchCluster(
                clusterId,
                List.of(rider),
                rider.computedPath(),
                rider.destinationNodeId(),
                rider.soloDistanceKm(),
                rider.soloFareRs(),
                rider.soloFareRs(),
                0
        );
    }

    /**
     * Generates all k-combinations of {@code list} that include the first element
     * (the sliding-window anchor). Anchor inclusion guarantees the pivot request
     * is always evaluated in each candidate group.
     */
    private <T> List<List<T>> combinations(List<T> list, int k) {
        List<List<T>> result = new ArrayList<>();
        if (k == 1) {
            for (T item : list) result.add(List.of(item));
            return result;
        }
        T anchor = list.get(0);
        for (List<T> sub : combinations(list.subList(1, list.size()), k - 1)) {
            List<T> combo = new ArrayList<>();
            combo.add(anchor);
            combo.addAll(sub);
            result.add(combo);
        }
        return result;
    }
}
