// Utility functions for colour manipulation

/**
 * Calculates the relative luminance of a colour
 * @param {string} color - Hex colour code (e.g., "#FF6B35")
 * @returns {number} Luminance value between 0 and 1
 */
export const getLuminance = (color) => {
  // Remove # if present
  const hex = color.replace("#", "");

  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16) / 255;
  const g = parseInt(hex.substr(2, 2), 16) / 255;
  const b = parseInt(hex.substr(4, 2), 16) / 255;

  // Apply gamma correction
  const rsRGB = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  const gsRGB = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  const bsRGB = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  // Calculate luminance
  return 0.2126 * rsRGB + 0.7152 * gsRGB + 0.0722 * bsRGB;
};

/**
 * Determines if text should be light or dark based on background colour
 * @param {string} backgroundColor - Hex colour code
 * @returns {string} Either '#FFFFFF' for light text or '#000000' for dark text
 */
export const getContrastTextColor = (backgroundColor) => {
  if (!backgroundColor) return "#000000";

  try {
    const luminance = getLuminance(backgroundColor);
    // If luminance is greater than 0.5, use dark text, otherwise use light text
    return luminance > 0.5 ? "#000000" : "#FFFFFF";
  } catch (error) {
    console.error("Error calculating contrast:", error);
    return "#000000";
  }
};
