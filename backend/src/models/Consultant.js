import { DataTypes } from "sequelize";
import { sequelize } from "./database.js";

/**
 * Consultant model: platform-level (no org scope).
 *
 * Represents a registered consultant partner who earns commission on referred
 * client subscriptions. userId is null until the consultant creates a BR360
 * account of their own.
 */
const Consultant = sequelize.define(
  "Consultant",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "Users", key: "id" },
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    companyName: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    abn: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    referralCode: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    commissionRate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.3,
      // Mirrors the 0..1 CHECK added in migration 0025; the rate multiplies
      // live Stripe revenue in the monthly commission job.
      validate: { min: 0, max: 1 },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: "Consultants",
    timestamps: true,
  }
);

export default Consultant;
