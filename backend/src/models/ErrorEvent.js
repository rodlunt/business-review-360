import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

/**
 * ErrorEvent Model
 *
 * #848: minimal ops dashboard data layer. One row per 5xx response, written
 * fire-and-forget from errorHandler.js. Deliberately carries no error
 * message, stack trace, user id or request body -- it only feeds hourly
 * error-rate counts on the internal admin console; the detailed record
 * (message, stack, PII) stays in GlitchTip/Sentry via the existing
 * Sentry.captureException call in errorHandler.js.
 *
 * See migration 0030-add-ops-metrics.sql. Pruned to 90 days by
 * opsMetricsService.pruneOpsMetrics().
 */
class ErrorEvent extends Model {}

ErrorEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    statusCode: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    route: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    errorName: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ErrorEvent",
    tableName: "ErrorEvents",
    timestamps: false,
    indexes: [{ fields: ["createdAt"] }],
  }
);

export default ErrorEvent;
