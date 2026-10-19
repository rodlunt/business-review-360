import { DataTypes } from "sequelize";
import { sequelize } from "./database.js";

const ConsultantPayment = sequelize.define(
  "ConsultantPayment",
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
    periodMonth: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 12 },
    },
    periodYear: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 2020 },
    },
    amountCents: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 100_000_000 },
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "ConsultantPayments",
    updatedAt: false,
    createdAt: "createdAt",
  }
);

export default ConsultantPayment;
