import React, { useState, useEffect, useCallback, useContext } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Poll,
  Star,
  StarBorder,
  ThumbUp,
  ThumbDown,
  TrendingFlat,
  Person,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { SettingsContext } from "../../contexts";
import useOrganizationId from "../../hooks/useOrganizationId";
import { orgPath } from "../../utils/orgPath";
import { api } from "../../api";

const PERIODS = [
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
  { value: "180", label: "Last 6 months" },
  { value: "365", label: "Last 12 months" },
];

function NpsChip({ nps }) {
  if (nps === null || nps === undefined) return null;
  const isPositive = nps >= 50;
  const isNeutral = nps >= 0 && nps < 50;
  const Icon = isPositive ? ThumbUp : isNeutral ? TrendingFlat : ThumbDown;
  const bgcolor = isPositive ? "success.light" : isNeutral ? "warning.light" : "error.light";
  const color = isPositive ? "success.dark" : isNeutral ? "warning.dark" : "error.dark";
  const label = isPositive ? "Good" : isNeutral ? "Needs improvement" : "Poor";
  return (
    <Tooltip title={label}>
      <Chip
        size="small"
        icon={<Icon sx={{ fontSize: "0.85rem !important" }} />}
        label={label}
        sx={{
          bgcolor,
          color,
          fontWeight: 600,
          fontSize: "0.7rem",
          ml: 1,
          "& .MuiChip-icon": { color: "inherit" },
        }}
      />
    </Tooltip>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
      <CardContent sx={{ textAlign: "center", px: 2, py: "14px !important" }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, color: color || "text.primary", mb: 0.25, fontSize: "1.6rem" }}
        >
          {value}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontWeight: 600,
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </Typography>
        {sub && (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function StarRating({ rating, max = 5 }) {
  return (
    <Box sx={{ display: "inline-flex", gap: 0.25 }}>
      {Array.from({ length: max }).map((_, i) =>
        i < Math.round(rating) ? (
          <Star key={i} sx={{ fontSize: 16, color: "#f59e0b" }} />
        ) : (
          <StarBorder key={i} sx={{ fontSize: 16, color: "action.disabled" }} />
        )
      )}
    </Box>
  );
}

function RatingBar({ rating, count, total, primaryColor }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.75 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 60 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem" }}>
          {rating}
        </Typography>
        <Star sx={{ fontSize: 14, color: "#f59e0b" }} />
      </Box>
      <Box
        sx={{ flex: 1, height: 10, bgcolor: "action.hover", borderRadius: 1, overflow: "hidden" }}
      >
        <Box
          sx={{
            height: "100%",
            width: `${pct}%`,
            bgcolor: primaryColor || "#1976d2",
            borderRadius: 1,
            transition: "width 0.4s ease",
          }}
        />
      </Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ minWidth: 48, textAlign: "right", fontSize: "0.78rem" }}
      >
        {count} ({pct}%)
      </Typography>
    </Box>
  );
}

