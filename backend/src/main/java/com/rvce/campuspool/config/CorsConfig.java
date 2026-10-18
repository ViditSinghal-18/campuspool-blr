package com.rvce.campuspool.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Global CORS configuration.
 *
 * <p>Allows the Next.js development server at {@code http://localhost:3000}
 * to call all {@code /api/**} endpoints with GET, POST, PUT, DELETE, OPTIONS.
 *
 * <p>The per-controller {@code @CrossOrigin} annotation on
 * {@link com.rvce.campuspool.controller.SimulationController} is sufficient
 * for the current route set; this bean acts as a belt-and-suspenders policy
 * for any future controllers added to the project.
 */
@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/api/**")
                        .allowedOrigins("http://localhost:3000")
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*")
                        .allowCredentials(false)
                        .maxAge(3600);
            }
        };
    }
}
