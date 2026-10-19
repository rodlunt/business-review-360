import { DataTypes } from "sequelize";
import { sequelize } from "./database.js";

/**
 * CommissionRun model
 *
 * Records the result of each monthly commission calculation run for a
 * consultant. One row is written per consultant per run (cron or manual).
 *
 * Issue #808 Phase 3.
 */
const CommissionRun = sequelize.define(
  "CommissionRun",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    consultantId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "Consultants", key: "id" },
    },
    periodStart: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    periodEnd: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    orgCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalGrossCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalCommissionCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "aud",
    },
    emailSent: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    emailSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    runAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    triggeredBy: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "cron",
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: "CommissionRuns",
    timestamps: true,
  }
);

export default CommissionRun;
