import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import {
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  Link,
  Divider,
  Chip,
} from "@mui/material";
import { PlayCircleOutlined, CheckCircleOutlined } from "@mui/icons-material";
import { api, setAuthToken } from "../api";
import { useAuth } from "../auth";
import { usePageTitle } from "../hooks/usePageTitle";
import { orgPath } from "../utils/orgPath";

const DEMO_FEATURES = [
  "Explore the idea review board",
  "Try admin and user views",
  "See analytics and the priority matrix",
  "No account or credit card needed",
];

function DemoAccessPage() {
  usePageTitle("Try the Demo");

  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  // Issue #878 root-cause fix: previously this page set localStorage and
  // axios's default header but never updated `useAuth`'s React state, so
  // the immediate post-navigate render still saw `user === null` and the
  // App.jsx tree rendered the login form on /org/demo-corp/home. In prod
  // this was masked by the subdomain-hop full reload (which re-reads
  // localStorage on boot); on localhost / any path that does not reload,
  // the demo session was invisible to the React tree until manual refresh.
  // setUser(user) here makes the demo land work consistently in both.
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let recaptchaToken = null;
      if (executeRecaptcha) {
        recaptchaToken = await executeRecaptcha("demo_access");
      }

      const res = await api.post("/billing/demo-access", {
        email: email.trim() || undefined,
        recaptchaToken,
      });

      const { token, user } = res.data;
      setAuthToken(token);
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("organizationId", "demo-corp");
      // Update React auth state so the post-navigate render sees the demo
      // session without depending on a full document reload (see #878 root
      // cause above).
      setUser(user);

      navigate(orgPath("demo-corp", "home"), { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Box sx={{ textAlign: "center", mb: 4 }}>
        <PlayCircleOutlined sx={{ fontSize: 48, color: "primary.main", mb: 1 }} />
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Try Business Review 360
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Explore a live demo workspace. No account required.
        </Typography>
      </Box>

      <Paper elevation={2} sx={{ p: 4, borderRadius: 2, mb: 3 }}>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 3 }}>
          {DEMO_FEATURES.map((f) => (
            <Chip
              key={f}
              icon={<CheckCircleOutlined fontSize="small" />}
              label={f}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ fontSize: "0.75rem" }}
            />
          ))}
        </Box>

        <Divider sx={{ mb: 3 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email address (optional)"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            fullWidth
            margin="normal"
            helperText="Leave blank to explore anonymously. We'll only use this to follow up if you'd like."
          />

          <Button
            type="submit"
            variant="contained"
            size="large"
            fullWidth
            disabled={loading}
            sx={{ mt: 3, py: 1.5, fontWeight: 700 }}
          >
            {loading ? "Starting demo..." : "Start demo"}
          </Button>
        </Box>
      </Paper>

      <Box sx={{ textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Ready to get started?{" "}
          <Link href="https://demo-corp.br360.example.com/register" underline="hover">
            See it in action
          </Link>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Already have an account?{" "}
          <Link href="/org" underline="hover">
            Sign in
          </Link>
        </Typography>
      </Box>
    </Container>
  );
}

export default DemoAccessPage;
