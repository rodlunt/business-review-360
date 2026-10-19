/**
 * Health Check Routes
 * Issue #336: Health checks and monitoring
 *
 * Provides health check endpoints for:
 * - Docker health checks
 * - Kubernetes liveness/readiness probes
 * - Uptime monitoring services
 * - Load balancer health checks
 */

import express from "express";
import { testConnection } from "../models/index.js";
import { testPlatformConnection } from "../models/platformDatabase.js";

const router = express.Router();

/**
 * GET /health
 * Basic health check - returns 200 if server is running
 * Used by Docker healthcheck
 */
router.get("/", async (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /health/ready
 * Readiness probe - checks if app is ready to serve traffic
 * Checks database connections
 */
router.get("/ready", async (req, res) => {
  const checks = {
    server: "ok",
    database: "unknown",
    platformDatabase: "unknown",
  };

  let allHealthy = true;

  // Check main database
  try {
    await testConnection();
    checks.database = "ok";
  } catch (error) {
    checks.database = "error";
    checks.databaseError = error.message;
    allHealthy = false;
  }

  // Check platform database
  try {
    await testPlatformConnection();
    checks.platformDatabase = "ok";
  } catch (error) {
    checks.platformDatabase = "error";
    checks.platformDatabaseError = error.message;
    allHealthy = false;
  }

  const status = allHealthy ? 200 : 503;

  res.status(status).json({
    status: allHealthy ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /health/live
 * Liveness probe - checks if app is alive (not deadlocked)
 * Simple response indicating process is running
 */
router.get("/live", (req, res) => {
  res.json({
    status: "alive",
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime(),
  });
});

/**
 * GET /health/metrics
 * System metrics for monitoring
 * Returns memory usage, uptime, etc.
 */
router.get("/metrics", (req, res) => {
  const memoryUsage = process.memoryUsage();

  res.json({
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
    pid: process.pid,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
    },
    cpu: {
      usage: process.cpuUsage(),
    },
  });
});

export default router;
