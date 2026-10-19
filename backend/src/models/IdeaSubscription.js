import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";
import User from "./User.js";
import Idea from "./Idea.js";

class IdeaSubscription extends Model {}

IdeaSubscription.init(
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
    },
    ideaId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "Ideas",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    subscribed: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: "Whether user wants notifications for this idea",
    },
  },
  {
    sequelize,
    modelName: "IdeaSubscription",
    tableName: "IdeaSubscriptions",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["userId", "ideaId"],
      },
      {
        fields: ["userId"],
      },
      {
        fields: ["ideaId"],
      },
    ],
  }
);

// Associations
IdeaSubscription.belongsTo(User, { as: "user", foreignKey: "userId" });
IdeaSubscription.belongsTo(Idea, { as: "idea", foreignKey: "ideaId" });
User.hasMany(IdeaSubscription, { as: "ideaSubscriptions", foreignKey: "userId" });
Idea.hasMany(IdeaSubscription, { as: "subscriptions", foreignKey: "ideaId" });

export default IdeaSubscription;
