import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Hook for browser back/forward navigation observability.
 *
 * Note (issue #626): document.title used to be set here based on a hardcoded
 * path-to-title map. That has been removed. Each page-level component now
 * owns its title via the usePageTitle hook (see ./usePageTitle.js).
 */
export default function useBrowserBackNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Handle browser back/forward navigation
    const handlePopState = (event) => {
      console.log("Browser navigation event:", event.state, location.pathname);

      // Let React Router handle the navigation automatically
      // This hook can add custom logic if needed, but React Router
      // should handle most navigation scenarios correctly
    };

    // Listen for browser navigation events
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [navigate, location]);
}
