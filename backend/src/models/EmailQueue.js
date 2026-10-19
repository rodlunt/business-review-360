/**
 * EmailQueue Model
 *
 * Stores emails pending delivery with priority, retry, and scheduling support.
 *
 * Issue #446: Email queue and scheduling system
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class EmailQueue extends Model {
  /**
   * Check if email can be retried
   */
  canRetry() {
    return this.attempts < this.maxAttempts && this.status !== "cancelled";
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  getNextRetryTime() {
    const delayMinutes = Math.pow(2, this.attempts); // 2, 4, 8, 16 minutes
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  /**
   * Check if email is ready to be sent
   */
  isReady() {
    return this.status === "pending" && new Date(this.scheduledFor) <= new Date();
  }
}

EmailQueue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: "Email template type (e.g., notification, digest-weekly, password-reset)",
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 5,
      validate: {
        min: 1,
        max: 10,
      },
      comment: "1=critical, 5=normal, 10=low",
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: "pending",
      validate: {
        isIn: [["pending", "sending", "sent", "failed", "cancelled"]],
      },
    },
    to: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Email address (can be null if userId is provided)",
    },
    subject: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    data: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: "Template variables",
    },
    scheduledFor: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    maxAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 3,
    },
    messageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: "Email provider message ID for tracking (Resend, SES, etc.)",
    },
  },
  {
    sequelize,
    modelName: "EmailQueue",
    tableName: "EmailQueue",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["scheduledFor"] },
      { fields: ["priority", "scheduledFor"] },
      { fields: ["userId"] },
      { fields: ["organizationId"] },
      { fields: ["type"] },
    ],
  }
);

export default EmailQueue;
