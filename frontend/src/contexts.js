import React from "react";
import { createMuiTheme } from "./muiTheme";

export const ThemeContext = React.createContext(createMuiTheme());
export const SettingsContext = React.createContext({
  primaryColor: null,
  setPrimaryColor: () => {},
  logoUrl: null,
  setLogoUrl: () => {},
  logoHighContrast: false,
  setLogoHighContrast: () => {},
});
