import React, { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";

import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";

import AppWrapper from "./AppRoutes";
import ThemeProvider from "./ThemeProvider";
import { createMuiTheme } from "./muiTheme";
import { AuthProvider } from "./auth";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalSnackbarProvider from "./components/GlobalSnackbar";
import { reportError } from "./utils/reportError";
import { ThemeContext, SettingsContext } from "./contexts";
export { ThemeContext, SettingsContext };

// GlitchTip / Sentry error tracking. DSN baked at build via VITE_SENTRY_DSN;
// a no-op when unset (local/dev builds). Sentry auto-captures window.onerror
// and unhandledrejection; the existing handlers below still post to
// /client-error so behaviour is preserved.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_GIT_COMMIT_HASH || undefined,
    tracesSampleRate: 0,
    initialScope: { tags: { component: "frontend" } },
  });
}

window.onerror = (message, _source, _line, _col, error) => {
  reportError(error ?? new Error(String(message)), { type: "GlobalError" });
};
window.onunhandledrejection = (event) => {
  reportError(event.reason, { type: "UnhandledRejection" });
};

const AppWithTheme = () => {
  // Primary colour should NOT be persisted to localStorage because it's organisation-specific
  // Each organisation should load its own primary colour fresh from the API
  const [primaryColor, setPrimaryColor] = useState(null);

  // Logo URL should NOT be persisted to localStorage because it's organisation-specific
  // Each organisation should load its own logo fresh from the API
  const [logoUrl, setLogoUrl] = useState(null);

  // Logo high contrast mode - organisation-specific
  const [logoHighContrast, setLogoHighContrast] = useState(false);

  // Clean up any legacy primaryColor and logoUrl in localStorage
  useEffect(() => {
    if (localStorage.getItem("primaryColor")) {
      console.log("[AppWithTheme] Removing legacy primaryColor from localStorage");
      localStorage.removeItem("primaryColor");
    }
    if (localStorage.getItem("logoUrl")) {
      console.log("[AppWithTheme] Removing legacy logoUrl from localStorage");
      localStorage.removeItem("logoUrl");
    }
  }, []);

  // Create dynamic MUI theme based on primaryColor state
  const muiTheme = useMemo(() => {
    console.log("[AppWithTheme] Creating theme with primary colour:", primaryColor);
    return createMuiTheme(primaryColor);
  }, [primaryColor]);

  // Memoize the settings context value to prevent unnecessary re-renders
  // Only recreate when the actual values change
  const settingsContextValue = useMemo(
    () => ({
      primaryColor,
      setPrimaryColor,
      logoUrl,
      setLogoUrl,
      logoHighContrast,
      setLogoHighContrast,
    }),
    [primaryColor, logoUrl, logoHighContrast]
  );

  const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  return (
    <GoogleReCaptchaProvider
      reCaptchaKey={recaptchaSiteKey || "6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI"}
      language="en"
      scriptProps={{
        async: true,
        defer: true,
        appendTo: "head",
      }}
    >
      <SettingsContext.Provider value={settingsContextValue}>
        <AuthProvider>
          <MuiThemeProvider theme={muiTheme}>
            <CssBaseline />
            <ThemeContext.Provider value={muiTheme}>
              <ThemeProvider>
                <GlobalSnackbarProvider>
                  <AppWrapper />
                </GlobalSnackbarProvider>
              </ThemeProvider>
            </ThemeContext.Provider>
          </MuiThemeProvider>
        </AuthProvider>
      </SettingsContext.Provider>
    </GoogleReCaptchaProvider>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppWithTheme />
    </ErrorBoundary>
  </React.StrictMode>
);
