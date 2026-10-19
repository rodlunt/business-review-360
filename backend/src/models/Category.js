import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class Category extends Model {}

Category.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "organizationId",
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "createdBy",
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true, // Categories can be global (null tenant_id)
    },
    createdAt: {
      type: DataTypes.DATE,
      field: "createdAt",
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: "updatedAt",
    },
  },
  {
    sequelize,
    modelName: "Category",
    tableName: "Categories",
    timestamps: true,
    underscored: false,
  }
);

export default Category;
