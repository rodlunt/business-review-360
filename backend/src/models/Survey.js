/**
 * Survey Model
 *
 * Stores user survey responses for satisfaction tracking.
 *
 * Issue #445: Engagement and re-engagement email templates
 */

import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class Survey extends Model {}

Survey.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null for anonymous surveys
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
    type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: "satisfaction",
      validate: {
        isIn: [["satisfaction", "nps", "feature", "exit"]],
      },
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5,
      },
    },
    feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isAnonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "Additional survey data like specific feature ratings",
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: "email",
      comment: "How the survey was submitted: email, web, app",
    },
  },
  {
    sequelize,
    modelName: "Survey",
    tableName: "Surveys",
    timestamps: true,
    indexes: [
      {
        fields: ["organizationId", "type"],
      },
      {
        fields: ["userId", "type"],
      },
      {
        fields: ["createdAt"],
      },
    ],
  }
);

export default Survey;
