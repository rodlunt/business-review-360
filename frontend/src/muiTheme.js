import { createTheme } from "@mui/material/styles";

// Helper function to darken a hex colour
const darkenColor = (hex, percent = 15) => {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - percent / 100));
  const b = Math.max(0, (num & 0xff) * (1 - percent / 100));
  return (
    "#" +
    Math.round(r).toString(16).padStart(2, "0") +
    Math.round(g).toString(16).padStart(2, "0") +
    Math.round(b).toString(16).padStart(2, "0")
  );
};

// Global reusable style tokens
export const CARD_SHADOW = "0 2px 16px rgba(0,0,0,0.08)";

export const PAGE_TITLE_STYLE = {
  variant: "h1",
  component: "h1",
  sx: {
    color: "text.primary",
    mb: { xs: 1.5, sm: 2 },
  },
};

export const INFO_TIP_STYLE = {
  mt: 4,
  p: 2,
  bgcolor: "action.hover",
  borderRadius: 2,
};

// Spacing and avatar size tokens used across the app for consistent rhythm
export const SPACING = {
  micro: 0.5,
  small: 1,
  medium: 2,
  large: 3,
  xlarge: 4,
};

export const AVATAR_SIZES = {
  xs: 24,
  sm: 32,
  md: 40,
};

export const createMuiTheme = (primaryColor = "#1565c0") => {
  const mainColor = primaryColor || "#1565c0";
  const darkColor = darkenColor(mainColor);

  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: mainColor,
        dark: darkColor,
      },
      secondary: {
        main: "#dc004e",
      },
      background: {
        default: "#f4f4f5",
        paper: "#fff",
      },
      text: {
        primary: "#09090b",
        secondary: "#52525b",
      },
      success: {
        main: "#22c55e",
      },
      warning: {
        main: "#eab308",
      },
      error: {
        main: "#ef4444",
      },
      divider: "#e4e4e7",
    },
    typography: {
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      h1: { fontWeight: 700, fontSize: "1.5rem" }, // 24px
      h2: { fontWeight: 700 },
      h3: { fontWeight: 700 },
      h4: { fontWeight: 700 },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
    },
    shape: {
      borderRadius: 6,
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: ({ theme }) => ({
            fontSize: "0.875rem",
            fontWeight: 600,
            textTransform: "none",
            minWidth: theme.spacing(18), // 144px (18 × 8)
            height: theme.spacing(5), // 40px (5 × 8)
            minHeight: 44, // WCAG 2.5.8 (Target Size, Minimum) tap-target floor
            "&:focus": {
              outline: "none",
              boxShadow: "none",
            },
          }),
          outlined: {
            borderColor: mainColor,
          },
        },
        variants: [
          {
            props: { variant: "greyscale" },
            style: {
              color: "#09090b", // text.primary
              border: "1px solid #c4c4c4c4",
              backgroundColor: "transparent",
              fontSize: "0.875rem",
              textTransform: "none",
              "&:hover": {
                backgroundColor: "#f5f5f5",
                borderColor: "#d0d0d0",
              },
              "&:disabled": {
                color: "#71717a", // text.secondary
                borderColor: "#fcfcfc",
                backgroundColor: "transparent",
              },
            },
          },
          {
            props: { variant: "greyscaleActive" },
            style: {
              color: "white",
              border: `1px solid ${mainColor}`,
              backgroundColor: mainColor,
              fontSize: "0.875rem",
              textTransform: "none",
              "&:hover": {
                backgroundColor: darkColor,
                borderColor: darkColor,
                color: "white",
              },
            },
          },
        ],
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: "#fffbe6",
            color: "#222",
            border: "1px solid #eab308",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            fontWeight: 500,
            fontSize: "0.95rem",
            padding: "8px 12px",
            borderRadius: 4,
          },
          arrow: {
            color: "#fffbe6",
            "&:before": {
              border: "1px solid #eab308",
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            maxWidth: "100%",
          },
          label: {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        },
      },
    },
  });
};

export default createMuiTheme();
