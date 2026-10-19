import React, { useEffect, useContext } from "react";
import { ThemeContext } from "./contexts";

export function ThemeProvider({ children }) {
  const theme = useContext(ThemeContext);

  useEffect(() => {
    // Update CSS variables when theme changes
    const root = document.documentElement;

    // Helper function to ensure proper hex format
    const ensureValidHex = (color, defaultColor) => {
      if (!color) return defaultColor;
      if (color.charAt(0) !== "#") color = "#" + color;
      const isValidHex = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(color);
      return isValidHex ? color : defaultColor;
    };

    // Apply the professional grayscale theme
    root.style.setProperty("--primary", ensureValidHex(theme.primaryColor, "#18181b"));
    root.style.setProperty("--secondary", ensureValidHex(theme.secondaryColor, "#52525b"));
    root.style.setProperty("--background", ensureValidHex(theme.backgroundColor, "#ffffff"));
    root.style.setProperty("--surface", ensureValidHex(theme.surfaceColor, "#f4f4f5"));
    root.style.setProperty("--foreground", "#ffffff");
    root.style.setProperty("--text", ensureValidHex(theme.textColor, "#09090b"));
    root.style.setProperty("--text-muted", ensureValidHex(theme.mutedColor, "#71717a"));
    root.style.setProperty("--form-text", ensureValidHex(theme.formTextColor, "#09090b"));
    root.style.setProperty("--header-text", ensureValidHex(theme.headerTextColor, "#ffffff"));
    root.style.setProperty("--button-text", ensureValidHex(theme.buttonTextColor, "#ffffff"));
    root.style.setProperty("--border", ensureValidHex(theme.borderColor, "#e4e4e7"));
    root.style.setProperty("--accent", ensureValidHex(theme.accentColor, "#3f3f46"));

    // Apply to body for base styling
    document.body.style.backgroundColor = ensureValidHex(theme.backgroundColor, "#ffffff");
    document.body.style.color = ensureValidHex(theme.textColor, "#09090b");

    // Log the applied colours for debugging
    console.log("CSS variables applied:", {
      primary: getComputedStyle(root).getPropertyValue("--primary"),
      secondary: getComputedStyle(root).getPropertyValue("--secondary"),
      background: getComputedStyle(root).getPropertyValue("--background"),
      text: getComputedStyle(root).getPropertyValue("--text"),
    });
  }, [theme]);

  return <>{children}</>;
}

export default ThemeProvider;
