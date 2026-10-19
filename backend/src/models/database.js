// Sequelize initialization with retry mechanism
import { Sequelize } from "sequelize";
import cls from "cls-hooked";
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
// here keeps live secrets (RESEND_API_KEY, JWT_SECRET, Stripe keys, the
// docker-compose `db` hostname) out of the test process.
if (process.env.NODE_ENV !== "test") {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}

// Issue #561: register a CLS namespace before any model is defined so
// Sequelize threads transactions through the async chain. Dormant until
// sequelize.transaction(...) opens a transaction; existing call sites that
// do not open one are unaffected.
const namespace = cls.createNamespace("br360-tenant-tx");
Sequelize.useCLS(namespace);

export { namespace };

// Create a new Sequelize instance
const createSequelizeInstance = () => {
  const url = process.env.DATABASE_URL;
  // Issue #541: never log the raw URL (it contains the DB password).
  logger.info(`[Database] DATABASE_URL: ${redactDatabaseUrl(url)}`);
  // sqlite::memory: is not a valid WHATWG URL; use object form to avoid DEP0170.
  if (url.startsWith("sqlite:")) {
    return new Sequelize({ dialect: "sqlite", storage: ":memory:", logging: false });
  }
  return new Sequelize(url, {
    dialect: "postgres",
    logging: false,
    pool: {
      max: 20,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });
};

const sequelize = createSequelizeInstance();

// Function to test connection with retry
export const testConnection = async (retries = 5, delay = 5000) => {
  let currentTry = 0;

  while (currentTry < retries) {
    try {
      logger.info(
        `[Database] Attempting to connect to database (attempt ${currentTry + 1}/${retries})...`
      );
      await sequelize.authenticate();
      logger.info("[Database] Database connection has been established successfully.");
      return true;
    } catch (error) {
      currentTry++;
      logger.warn(`[Database] Connection attempt ${currentTry} failed: ${error.message}`);

      if (currentTry >= retries) {
        logger.error("[Database] Maximum retries reached. Could not connect to the database.");
        throw error;
      }

      logger.info(`[Database] Waiting ${delay / 1000} seconds before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

export { sequelize };
