import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  TextField,
  Typography,
} from "@mui/material";

const API_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * Validates an Australian ABN using the official checksum algorithm.
 */
function isValidAbn(raw) {
  const digits = raw.replace(/\s/g, "");
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const sum = weights.reduce((acc, w, i) => {
    const d = i === 0 ? parseInt(digits[i]) - 1 : parseInt(digits[i]);
    return acc + w * d;
  }, 0);
  return sum % 89 === 0;
}

export default function ConsultantSignupPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("invite");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [inviteError, setInviteError] = useState("");
  const [formError, setFormError] = useState("");
  const [abnError, setAbnError] = useState("");
  const [success, setSuccess] = useState(null);

  const [companyName, setCompanyName] = useState("");
  const [abn, setAbn] = useState("");
  const [referralCode, setReferralCode] = useState("");

  useEffect(() => {
    if (!token) {
      setInviteError("No invite token found in the URL.");
      setLoading(false);
      return;
    }

    axios
      .get(`${API_URL}/consultants/invite/${token}`)
      .then((res) => {
        setInviteData(res.data);
      })
      .catch((err) => {
        const status = err.response?.status;
        if (status === 404 || status === 410) {
          setInviteError("This invite link is invalid or has expired.");
        } else {
          setInviteError("Unable to load invite. Please try again later.");
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const validateAbn = (value) => {
    if (!value.trim()) {
      setAbnError("ABN is required.");
      return false;
    }
    if (!isValidAbn(value)) {
      setAbnError("Please enter a valid 11-digit Australian ABN.");
      return false;
    }
    setAbnError("");
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!validateAbn(abn)) return;

    setSubmitting(true);
    try {
      const res = await axios.post(`${API_URL}/consultants/signup`, {
        token,
        companyName: companyName.trim() || undefined,
        abn: abn.trim(),
        referralCode: referralCode.trim() || undefined,
      });
      setSuccess(res.data);
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.details?.[0]?.message ||
        "Signup failed. Please try again.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (inviteError) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Alert severity="error">{inviteError}</Alert>
      </Container>
    );
  }

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ mt: 8 }}>
        <Card variant="outlined">
          <CardContent sx={{ p: 4 }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 2 }}>
              You're all set, {inviteData.firstName}!
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              Your referral code is: <strong>{success.referralCode}</strong>
            </Typography>
            <Typography variant="body1" sx={{ mb: 1 }}>
              Your referral link:{" "}
              <strong>
                <a href={success.referralUrl} target="_blank" rel="noopener noreferrer">
                  {success.referralUrl}
                </a>
              </strong>
            </Typography>
            {success.demoLoginUrl && (
              <Typography variant="body1" sx={{ mb: 3 }}>
                Your demo environment:{" "}
                <strong>
                  <a href={success.demoLoginUrl} target="_blank" rel="noopener noreferrer">
                    {success.demoLoginUrl}
                  </a>
                </strong>
              </Typography>
            )}
            <Alert severity="success">
              Check your email for full setup instructions including how to set your demo account
              password.
            </Alert>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const commissionPct =
    inviteData?.commissionRate != null ? Math.round(inviteData.commissionRate * 100) : null;

  return (
    <Container maxWidth="sm" sx={{ mt: 8, mb: 6 }}>
      <Card variant="outlined">
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            Complete your consultant profile
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Welcome, {inviteData.firstName} {inviteData.lastName}. Fill in the details below to
            activate your referral link.
          </Typography>

          {commissionPct != null && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 3,
                p: 2,
                bgcolor: "primary.50",
                borderRadius: 1,
                border: "1px solid",
                borderColor: "primary.200",
              }}
            >
              <Chip label={`${commissionPct}% commission`} color="primary" size="small" />
              <Typography variant="body2" color="text.secondary">
                You'll earn {commissionPct}% of each referred client's monthly subscription.
              </Typography>
            </Box>
          )}

          <TextField
            label="Email"
            value={inviteData.email}
            fullWidth
            disabled
            sx={{ mb: 2.5 }}
            inputProps={{ readOnly: true }}
          />

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Company name (optional)"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              fullWidth
              sx={{ mb: 2.5 }}
              helperText="Leave blank to register under your own name."
            />

            <TextField
              label="ABN"
              value={abn}
              onChange={(e) => {
                setAbn(e.target.value);
                if (abnError) validateAbn(e.target.value);
              }}
              onBlur={() => validateAbn(abn)}
              fullWidth
              required
              sx={{ mb: 2.5 }}
              error={Boolean(abnError)}
              helperText={abnError || "11-digit Australian Business Number (required)."}
              inputProps={{ maxLength: 14 }}
            />

            <TextField
              label="Referral code (optional)"
              placeholder="Leave blank to auto-generate"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              fullWidth
              sx={{ mb: 3 }}
              helperText="Letters and numbers only. Leave blank to auto-generate."
            />

            {formError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {formError}
              </Alert>
            )}

            <Button type="submit" variant="contained" fullWidth disabled={submitting} size="large">
              {submitting ? (
                <CircularProgress size={22} color="inherit" />
              ) : (
                "Activate my referral link"
              )}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}
