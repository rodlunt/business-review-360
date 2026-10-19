import React, { useRef } from "react";
import Header from "./Header";
import Footer from "./Footer";

/**
 * Layout component - Centralised wrapper for Header + Content + Footer
 * Provides consistent layout across all pages.
 *
 * @param {object} props
 * @param {React.ReactNode} props.children - Page content to render
 * @param {object} props.headerProps - Props to pass to Header component
 * @param {React.ReactNode} props.headerChildren - Custom navigation buttons for Header
 * @param {object} props.containerStyle - Additional styles for outer container
 * @param {object} props.contentStyle - Additional styles for content area
 * @param {React.ReactNode} props.mobileMenu - Mobile menu overlay content
 */
function Layout({
  children,
  headerProps = {},
  headerChildren = null,
  containerStyle = {},
  contentStyle = {},
  mobileMenu = null,
}) {
  const scrollContainerRef = useRef(null);

  return (
    <div
      style={{
        // dvh adjusts dynamically as Chrome Android's address bar shows/hides,
        // preventing the header and footer from being clipped by browser chrome.
        // Supported since Chrome 108 (Nov 2022), Firefox 101, Safari 15.4.
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden", // Prevent body scroll
        ...containerStyle,
      }}
    >
      {/* Skip-to-content link - first focusable element for keyboard users (WCAG 2.4.1) */}
      <a
        href="#main-content"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          zIndex: 10000,
          padding: "8px 16px",
          background: "#1565c0",
          color: "#ffffff",
          textDecoration: "none",
          borderRadius: "0 0 4px 0",
        }}
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) {
            e.currentTarget.style.left = "0";
          }
        }}
        onBlur={(e) => {
          e.currentTarget.style.left = "-9999px";
        }}
      >
        Skip to main content
      </a>

      <Header {...headerProps}>{headerChildren}</Header>

      {/* Mobile menu overlay (if provided) */}
      {mobileMenu}

      {/* Content area with scrollbar */}
      <main
        id="main-content"
        ref={scrollContainerRef}
        style={{
          flex: 1,
          position: "relative",
          overflowY: "auto", // Scroll only here
          overflowX: "hidden",
          scrollbarGutter: "stable both-edges", // Symmetric gutter prevents content shift AND avoids the LTR right-only offset that pushed mobile layouts off-centre (#464)
          ...contentStyle,
        }}
      >
        {children}
      </main>

      <Footer />
    </div>
  );
}

export default Layout;
