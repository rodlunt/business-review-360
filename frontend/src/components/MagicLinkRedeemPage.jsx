import React, { useState } from "react";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { Container, Paper, Typography, Button, Box, Alert, Link } from "@mui/material";
import { MailOutlined } from "@mui/icons-material";
import { api, setAuthToken } from "../api";
import { useAuth } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { orgPath } from "../utils/orgPath";

// #892 PR4: lands the emailed magic-link ?token=... . Deliberately does
// NOT auto-consume the token on mount -- email clients and security
// scanners prefetch GET links, and a prefetch that silently redeemed a
// single-use token would burn it before the human ever saw the page. A
// single explicit "Continue as guest" click keeps scanner prefetch
// harmless and gives a human-visible failure state (expired/used link)
// instead of a confusing already-consumed error on the real click.
function MagicLinkRedeemPage() {
  usePageTitle("Guest Sign-in");

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  // Side-channel session-establishment path: store token, set the axios
  // default header, then call setUser from useAuth BEFORE navigating, so
  // the React tree sees the session in the same commit as the navigate.
  // Mirrors DemoAccessPage's post-#878-fix pattern exactly (see the br360-gotchas skill
  // "Side-channel session-establishment paths must call useAuth#setUser").
  const { setUser } = useAuth();

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/magic-link/redeem", { token });
      const { token: authToken, user } = res.data;

      setAuthToken(authToken);
      localStorage.setItem("token", authToken);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("organizationId", "demo-corp");
      setUser(user);

      navigate(orgPath("demo-corp", "home"), { replace: true });
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        "This link is invalid or has expired. Please request a new one.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <MailOutlined sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Guest sign-in
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Continue to sign in as a guest to the Business Review 360 demo workspace.
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2, mb: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} data-testid="error-message">
            {error}
          </Alert>
        )}

        {!token ? (
          <Alert severity="error" data-testid="missing-token-message">
            This sign-in link is missing its token. Please use the link from your email, or request
            a new one.
          </Alert>
        ) : (
          <Button
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            onClick={handleContinue}
            sx={{ py: 1.5, fontWeight: 700 }}
            data-testid="continue-as-guest"
          >
            {loading ? "Signing in..." : "Continue as guest"}
          </Button>
        )}
      </Paper>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Need a new link?{" "}
          <Link component={RouterLink} to="/demo-signup" underline="hover">
            Request guest access
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}

export default MagicLinkRedeemPage;
