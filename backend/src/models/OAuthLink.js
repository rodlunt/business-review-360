import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";

class OAuthLink extends Model {}

OAuthLink.init(
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
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    providerEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "OAuthLink",
    tableName: "OAuthLinks",
    timestamps: true,
  }
);

OAuthLink.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(OAuthLink, { as: "oauthLinks", foreignKey: "userId" });

export default OAuthLink;
