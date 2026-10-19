// Platform Database Connection (Control Plane)
// Manages: tenants, billing, subscriptions, provisioning

import { Sequelize } from "sequelize";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { redactDatabaseUrl } from "../utils/redactDatabaseUrl.js";
import { logger } from "../utils/logger.js";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from project root.
// Issue #593: under Jest, backend/jest.setup.js has already loaded
// backend/.env.test and set NODE_ENV=test. Skipping the prod `.env` load
// here keeps live secrets out of the test process.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

// Validate that PLATFORM_DATABASE_URL is set
if (!process.env.PLATFORM_DATABASE_URL) {
  logger.error("[PlatformDatabase] PLATFORM_DATABASE_URL is not set in environment variables!");
  logger.error("[PlatformDatabase] This is required for multi-tenant billing and provisioning.");
  process.exit(1);
}

// Create a new Sequelize instance for the platform database
const createPlatformSequelizeInstance = () => {
  const url = process.env.PLATFORM_DATABASE_URL;
  // Issue #541: never log the raw URL (it contains the DB password).
  logger.info(`[PlatformDatabase] PLATFORM_DATABASE_URL: ${redactDatabaseUrl(url)}`);
  // sqlite::memory: is not a valid WHATWG URL; use object form to avoid DEP0170.
  if (url.startsWith("sqlite:")) {
    return new Sequelize({ dialect: "sqlite", storage: ":memory:", logging: false });
  }
  return new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
};

const platformSequelize = createPlatformSequelizeInstance();

// Function to test connection with retry
export const testPlatformConnection = async (retries = 5, delay = 5000) => {
  let currentTry = 0;

  while (currentTry < retries) {
    try {
      logger.info(
        `[PlatformDatabase] Attempting to connect to platform database (attempt ${
          currentTry + 1
        }/${retries})...`
      );
      await platformSequelize.authenticate();
      logger.info(
        "[PlatformDatabase] Platform database connection has been established successfully."
      );
      return true;
    } catch (error) {
      currentTry++;
      logger.warn(
        `[PlatformDatabase] Platform connection attempt ${currentTry} failed: ${error.message}`
      );

      if (currentTry >= retries) {
        logger.error(
          "[PlatformDatabase] Maximum retries reached. Could not connect to the platform database."
        );
        throw error;
      }

      logger.info(`[PlatformDatabase] Waiting ${delay / 1000} seconds before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// Helper function to execute raw SQL queries on platform database
export const queryPlatform = async (sql, params = {}) => {
  try {
    const [results] = await platformSequelize.query(sql, {
      replacements: params,
      type: Sequelize.QueryTypes.SELECT,
    });
    return results;
  } catch (error) {
    logger.error("[PlatformDatabase] Platform query error:", error);
    throw error;
  }
};

// Export the Sequelize instance
export { platformSequelize };