function FeedbackCard({ item }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, mb: 1.5 }}>
      <CardContent sx={{ py: "10px !important", px: 2 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
            mb: item.feedback ? 0.75 : 0,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person sx={{ fontSize: 16, color: "text.disabled" }} />
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
              {item.author || "Anonymous"}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {item.rating && <StarRating rating={item.rating} />}
            <Typography variant="caption" color="text.disabled">
              {new Date(item.createdAt).toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Typography>
          </Box>
        </Box>
        {item.feedback && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: "0.85rem", fontStyle: "italic" }}
          >
            "{item.feedback}"
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function SurveysTab() {
  const navigate = useNavigate();
  const organizationId = useOrganizationId();
  const { primaryColor: contextPrimaryColor } = useContext(SettingsContext);
  const primaryColor = contextPrimaryColor || "#1976d2";

  const [period, setPeriod] = useState("90");
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/surveys/admin/stats", {
        params: { period, type: "satisfaction" },
      });
      setStats(res.data);
    } catch {
      setError("Failed to load survey data. Check you have admin access.");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const ratingDistribution = stats?.ratingDistribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const totalResponses = stats?.totalResponses || 0;
  const avgRating = stats?.averageRating ? stats.averageRating.toFixed(1) : "—";
  const nps = stats?.nps ?? null;
  const npsDisplay = nps !== null ? (nps > 0 ? `+${nps}` : `${nps}`) : "—";

  const npsColor =
    nps === null
      ? "text.primary"
      : nps >= 50
        ? "success.main"
        : nps >= 0
          ? "warning.main"
          : "error.main";

  return (
    <Box sx={{ bgcolor: "#f5f5f5", minHeight: "100%", py: 3 }}>
      {/* Controls */}
      <Container maxWidth="lg" sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBack />}
            onClick={() => navigate(orgPath(organizationId, "analytics"))}
            size="small"
            sx={{ textTransform: "none", fontWeight: 500 }}
          >
            Back to Analytics
          </Button>
          <Box sx={{ flex: 1 }} />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Period</InputLabel>
            <Select value={period} label="Period" onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Container>

      {/* Header */}
      <Container maxWidth="lg" sx={{ mb: 3 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
          <Poll sx={{ fontSize: 28, color: primaryColor }} />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Satisfaction Surveys
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Quarterly one-click ratings and feedback from your members.
        </Typography>
      </Container>

      {error && (
        <Container maxWidth="lg" sx={{ mb: 2 }}>
          <Alert severity="error">{error}</Alert>
        </Container>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", pt: 6 }}>
          <CircularProgress sx={{ color: primaryColor }} />
        </Box>
      ) : stats ? (
        <Container maxWidth="lg">
          {/* KPI cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard label="Responses" value={totalResponses} sub={stats.period} />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                label="Avg rating"
                value={avgRating === "—" ? "—" : `${avgRating} / 5`}
                sub={avgRating !== "—" ? <StarRating rating={parseFloat(avgRating)} /> : null}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                label="NPS score"
                value={npsDisplay}
                color={npsColor}
                sub={<NpsChip nps={nps} />}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              <StatCard
                label="With feedback"
                value={stats.feedbackCount ?? 0}
                sub="written responses"
              />
            </Grid>
          </Grid>

          {/* Rating distribution + recent feedback */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 5 }}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Rating Distribution
                  </Typography>
                  {totalResponses === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No ratings yet in this period.
                    </Typography>
                  ) : (
                    [5, 4, 3, 2, 1].map((r) => (
                      <RatingBar
                        key={r}
                        rating={r}
                        count={ratingDistribution[r] ?? 0}
                        total={totalResponses}
                        primaryColor={primaryColor}
                      />
                    ))
                  )}

                  {totalResponses > 0 && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" color="text.secondary">
                          Promoters (4-5 ★)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {(
                            (((ratingDistribution[4] ?? 0) + (ratingDistribution[5] ?? 0)) /
                              totalResponses) *
                            100
                          ).toFixed(0)}
                          %
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">
                          Detractors (1-2 ★)
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {(
                            (((ratingDistribution[1] ?? 0) + (ratingDistribution[2] ?? 0)) /
                              totalResponses) *
                            100
                          ).toFixed(0)}
                          %
                        </Typography>
                      </Box>
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Recent Feedback
                  </Typography>
                  {!stats.recentFeedback?.length ? (
                    <Typography variant="body2" color="text.secondary">
                      No written feedback in this period.
                    </Typography>
                  ) : (
                    stats.recentFeedback.map((item) => <FeedbackCard key={item.id} item={item} />)
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {totalResponses === 0 && (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Poll sx={{ fontSize: 56, color: "action.disabled", mb: 2 }} />
              <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                No survey responses yet
              </Typography>
              <Typography variant="body2" color="text.disabled">
                Satisfaction surveys are sent quarterly to active members. Results will appear here
                once responses come in.
              </Typography>
            </Box>
          )}
        </Container>
      ) : null}
    </Box>
  );
}
