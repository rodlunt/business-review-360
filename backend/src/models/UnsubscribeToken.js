/**
 * UnsubscribeToken Model
 *
 * Stores tokens for one-click email unsubscribe functionality.
 * Supports global unsubscribe, per-idea, and per-email-type unsubscription.
 *
 * Issue #447: Unsubscribe system implementation
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import crypto from "crypto";

class UnsubscribeToken extends Model {
  /**
   * Generate a new unsubscribe token
   * @returns {string} URL-safe token
   */
  static generateToken() {
    return crypto.randomBytes(32).toString("base64url");
  }

  /**
   * Check if token is expired
   * @returns {boolean}
   */
  isExpired() {
    if (!this.expiresAt) return false; // Never expires
    return new Date() > new Date(this.expiresAt);
  }

  /**
   * Check if token has been used
   * @returns {boolean}
   */
  isUsed() {
    return !!this.usedAt;
  }

  /**
   * Check if token is valid (not expired and not used)
   * @returns {boolean}
   */
  isValid() {
    return !this.isExpired() && !this.isUsed();
  }

  /**
   * Get description of what will be unsubscribed
   * @returns {string}
   */
  getDescription() {
    switch (this.type) {
      case "global":
        return "all emails";
      case "idea":
        return `notifications for idea "${this.ideaTitle || "this idea"}"`;
      case "comments":
        return "comment notifications";
      case "status":
        return "status change notifications";
      case "digest":
        return "digest emails";
      case "engagement":
        return "engagement emails";
      default:
        return `${this.type} notifications`;
    }
  }
}

UnsubscribeToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Users",
        key: "id",
      },
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "global",
      comment: "Unsubscribe type: global, idea, comments, status, digest, engagement, etc.",
    },
    ideaId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Ideas",
        key: "id",
      },
      comment: "For per-idea unsubscribe",
    },
    ideaTitle: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Cached idea title for display",
    },
    emailType: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: "For per-email-type unsubscribe",
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Null = never expires",
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "UnsubscribeToken",
    tableName: "UnsubscribeTokens",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["token"] },
      { fields: ["userId"] },
      { fields: ["ideaId"] },
      { fields: ["type"] },
    ],
  }
);

export default UnsubscribeToken;
