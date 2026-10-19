import { useEffect } from "react";

/**
 * Sets document.title for the current page, with the BR360 brand suffix.
 *
 * Usage:
 *   usePageTitle('Submit Idea');           // -> "Submit Idea | Business Review 360"
 *   usePageTitle();                        // -> "Business Review 360"
 *   usePageTitle(idea?.title || 'Idea');   // dynamic data with safe fallback
 *
 * Design notes:
 * - The suffix matches the static <title> in frontend/index.html so first-paint
 *   and subsequent navigation stay visually consistent.
 * - Each page-level component owns its own title. App.js no longer maintains a
 *   centralised path-to-title map (issue #626), and useBrowserBackNavigation no
 *   longer touches document.title.
 * - We do NOT restore the previous title on unmount: in a React Router SPA the
 *   next page mounts and sets its own title within the same render, and a
 *   restore step would briefly flash the suffix-only title between routes.
 *   Pages that need a clear "no specific title" state can call usePageTitle()
 *   with no argument.
 */
const SUFFIX = "Business Review 360";

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SUFFIX}` : SUFFIX;
  }, [title]);
}

export default usePageTitle;
