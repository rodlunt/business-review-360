import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Organization from "./Organization.js";

class SavedFilter extends Model {}

SavedFilter.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: "Name cannot be empty" },
        len: { args: [1, 100], msg: "Name must be between 1 and 100 characters" },
      },
    },
    filters: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    organizationId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "SavedFilter",
    tableName: "SavedFilters",
    timestamps: true,
  }
);

SavedFilter.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(SavedFilter, { as: "savedFilters", foreignKey: "userId" });
SavedFilter.belongsTo(Organization, { as: "organization", foreignKey: "organizationId" });
Organization.hasMany(SavedFilter, { as: "savedFilters", foreignKey: "organizationId" });

export default SavedFilter;
