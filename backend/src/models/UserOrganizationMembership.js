import { DataTypes } from "sequelize";
import { sequelize } from "./database.js";

const UserOrganizationMembership = sequelize.define(
  "UserOrganizationMembership",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isSuperuser: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "UserOrganizationMemberships",
    timestamps: true,
    updatedAt: false,
    createdAt: "createdAt",
    indexes: [{ unique: true, fields: ["userId", "organizationId"] }],
  }
);

export default UserOrganizationMembership;
