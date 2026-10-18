package com.rvce.campuspool.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rvce.campuspool.model.Models.WeatherTelemetry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * Service for fetching real-time weather telemetry for the Bengaluru / RVCE corridor
 * via Open-Meteo API.
 *
 * <p>When precipitation or rain is detected, a rain congestion multiplier is
 * automatically calculated and pushed to {@link BengaluruGraphEngine} to dynamically
 * scale Dijkstra edge weights.
 */
@Service
public class WeatherTelemetryService {

    private static final Logger log = LoggerFactory.getLogger(WeatherTelemetryService.class);

    // RVCE Bengaluru coordinates: 12.9237° N, 77.4987° E
    private static final String OPEN_METEO_URL =
            "https://api.open-meteo.com/v1/forecast?latitude=12.9237&longitude=77.4987"
            + "&current=temperature_2m,precipitation,rain,weather_code,wind_speed_10m";

    private final BengaluruGraphEngine graphEngine;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WeatherTelemetryService(BengaluruGraphEngine graphEngine, ObjectMapper objectMapper) {
        this.graphEngine = graphEngine;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .build();
    }

    /**
     * Fetches current weather telemetry from Open-Meteo, computes rain surge,
     * updates the graph engine's rain multiplier, and returns the telemetry model.
     *
     * @param simulateRain If {@code true}, forces a rain surge simulation for testing.
     * @return {@link WeatherTelemetry} containing temperature, precipitation, and surge factor.
     */
    public WeatherTelemetry fetchWeather(boolean simulateRain) {
        if (simulateRain) {
            log.info("Simulating Bengaluru monsoon downpour (6.5mm rain, 1.35x surge)");
            WeatherTelemetry sim = new WeatherTelemetry(
                    22.0,
                    6.5,
                    true,
                    "Bengaluru Monsoon Downpour (Simulated)",
                    1.35
            );
            graphEngine.setRainMultiplier(sim.recommendedSurgeMultiplier());
            return sim;
        }

        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(OPEN_METEO_URL))
                    .timeout(Duration.ofSeconds(4))
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JsonNode root = objectMapper.readTree(response.body());
                JsonNode current = root.path("current");

                double tempC = current.path("temperature_2m").asDouble(24.0);
                double precipMm = current.path("precipitation").asDouble(0.0);
                double rainMm = current.path("rain").asDouble(0.0);
                int code = current.path("weather_code").asInt(0);

                double effectivePrecip = Math.max(precipMm, rainMm);
                boolean isRaining = effectivePrecip > 0.0 || isRainWeatherCode(code);
                String condition = resolveConditionText(code, isRaining);
                double surge = calculateSurgeMultiplier(effectivePrecip, isRaining, code);

                // Automatically apply rain congestion multiplier to Dijkstra edge weights
                graphEngine.setRainMultiplier(isRaining ? surge : 1.0);

                log.info("Open-Meteo live telemetry: temp={}°C, precip={}mm, isRaining={}, surge={}x",
                        tempC, effectivePrecip, isRaining, surge);

                return new WeatherTelemetry(tempC, effectivePrecip, isRaining, condition, surge);
            } else {
                log.warn("Open-Meteo responded with HTTP {}. Falling back to default telemetry.", response.statusCode());
            }
        } catch (Exception ex) {
            log.warn("Failed to fetch live weather from Open-Meteo (offline or timeout): {}. Using graceful fallback.",
                    ex.getMessage());
        }

        // Graceful offline fallback
        return fallbackTelemetry();
    }

    /**
     * Fallback telemetry when external API is unreachable.
     */
    private WeatherTelemetry fallbackTelemetry() {
        WeatherTelemetry fallback = new WeatherTelemetry(
                24.5,
                0.0,
                false,
                "Bengaluru Pleasant (Normal)",
                1.0
        );
        graphEngine.setRainMultiplier(1.0);
        return fallback;
    }

    private boolean isRainWeatherCode(int code) {
        // WMO codes: 51-57 (drizzle), 61-67 (rain), 80-82 (showers), 95-99 (thunderstorm)
        return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
    }

    private double calculateSurgeMultiplier(double precipMm, boolean isRaining, int code) {
        if (!isRaining) return 1.0;
        if (code >= 95 || precipMm > 7.5) {
            return 1.5; // Heavy rain / Thunderstorm
        } else if (precipMm > 2.5) {
            return 1.35; // Moderate monsoon rain
        } else {
            return 1.2; // Light rain / Drizzle
        }
    }

    private String resolveConditionText(int code, boolean isRaining) {
        return switch (code) {
            case 0 -> "Clear sky";
            case 1 -> "Mainly clear";
            case 2 -> "Partly cloudy";
            case 3 -> "Overcast";
            case 45, 48 -> "Foggy";
            case 51, 53, 55 -> "Light Drizzle";
            case 61 -> "Slight Rain";
            case 63 -> "Moderate Rain";
            case 65 -> "Heavy Monsoon Downpour";
            case 80, 81, 82 -> "Rain Showers";
            case 95 -> "Thunderstorm";
            case 96, 99 -> "Severe Thunderstorm with Hail";
            default -> isRaining ? "Rainy" : "Pleasant Weather";
        };
    }
}
