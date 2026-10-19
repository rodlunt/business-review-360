import React, { useState } from "react";
import { api } from "../../api";
import {
  Box,
  Grid,
  Alert,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@mui/material";

const RoiCalculatorDialog = ({ open, onClose }) => {
  const [roiInputs, setRoiInputs] = useState({
    timeSavedMinutes: "",
    frequencyCount: "",
    frequencyPeriod: "month",
    implementationCost: "",
    hourlyRate: "50",
    overheadMultiplier: "1.3",
    years: "3",
    discountRate: "0.10",
  });
  const [roiResults, setRoiResults] = useState(null);
  const [roiCalculating, setRoiCalculating] = useState(false);
  const [error, setError] = useState("");

  const handleRoiInputChange = (field, value) => {
    setRoiInputs({ ...roiInputs, [field]: value });
  };

  const handleCalculateROI = async () => {
    setRoiCalculating(true);
    setError("");
    try {
      const response = await api.post("/analytics/calculate-roi", roiInputs);
      setRoiResults(response.data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to calculate ROI");
    } finally {
      setRoiCalculating(false);
    }
  };

  const handleClose = () => {
    setRoiResults(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>ROI Calculator</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Calculate the Return on Investment for implementing an idea based on time saved and
          implementation costs.
        </Typography>

        <Grid container spacing={2}>
          {/* Time Saved */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Time Saved Per Instance (minutes)"
              type="number"
              value={roiInputs.timeSavedMinutes}
              onChange={(e) => handleRoiInputChange("timeSavedMinutes", e.target.value)}
              fullWidth
              inputProps={{ min: 0 }}
            />
          </Grid>

          {/* Frequency Count */}
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField
              label="Frequency Count"
              type="number"
              value={roiInputs.frequencyCount}
              onChange={(e) => handleRoiInputChange("frequencyCount", e.target.value)}
              fullWidth
              inputProps={{ min: 1 }}
            />
          </Grid>

          {/* Frequency Period */}
          <Grid size={{ xs: 12, sm: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Per</InputLabel>
              <Select
                value={roiInputs.frequencyPeriod}
                label="Per"
                onChange={(e) => handleRoiInputChange("frequencyPeriod", e.target.value)}
              >
                <MenuItem value="day">Per Day</MenuItem>
                <MenuItem value="week">Per Week</MenuItem>
                <MenuItem value="month">Per Month</MenuItem>
                <MenuItem value="year">Per Year</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Implementation Cost */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Implementation Cost ($)"
              type="number"
              value={roiInputs.implementationCost}
              onChange={(e) => handleRoiInputChange("implementationCost", e.target.value)}
              fullWidth
              inputProps={{ min: 0 }}
            />
          </Grid>

          {/* Hourly Rate */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Hourly Labor Rate ($)"
              type="number"
              value={roiInputs.hourlyRate}
              onChange={(e) => handleRoiInputChange("hourlyRate", e.target.value)}
              fullWidth
              inputProps={{ min: 0 }}
              helperText="Average hourly cost of labor"
            />
          </Grid>

          {/* Advanced Options */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Overhead Multiplier"
              type="number"
              value={roiInputs.overheadMultiplier}
              onChange={(e) => handleRoiInputChange("overheadMultiplier", e.target.value)}
              fullWidth
              inputProps={{ min: 1, step: 0.1 }}
              helperText="Default: 1.3 (30% overhead)"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Analysis Period (years)"
              type="number"
              value={roiInputs.years}
              onChange={(e) => handleRoiInputChange("years", e.target.value)}
              fullWidth
              inputProps={{ min: 1 }}
              helperText="For NPV calculation"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Discount Rate"
              type="number"
              value={roiInputs.discountRate}
              onChange={(e) => handleRoiInputChange("discountRate", e.target.value)}
              fullWidth
              inputProps={{ min: 0, max: 1, step: 0.01 }}
              helperText="Default: 0.10 (10%)"
            />
          </Grid>
        </Grid>

        {/* Results Display */}
        {roiResults && (
          <Box
            sx={{
              mt: 4,
              p: 3,
              bgcolor: "background.paper",
              borderRadius: 2,
              border: "1px solid",
              borderColor: "divider",
            }}
          >
            <Typography variant="h6" sx={{ mb: 2, color: "primary.main" }}>
              ROI Analysis Results
            </Typography>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  Annual Hours Saved
                </Typography>
                <Typography variant="h6">
                  {roiResults.annualHoursSaved?.toFixed(1)} hours
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  Annual Cost Savings
                </Typography>
                <Typography variant="h6">${roiResults.annualBenefit?.toLocaleString()}</Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  ROI Percentage
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: roiResults.isPositiveROI ? "success.main" : "error.main" }}
                >
                  {roiResults.roiPercentage === Infinity
                    ? "∞%"
                    : `${roiResults.roiPercentage?.toFixed(1)}%`}
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  Payback Period
                </Typography>
                <Typography variant="h6">
                  {roiResults.paybackMonths === null
                    ? "N/A"
                    : `${roiResults.paybackMonths?.toFixed(1)} months`}
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  Net Present Value (NPV)
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ color: roiResults.isProfitable ? "success.main" : "error.main" }}
                >
                  ${roiResults.npv?.toLocaleString()}
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" color="text.secondary">
                  Annual Occurrences
                </Typography>
                <Typography variant="h6">{roiResults.annualOccurrences} times/year</Typography>
              </Grid>
            </Grid>

            {roiResults.isPositiveROI && roiResults.isProfitable && (
              <Alert severity="success" sx={{ mt: 2 }}>
                This idea shows positive ROI and is financially viable!
              </Alert>
            )}
            {(!roiResults.isPositiveROI || !roiResults.isProfitable) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                This idea may not be financially viable. Consider reducing implementation costs or
                increasing time savings.
              </Alert>
            )}
          </Box>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
        <Button
          variant="contained"
          onClick={handleCalculateROI}
          disabled={
            roiCalculating ||
            !roiInputs.timeSavedMinutes ||
            !roiInputs.frequencyCount ||
            !roiInputs.implementationCost
          }
        >
          {roiCalculating ? "Calculating..." : "Calculate ROI"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RoiCalculatorDialog;
