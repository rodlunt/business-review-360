import React from "react";

/**
 * Issue #836: full-viewport overlay shown during JS-initiated subdomain
 * redirects (login/register on www -> tenant subdomain, or any bookmarked
 * `/org/<slug>/...` deep-link on the main domain).
 *
 * Without this, React Router mounts the destination route on the main
 * domain for the brief window between `navigate(orgPath(...))` firing and
 * the subdomain-hop useEffect setting `window.location.href`. Lazy chunks
 * start fetching, intermediate route content paints, then the document
 * tears down for the full-page navigation: the user sees a screen
 * flicker / "multiple pages flashing" UX defect.
 *
 * Inline styles deliberately: this can render during a Suspense boundary
 * mid-fetch, before the MUI theme chunk has finished loading. Theme or
 * context dependencies would cause the very flicker we are trying to mask.
 * Single inline `<style>` keeps the keyframes self-contained with no
 * global CSS hookup.
 *
 * Accessibility: role="status" + aria-live="polite" so screen readers
 * announce the transition; the spinner glyph is aria-hidden.
 */
export default function RedirectingOverlay({ visible = false, label = "Redirecting..." }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="redirecting-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.96)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "3px solid rgba(15, 23, 42, 0.15)",
          borderTopColor: "rgba(15, 23, 42, 0.8)",
          animation: "br360-redirect-spin 0.9s linear infinite",
          marginBottom: 16,
        }}
      />
      <div style={{ fontSize: 14, color: "rgba(15, 23, 42, 0.7)" }}>{label}</div>
      <style>{`
        @keyframes br360-redirect-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
