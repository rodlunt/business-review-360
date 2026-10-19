import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

/**
 * MetricsSample Model
 *
 * #848: minimal ops dashboard data layer. One row per sampler tick
 * (opsMetricsService.sampleEmailQueue(), every 5 minutes), recording a
 * point-in-time snapshot of EmailQueue depth (pending + failed counts).
 *
 * See migration 0030-add-ops-metrics.sql. Pruned to 90 days by
 * opsMetricsService.pruneOpsMetrics().
 */
class MetricsSample extends Model {}

MetricsSample.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    sampledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    emailQueuePending: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    emailQueueFailed: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "MetricsSample",
    tableName: "MetricsSamples",
    timestamps: false,
    indexes: [{ fields: ["sampledAt"] }],
  }
);

export default MetricsSample;
