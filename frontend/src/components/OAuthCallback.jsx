import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useAuth } from "../auth";
import { getSubdomainURL, isOnSubdomain, isAdminSubdomain } from "../utils/orgPath";

const ERROR_MESSAGES = {
  provider_disabled: "This sign-in method is not enabled for your organisation.",
  provider_not_configured: "OAuth provider is not configured. Contact your administrator.",
  token_exchange_failed: "Could not complete sign-in with the provider. Please try again.",
  invalid_profile: "Could not retrieve your profile from the provider.",
  registration_disabled: "Self-registration is disabled for this organisation.",
  tenant_not_found: "Organisation not found.",
  user_not_found: "Your account was not found. Please contact your administrator.",
  account_pending_approval: "Your account is pending administrator approval.",
  domain_not_allowed: "Your email domain is not authorised for this organisation.",
  invalid_state: "Sign-in session expired or was tampered with. Please try again.",
  missing_params: "Incomplete response from provider. Please try again.",
  server_error: "An unexpected error occurred. Please try again.",
  access_denied: "Sign-in was cancelled.",
  provider_already_linked_to_another_account:
    "This provider account is already linked to a different user.",
};

export default function OAuthCallback() {
  const { organizationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const handled = useRef(false);

  const token = searchParams.get("token");
  const error = searchParams.get("error");
  const linked = searchParams.get("linked");

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Admin console callback: store token and navigate to admin home.
    if (isAdminSubdomain()) {
      if (error) {
        const msg = ERROR_MESSAGES[error] || "Sign-in failed. Please try again.";
        navigate(`/login?oauthError=${encodeURIComponent(msg)}`, { replace: true });
        return;
      }
      if (!token) {
        navigate("/login?oauthError=No%20token%20received%20from%20provider.", { replace: true });
        return;
      }
      localStorage.setItem("token", token);
      navigate("/", { replace: true });
      return;
    }

    const orgId = organizationId || localStorage.getItem("organizationId");

    // When on the main domain, bounce through the subdomain so that
    // loginWithToken() stores the JWT in subdomain-scoped localStorage.
    if (!isOnSubdomain() && orgId) {
      if (error) {
        const msg = ERROR_MESSAGES[error] || "Sign-in failed. Please try again.";
        window.location.href = getSubdomainURL(
          orgId,
          `login?oauthError=${encodeURIComponent(msg)}`
        );
        return;
      }
      if (linked) {
        window.location.href = getSubdomainURL(orgId, "admin");
        return;
      }
      if (!token) {
        window.location.href = getSubdomainURL(
          orgId,
          `login?oauthError=${encodeURIComponent("No token received from provider.")}`
        );
        return;
      }
      const qs = `token=${encodeURIComponent(token)}`;
      window.location.href = getSubdomainURL(orgId, `oauth-callback?${qs}`);
      return;
    }

    // On subdomain: complete the flow.
    if (error) {
      const message = ERROR_MESSAGES[error] || "Sign-in failed. Please try again.";
      navigate("/login", { replace: true, state: { oauthError: message } });
      return;
    }

    // Provider successfully linked: redirect to admin settings.
    if (linked) {
      navigate("/admin", { replace: true, state: { oauthLinked: linked } });
      return;
    }

    if (!token) {
      navigate("/login", {
        replace: true,
        state: { oauthError: "No token received from provider." },
      });
      return;
    }

    loginWithToken(token)
      .then(() => {
        navigate("/home", { replace: true });
      })
      .catch(() => {
        navigate("/login", {
          replace: true,
          state: { oauthError: "Could not complete sign-in. Please try again." },
        });
      });
  }, [token, error, linked, organizationId, loginWithToken, navigate]);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 2,
      }}
    >
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary">
        Completing sign-in…
      </Typography>
    </Box>
  );
}
