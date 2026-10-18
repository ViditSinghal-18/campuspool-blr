package com.rvce.campuspool;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point for CampusPool BLR – a graph-based ride-matching engine
 * for the Bengaluru Purple Line & RVCE corridor.
 */
@SpringBootApplication
public class CampusPoolApplication {

    public static void main(String[] args) {
        SpringApplication.run(CampusPoolApplication.class, args);
    }
}
