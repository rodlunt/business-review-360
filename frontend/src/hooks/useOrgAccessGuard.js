import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

/**
 * Hook to enforce organisation access control
 * Validates that the user can only access their own organisation's routes
 * Redirects to correct org if mismatch detected
 */
export function useOrgAccessGuard() {
  const { orgId: urlOrgId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Get user's actual organisation from localStorage
    const userStr = localStorage.getItem("user");

    if (!userStr) {
      console.warn("[OrgAccessGuard] No user in localStorage");
      return;
    }

    try {
      const user = JSON.parse(userStr);
      const userOrgId = user.organizationId;

      // If user has no organisation, they shouldn't access org routes
      if (!userOrgId) {
        console.error("[OrgAccessGuard] User has no organizationId");
        navigate("/org", { replace: true });
        return;
      }

      // CRITICAL SECURITY CHECK: URL org must match user's org
      if (urlOrgId && urlOrgId !== userOrgId) {
        console.error("[SECURITY] Cross-organisation access attempt blocked:", {
          userOrgId,
          attemptedOrgId: urlOrgId,
          userId: user.id,
          username: user.username,
        });

        // Redirect to user's actual organisation
        const currentPath = window.location.pathname;
        const correctedPath = currentPath.replace(`/org/${urlOrgId}`, `/org/${userOrgId}`);

        console.log("[OrgAccessGuard] Redirecting to correct org:", correctedPath);
        navigate(correctedPath, { replace: true });
      }
    } catch (error) {
      console.error("[OrgAccessGuard] Failed to parse user data:", error);
    }
  }, [urlOrgId, navigate]);
}

export default useOrgAccessGuard;
