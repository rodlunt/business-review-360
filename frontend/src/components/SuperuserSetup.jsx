import React, { useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Tooltip,
  Typography as MuiTypography,
  InputAdornment,
  IconButton,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import Header from "./Header";
import Footer from "./Footer";
import { api } from "../api";
function SuperuserSetup({ onSuccess, orgId }) {
  const [confirmFocus, setConfirmFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    email: "",
  });
  // Password criteria checks
  const hasLength = form.password.length >= 8;
  const hasNumber = /\d/.test(form.password);
  const hasLetter = /[A-Za-z]/.test(form.password);
  const hasCapital = /[A-Z]/.test(form.password);
  const hasSpecial = /[!@#$%^&*()_+\-=]/.test(form.password);
  const passwordCriteriaMet = hasLength && hasNumber && hasLetter && hasCapital && hasSpecial;
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  // Simple email validation regex
  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    if (!form.email) {
      setError("Email is required for superuser.");
      setLoading(false);
      return;
    }
    if (form.password !== confirmPassword) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }
    try {
      const res = await api.post("/setup/create-superuser", {
        ...form,
        organizationId: orgId,
      });
      onSuccess && onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to create superuser");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: 400,
        p: 2,
      }}
    >
      <Card data-testid="superuser-setup">
        <CardContent>
          <Typography variant="h5" align="center" fontWeight={700} mb={2}>
            First Time Setup: Create Superuser
          </Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            aria-label="Superuser setup form"
            sx={{ display: "flex", flexDirection: "column" }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {/* Username input */}
              <TextField
                label="Username"
                name="username"
                value={form.username}
                onChange={handleChange}
                required
                placeholder="Enter username"
                size="small"
                slotProps={{ input: { "data-testid": "admin-username" } }}
              />
              {/* Email input below username */}
              <TextField
                label="Email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                required
                placeholder="Enter email"
                size="small"
                slotProps={{ input: { "data-testid": "admin-email" } }}
                onFocus={() => setEmailFocus(true)}
                onBlur={() => {
                  setEmailFocus(false);
                  setEmailTouched(true);
                }}
              />
              {/* Password input (no info icon) */}
              <TextField
                label="Password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                required
                placeholder="Enter password"
                size="small"
                slotProps={{
                  input: {
                    "data-testid": "admin-password",
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
              />
              {/* Confirm Password input */}
              <TextField
                label="Confirm Password"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm password"
                size="small"
                slotProps={{
                  input: {
                    "data-testid": "admin-confirm-password",
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle confirm password visibility"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          edge="end"
                          size="small"
                        >
                          {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                fullWidth
                sx={{ pb: 2 }}
                onFocus={() => setConfirmFocus(true)}
                onBlur={() => setConfirmFocus(false)}
              />
            </Box>
            {/* Unified alerts container above the button */}
            {(passwordFocus && form.password.length > 0) ||
            (confirmFocus && confirmPassword.length > 0 && form.password !== confirmPassword) ||
            (emailFocus && !form.email) ||
            (emailTouched && form.email && !isValidEmail(form.email)) ||
            error ? (
              <Box sx={{ m: 0, p: 0 }}>
                {/* Password requirements alert */}
                {passwordFocus && form.password.length > 0 && (
                  <Alert severity={passwordCriteriaMet ? "success" : "info"} sx={{ m: 0, p: 0 }}>
                    {passwordCriteriaMet ? (
                      "Password meets criteria."
                    ) : (
                      <>
                        {!hasLength && <div>Must be at least 8 characters.</div>}
                        {!hasNumber && <div>Must have 1 number.</div>}
                        {!hasLetter && <div>Must have 1 letter.</div>}
                        {!hasCapital && <div>Must have 1 capital letter.</div>}
                        {!hasSpecial && <div>Must have 1 special character (!@#$%^&*()_+-=).</div>}
                      </>
                    )}
                  </Alert>
                )}
                {/* Passwords do not match alert */}
                {confirmFocus &&
                  confirmPassword.length > 0 &&
                  form.password !== confirmPassword && (
                    <Alert severity="error" aria-live="assertive" sx={{ m: 0, p: 0 }}>
                      Passwords do not match.
                    </Alert>
                  )}
                {/* Email qualifier alert */}
                {emailFocus && !form.email && (
                  <Alert severity="info" sx={{ m: 0, p: 0 }}>
                    Email is required for superuser.
                  </Alert>
                )}
                {/* Invalid email format alert */}
                {emailTouched && form.email && !isValidEmail(form.email) && (
                  <Alert severity="error" sx={{ m: 0, p: 0 }}>
                    Does not appear to be a valid email.
                  </Alert>
                )}
                {/* Error alert */}
                {error && (
                  <Alert severity="error" aria-live="assertive" sx={{ m: 0, p: 0 }}>
                    {error}
                  </Alert>
                )}
              </Box>
            ) : null}
            {/* Create Superuser button with custom margin above */}
            <Button
              type="submit"
              disabled={loading}
              variant="contained"
              data-testid="create-superuser-button"
              color="primary"
              sx={{ mt: 2 }}
            >
              {loading ? <CircularProgress size={20} /> : "Create Superuser"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
export default SuperuserSetup;
