package com.rvce.campuspool.engine;

import com.rvce.campuspool.model.Models.MatchCluster;
import com.rvce.campuspool.model.Models.RideRequest;
import com.rvce.campuspool.model.Models.TransitNode;
import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * Sliding-window interval matcher for CampusPool BLR.
 *
 * <h3>Algorithm</h3>
 * <ol>
 *   <li>Sort all {@link RideRequest}s chronologically by {@code departureTime}.</li>
 *   <li>Use a 15-minute sliding window: for each anchor request, gather all
 *       subsequent requests whose departure time is within 15 minutes.</li>
 *   <li>Within the window, try every 2- and 3-rider combination. Accept a
 *       group if their routes share at least 3 common corridor nodes.</li>
 *   <li>Greedily assign each request to at most one cluster (first valid match
 *       wins). Unmatched requests are returned as singletons.</li>
 *   <li>For every accepted cluster, compute the split fare and savings.</li>
 * </ol>
 *
 * <h3>Fare split for the shared corridor</h3>
 * <pre>
 *   sharedFare  = soloFare(sharedDistanceKm)
 *   perPersonFare = ceil(sharedFare / riderCount)
 *                 + soloFare(personalTailDistanceKm)   // ignored here: tail = 0
 *   savingsPct  = round((1 - perPersonFare / soloFare) × 100)
 * </pre>
 * Tail distances (from split node to individual destinations) are not charged
 * extra in this MVP — the split node is the drop-off point for the pooled leg.
 */
@Service
public class IntervalMatcherService {

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /** Maximum departure-time gap between two riders in the same cluster. */
    private static final int WINDOW_MINUTES = 15;

    /** Minimum shared corridor nodes required to form a valid cluster. */
    private static final int MIN_SHARED_NODES = 3;

    /** Maximum riders per cluster. */
    private static final int MAX_CLUSTER_SIZE = 3;

    private static final DateTimeFormatter TIME_FMT =
            DateTimeFormatter.ofPattern("HH:mm");

    // -----------------------------------------------------------------------
    // Dependencies
    // -----------------------------------------------------------------------

    private final BengaluruGraphEngine graphEngine;

    public IntervalMatcherService(BengaluruGraphEngine graphEngine) {
        this.graphEngine = graphEngine;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Matches a list of ride requests into pooled clusters.
     *
     * @param requests Raw, unsorted list of ride requests.
     * @return Unmodifiable list of {@link MatchCluster}s (may include
     *         single-rider clusters for unmatched requests).
     */
    public List<MatchCluster> match(List<RideRequest> requests) {
        if (requests == null || requests.isEmpty()) return List.of();

        // 1. Sort by departure time
        List<RideRequest> sorted = new ArrayList<>(requests);
        sorted.sort(Comparator.comparing(r -> LocalTime.parse(r.departureTime(), TIME_FMT)));

        Set<String> assigned = new HashSet<>();
        List<MatchCluster> clusters = new ArrayList<>();
        int clusterSeq = 1;

        // 2. Sliding-window sweep
        for (int anchor = 0; anchor < sorted.size(); anchor++) {
            RideRequest anchorReq = sorted.get(anchor);
            if (assigned.contains(anchorReq.userId())) continue;

            // Collect candidates within the time window
            List<RideRequest> windowCandidates = new ArrayList<>();
            windowCandidates.add(anchorReq);

            LocalTime anchorTime = LocalTime.parse(anchorReq.departureTime(), TIME_FMT);
            for (int j = anchor + 1; j < sorted.size(); j++) {
                RideRequest candidate = sorted.get(j);
                if (assigned.contains(candidate.userId())) continue;
                LocalTime candidateTime = LocalTime.parse(candidate.departureTime(), TIME_FMT);
                long gap = java.time.Duration.between(anchorTime, candidateTime).toMinutes();
                if (gap > WINDOW_MINUTES) break; // sorted, so no more candidates possible
                windowCandidates.add(candidate);
            }

            // 3. Try largest groups first (3-rider → 2-rider)
            MatchCluster found = null;
            outer:
            for (int size = Math.min(MAX_CLUSTER_SIZE, windowCandidates.size()); size >= 2; size--) {
                List<List<RideRequest>> combos = combinations(windowCandidates, size);
                for (List<RideRequest> combo : combos) {
                    List<String> corridor = computeSharedCorridor(combo);
                    if (corridor.size() >= MIN_SHARED_NODES) {
                        found = buildCluster("CL-" + clusterSeq++, combo, corridor);
                        break outer;
                    }
                }
            }

            if (found != null) {
                found.riders().forEach(r -> assigned.add(r.userId()));
                clusters.add(found);
            } else {
                // Solo rider — build a single-rider cluster (no savings)
                assigned.add(anchorReq.userId());
                clusters.add(soloCluster("CL-" + clusterSeq++, anchorReq));
            }
        }

        return Collections.unmodifiableList(clusters);
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Computes the shared corridor for a group of riders using
     * {@link BengaluruGraphEngine#findSharedCorridorMulti}.
     */
    private List<String> computeSharedCorridor(List<RideRequest> group) {
        List<List<String>> paths = group.stream()
                .map(RideRequest::computedPath)
                .toList();
        return graphEngine.findSharedCorridorMulti(paths);
    }

    /**
     * Builds a {@link MatchCluster} for a matched group.
     *
     * <p>Fare split: the shared corridor fare is divided equally.
     * Each rider's discounted fare = ceil(sharedFare / n).
     */
    private MatchCluster buildCluster(String clusterId,
                                      List<RideRequest> riders,
                                      List<String> corridor) {
        double sharedDistKm   = graphEngine.pathDistance(corridor);
        double sharedFare      = graphEngine.soloFare(sharedDistKm);
        int    n               = riders.size();
        double perPersonFare   = Math.ceil(sharedFare / n);

        // Determine split-node name (last node of the shared corridor)
        String splitNodeId   = corridor.get(corridor.size() - 1);
        TransitNode splitNode = graphEngine.getNode(splitNodeId);
        String splitNodeName  = (splitNode != null) ? splitNode.name() : splitNodeId;

        double originalTotal = riders.stream()
                .mapToDouble(RideRequest::soloFareRs)
                .sum();

        // Representative solo fare for savings % (use average)
        double avgSoloFare = originalTotal / n;
        int savingsPct = (avgSoloFare > 0)
                ? (int) Math.round((1.0 - perPersonFare / avgSoloFare) * 100)
                : 0;
        savingsPct = Math.max(0, savingsPct); // clamp at 0

        return new MatchCluster(
                clusterId,
                Collections.unmodifiableList(riders),
                Collections.unmodifiableList(corridor),
                splitNodeName,
                Math.round(sharedDistKm * 100.0) / 100.0,
                Math.round(originalTotal * 100.0) / 100.0,
                perPersonFare,
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
     * Generates all combinations of {@code size} elements from {@code list}.
     * The anchor element (index 0) is always included in every combination
     * so the sliding-window pivot is never excluded.
     */
    private <T> List<List<T>> combinations(List<T> list, int size) {
        List<List<T>> result = new ArrayList<>();
        if (size == 1) {
            for (T item : list) result.add(List.of(item));
            return result;
        }

        T anchor = list.get(0);
        List<T> rest = list.subList(1, list.size());

        // Combinations that include the anchor
        List<List<T>> subCombos = combinations(rest, size - 1);
        for (List<T> sub : subCombos) {
            List<T> combo = new ArrayList<>();
            combo.add(anchor);
            combo.addAll(sub);
            result.add(combo);
        }
        return result;
    }
}
