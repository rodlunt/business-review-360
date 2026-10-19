export function ensureValidHex(color, fallback) {
  if (!color) return fallback;
  try {
    if (color.charAt(0) !== "#") color = "#" + color;
    const isValid = /^#([0-9A-F]{3}|[0-9A-F]{6})$/i.test(color);
    return isValid ? color : fallback;
  } catch (e) {
    return fallback;
  }
}

export function contrastingFor(bg, defaultText) {
  try {
    const hex = ensureValidHex(bg, null);
    if (!hex) return defaultText;
    const h = hex.replace(/^#/, "");
    const r = parseInt(h.length === 3 ? h[0] + h[0] : h.substring(0, 2), 16);
    const g = parseInt(h.length === 3 ? h[1] + h[1] : h.substring(2, 4), 16);
    const b = parseInt(h.length === 3 ? h[2] + h[2] : h.substring(4, 6), 16);
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return lum > 0.55 ? "#222222" : "#ffffff";
  } catch (e) {
    return defaultText;
  }
}
