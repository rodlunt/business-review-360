import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Idea from "./Idea.js";

class Vote extends Model {}

Vote.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: { min: 1, max: 1 }, // Only upvotes for now
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Vote",
    timestamps: true,
  }
);

Vote.belongsTo(User, { as: "user", foreignKey: "userId" });
User.hasMany(Vote, { as: "votes", foreignKey: "userId" });
Vote.belongsTo(Idea, { as: "idea", foreignKey: "ideaId" });
Idea.hasMany(Vote, { as: "votes", foreignKey: "ideaId" });

export default Vote;
