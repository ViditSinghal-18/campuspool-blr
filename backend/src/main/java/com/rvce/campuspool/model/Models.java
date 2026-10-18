package com.rvce.campuspool.model;

import java.util.List;

/**
 * Domain model records for CampusPool BLR.
 * All types are immutable Java 17 records serialised automatically by Jackson.
 */
public final class Models {

    private Models() {}

    // -----------------------------------------------------------------------
    // Graph primitives
    // -----------------------------------------------------------------------

    /**
     * A transit node on the Bengaluru Purple Line / Mysore Road corridor.
     *
     * @param id   Machine-friendly identifier (e.g. "RVCE", "MAJESTIC").
     * @param name Human-readable display name.
     * @param lat  WGS-84 latitude.
     * @param lng  WGS-84 longitude.
     */
    public record TransitNode(
            String id,
            String name,
            double lat,
            double lng
    ) {}

    /**
     * A directed weighted edge in the adjacency list.
     * The graph stores two Edge objects (one in each direction) for every
     * undirected connection so Dijkstra runs on the directed representation.
     *
     * @param targetNodeId Destination node identifier.
     * @param distanceKm   Road distance in kilometres.
     */
    public record Edge(
            String targetNodeId,
            double distanceKm
    ) {}

    // -----------------------------------------------------------------------
    // Ride domain
    // -----------------------------------------------------------------------

    /**
     * A single student ride request.
     *
     * @param userId           Unique student user ID.
     * @param studentName      Display name of the student.
     * @param sourceNodeId     Departure transit node ID.
     * @param destinationNodeId Arrival transit node ID.
     * @param departureTime    Requested departure time as "HH:mm".
     * @param computedPath     Ordered list of node IDs on the shortest path.
     * @param soloDistanceKm   Total path distance when riding alone.
     * @param soloFareRs       Solo auto fare in INR (Rs 16/km, min Rs 30).
     */
    public record RideRequest(
            String userId,
            String studentName,
            String sourceNodeId,
            String destinationNodeId,
            String departureTime,
            List<String> computedPath,
            double soloDistanceKm,
            double soloFareRs
    ) {}

    /**
     * A matched cluster of riders who share a common corridor segment.
     *
     * @param clusterId                Unique cluster identifier.
     * @param riders                   The matched ride requests inside this cluster.
     * @param sharedCorridorNodeIds    Node IDs of the longest common prefix.
     * @param dropOffSplitNodeName     Human-readable name of the node where the
     *                                 shared corridor ends and routes diverge.
     * @param sharedDistanceKm         Distance of the shared corridor segment.
     * @param originalTotalFareRs      Sum of all solo fares before pooling.
     * @param discountedFarePerPersonRs Each rider pays this amount.
     * @param savingsPercentage        Integer percentage saved per rider vs solo.
     */
    public record MatchCluster(
            String clusterId,
            List<RideRequest> riders,
            List<String> sharedCorridorNodeIds,
            String dropOffSplitNodeName,
            double sharedDistanceKm,
            double originalTotalFareRs,
            double discountedFarePerPersonRs,
            int savingsPercentage
    ) {}
}
