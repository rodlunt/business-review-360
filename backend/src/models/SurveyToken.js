/**
 * SurveyToken Model
 *
 * Stores tokens for one-click survey ratings and tracking.
 * Tokens are used to authenticate rating clicks from emails.
 *
 * Issue #445: Engagement and re-engagement email templates
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import crypto from "crypto";

class SurveyToken extends Model {
  /**
   * Generate a unique survey token
   */
  static generateToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Check if the token has expired
   */
  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }

  /**
   * Check if the token has been used
   */
  isUsed() {
    return this.usedAt !== null;
  }
}

SurveyToken.init(
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
      onDelete: "CASCADE",
      index: true,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Organizations",
        key: "id",
      },
      onDelete: "CASCADE",
      index: true,
    },
    token: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      index: true,
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "satisfaction",
      validate: {
        isIn: [["satisfaction", "nps", "feature", "reengagement"]],
      },
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Token expiration date (null = never expires)",
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the token was used (null = not used)",
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "The rating submitted with this token",
    },
  },
  {
    sequelize,
    modelName: "SurveyToken",
    tableName: "SurveyTokens",
    timestamps: true,
    indexes: [
      {
        fields: ["token"],
        unique: true,
      },
      {
        fields: ["userId", "type"],
      },
      {
        fields: ["expiresAt"],
      },
    ],
  }
);

export default SurveyToken;
