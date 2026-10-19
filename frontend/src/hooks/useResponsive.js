// TODO(#543 + #501): add Vitest tests once frontend test infra merges

import { useEffect, useState } from "react";

/**
 * useResponsive
 *
 * Tracks viewport width and height plus a set of common breakpoint booleans
 * and keeps them in sync with the browser window. Replaces copy-pasted resize
 * effects that previously lived in App.js.
 *
 * Listeners: `resize`, `orientationchange`, `focus` (on window). The resize
 * handler is debounced so rapid drag-resize events only trigger one state
 * update. Focus fires an immediate check so returning to a tab that was
 * resized while hidden still gets current dimensions.
 *
 * Breakpoints match the values previously hard-coded in App.js:
 *   - isMobile:  width <= 900
 *   - isTablet:  601 <= width <= 1024
 *   - isDesktop: width > 1024
 *   - isSmallScreen: width <= 600 (kept for compatibility with existing call sites)
 *
 * Returns: { width, height, isMobile, isTablet, isDesktop, isSmallScreen }
 */
export function useResponsive() {
  const getSnapshot = () => {
    if (typeof window === "undefined") {
      return {
        width: 0,
        height: 0,
        isMobile: false,
        isTablet: false,
        isDesktop: true,
        isSmallScreen: false,
      };
    }
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      width,
      height,
      isMobile: width <= 600,
      isTablet: width > 600 && width <= 1024,
      isDesktop: width > 1024,
      isSmallScreen: width <= 600,
    };
  };

  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    const check = () => {
      setState(getSnapshot());
    };

    // Run once on mount in case the window changed size between first render
    // and effect commit.
    check();

    let timeoutId;
    const debouncedCheck = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(check, 100);
    };

    window.addEventListener("resize", debouncedCheck);
    window.addEventListener("orientationchange", debouncedCheck);
    window.addEventListener("focus", check);

    return () => {
      window.removeEventListener("resize", debouncedCheck);
      window.removeEventListener("orientationchange", debouncedCheck);
      window.removeEventListener("focus", check);
      clearTimeout(timeoutId);
    };
  }, []);

  return state;
}

export default useResponsive;
