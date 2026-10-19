import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  CircularProgress,
  MenuItem,
} from "@mui/material";
import { Close, Send } from "@mui/icons-material";
import { api } from "../api";

export default function ContactSalesModal({ open, onClose, preselectedPlan = "" }) {
  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    email: "",
    phone: "",
    companySize: "",
    planInterest: preselectedPlan || "enterprise",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const companySizeOptions = [
    { value: "1-10", label: "1-10 employees" },
    { value: "11-50", label: "11-50 employees" },
    { value: "51-200", label: "51-200 employees" },
    { value: "201-500", label: "201-500 employees" },
    { value: "501-1000", label: "501-1000 employees" },
    { value: "1000+", label: "1000+ employees" },
  ];

  const planOptions = [
    { value: "enterprise", label: "Enterprise Plan" },
    { value: "business", label: "Business Plan" },
    { value: "pro", label: "Pro Plan" },
    { value: "custom", label: "Custom Solution" },
  ];

  const handleChange = (field) => (event) => {
    setFormData((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
    setError("");
  };

  const validateForm = () => {
    if (!formData.companyName.trim()) {
      setError("Company name is required");
      return false;
    }
    if (!formData.contactName.trim()) {
      setError("Contact name is required");
      return false;
    }
    if (!formData.email.trim()) {
      setError("Email is required");
      return false;
    }
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address");
      return false;
    }
    if (!formData.companySize) {
      setError("Please select your company size");
      return false;
    }
    return true;
  };

  const handleClose = () => {
    if (!submitting) {
      // Reset form
      setFormData({
        companyName: "",
        contactName: "",
        email: "",
        phone: "",
        companySize: "",
        planInterest: preselectedPlan || "enterprise",
        message: "",
      });
      setError("");
      setSuccess(false);
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await api.post("/contact/sales", formData);
      setSuccess(true);

      // Auto-close after 2 seconds
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err) {
      console.error("Error submitting contact form:", err);
      setError(
        err.response?.data?.error ||
          "Failed to submit form. Please try again or contact us at sales@example.com"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: "500px",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
          Contact Sales
        </Typography>
        <IconButton onClick={handleClose} disabled={submitting} size="small" aria-label="close">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {success ? (
          <Alert severity="success" sx={{ mb: 2 }}>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>
              Thank you for your interest!
            </Typography>
            <Typography variant="body2">
              Our sales team will contact you within 24 hours.
            </Typography>
          </Alert>
        ) : (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Fill out the form below and our sales team will get back to you within 24 hours to
              discuss your requirements and provide a customised solution.
            </Typography>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                {error}
              </Alert>
            )}

            <Box component="form" sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label="Company Name"
                value={formData.companyName}
                onChange={handleChange("companyName")}
                required
                fullWidth
                size="small"
                disabled={submitting}
              />

              <TextField
                label="Contact Name"
                value={formData.contactName}
                onChange={handleChange("contactName")}
                required
                fullWidth
                size="small"
                disabled={submitting}
              />

              <TextField
                label="Email"
                type="email"
                value={formData.email}
                onChange={handleChange("email")}
                required
                fullWidth
                size="small"
                disabled={submitting}
              />

              <TextField
                label="Phone Number (Optional)"
                type="tel"
                value={formData.phone}
                onChange={handleChange("phone")}
                fullWidth
                size="small"
                disabled={submitting}
              />

              <TextField
                label="Company Size"
                select
                value={formData.companySize}
                onChange={handleChange("companySize")}
                required
                fullWidth
                size="small"
                disabled={submitting}
              >
                {companySizeOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Plan of Interest"
                select
                value={formData.planInterest}
                onChange={handleChange("planInterest")}
                fullWidth
                size="small"
                disabled={submitting}
              >
                {planOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Message (Optional)"
                multiline
                rows={4}
                value={formData.message}
                onChange={handleChange("message")}
                placeholder="Tell us about your requirements..."
                fullWidth
                disabled={submitting}
              />
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        {!success && (
          <>
            <Button onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={submitting}
              startIcon={submitting ? <CircularProgress size={16} /> : <Send />}
            >
              {submitting ? "Sending..." : "Send Message"}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
