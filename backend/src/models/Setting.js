import { DataTypes, Model } from "sequelize";
import { sequelize } from "./database.js";

class Setting extends Model {}

Setting.init(
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    value: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Setting",
    timestamps: false,
  }
);

export default Setting;
