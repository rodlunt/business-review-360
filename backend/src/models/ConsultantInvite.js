import { DataTypes } from "sequelize";
import { sequelize } from "./database.js";

/**
 * ConsultantInvite model: platform-level (no org scope).
 *
 * A one-time invite token sent to a prospective consultant. Once accepted
 * (usedAt is set) or expired (expiresAt < now) the token is no longer valid.
 */
const ConsultantInvite = sequelize.define(
  "ConsultantInvite",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    commissionRate: {
      type: DataTypes.DECIMAL(5, 4),
      allowNull: false,
      defaultValue: 0.3,
      // Mirrors the 0..1 CHECK added in migration 0025.
      validate: { min: 0, max: 1 },
    },
  },
  {
    tableName: "ConsultantInvites",
    timestamps: true,
  }
);

/**
 * Returns true when the invite has expired or has already been used.
 */
ConsultantInvite.prototype.isExpired = function () {
  return this.usedAt !== null || new Date(this.expiresAt) < new Date();
};

export default ConsultantInvite;
