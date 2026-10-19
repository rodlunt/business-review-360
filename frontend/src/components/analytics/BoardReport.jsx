import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Alert,
} from "@mui/material";
import {
  ArrowBack,
  ArrowDownward,
  ArrowUpward,
  Download,
  EmojiEvents,
  Group,
  HourglassEmpty,
  Lightbulb,
  MonetizationOn,
  RemoveCircleOutlined,
  Star,
  TrendingFlat,
  TrendingUp,
} from "@mui/icons-material";
import useOrganizationId from "../../hooks/useOrganizationId";
import { api, API_BASE_URL } from "../../api";
import { orgPath } from "../../utils/orgPath";
import { useNavigate } from "react-router-dom";

const PERIODS = [
  { value: "last-year", label: "Last Year" },
  { value: "ytd", label: "YTD" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "last-month", label: "Last Month" },
];

function TrendChip({ trend, inverse = false }) {
  if (!trend || trend.pct === null) return null;
  const isPositive = inverse ? trend.direction === "down" : trend.direction === "up";
  const isNeutral = trend.direction === "flat";
  const Icon = isNeutral ? TrendingFlat : isPositive ? ArrowUpward : ArrowDownward;
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: "0.8rem !important" }} />}
      label={`${trend.pct !== null ? Math.abs(trend.pct) + "%" : ""} vs prior`}
      sx={{
        bgcolor: isNeutral ? "action.hover" : isPositive ? "success.light" : "error.light",
        color: isNeutral ? "text.secondary" : isPositive ? "success.dark" : "error.dark",
        fontWeight: 600,
        fontSize: "0.7rem",
        ml: 1,
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  );
}

function SummaryCard({ icon: Icon, label, value, trend, color, inverse }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }} className="summary-card">
      <CardContent sx={{ textAlign: "center", px: 1, py: "12px !important" }}>
        <Icon sx={{ color, fontSize: 28, mb: 0.5 }} />
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.25, fontSize: "1.4rem" }}>
          {value}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontWeight: 600, fontSize: "0.7rem" }}
        >
          {label}
        </Typography>
        {trend && (
          <Box sx={{ mt: 0.75 }}>
            <TrendChip trend={trend} inverse={inverse} />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineFunnel({ pipeline }) {
  const stages = [
    { label: "Reviewing", count: pipeline.reviewing, color: "#f59e0b" },
    { label: "Approved", count: pipeline.approved, color: "#3b82f6" },
    { label: "In Progress", count: pipeline.inProgress, color: "#8b5cf6" },
    { label: "Implemented", count: pipeline.implemented, color: "#10b981" },
  ];
  return (
    <Box sx={{ display: "flex", alignItems: "center", width: "100%", gap: 0 }}>
      {stages.map((stage, i) => (
        <React.Fragment key={stage.label}>
          <Box sx={{ flex: 1, textAlign: "center" }}>
            <Box
              sx={{
                bgcolor: stage.color,
                color: "white",
                borderRadius: 2,
                py: 1.25,
                fontWeight: 700,
                fontSize: "1.3rem",
              }}
            >
              {stage.count}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {stage.label}
            </Typography>
          </Box>
          {i < stages.length - 1 && (
            <Typography color="text.disabled" sx={{ fontSize: "1rem", px: 0.5, flexShrink: 0 }}>
              →
            </Typography>
          )}
        </React.Fragment>
      ))}
    </Box>
  );
}

export default function BoardReport() {
  const navigate = useNavigate();
  const organizationId = useOrganizationId();
  const [period, setPeriod] = useState("ytd");
  const [hourlyRate, setHourlyRate] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);

  const fetchReport = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/reports/board-report", {
        params: { period, hourlyRate },
        signal: controller.signal,
      });
      setData(res.data);
    } catch (err) {
      if (err.code === "ERR_CANCELED" || err.name === "AbortError" || err.name === "CanceledError")
        return;
      setError("Failed to generate report. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [period, hourlyRate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    setError("");
    try {
      const res = await api.get("/reports/board-report", {
        params: { period, hourlyRate, format: "pdf" },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "executive-board-report.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setPdfLoading(false);
    }
  };

  const fmt = (n) => (n ?? 0).toLocaleString();
  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const fmtCurrency = (n) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(n ?? 0);

  const ideaHref = (slug) => `${window.location.origin}${orgPath(organizationId, `idea/${slug}`)}`;
  const handleIdeaClick = (e, slug) => {
    e.preventDefault();
    navigate(orgPath(organizationId, `idea/${slug}`));
  };

  const primaryColor = data?.meta?.organization?.primaryColor || "#1565c0";

  const logoSrc = (url) => {
    if (!url) return null;
    if (url.startsWith("http")) return url;
    return API_BASE_URL ? `${API_BASE_URL}${url}` : url;
  };

  return (
    <Box sx={{ bgcolor: "#e8eaed", minHeight: "100%", py: 3 }}>
      {/* Controls -- hidden on print */}
      <Box
        className="no-print"
        sx={{
          px: 3,
          mb: 3,
          display: "flex",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
          maxWidth: 980,
          mx: "auto",
        }}
      >
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Period</InputLabel>
          <Select value={period} label="Period" onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="number"
          label="Hourly rate"
          value={hourlyRate}
          onChange={(e) => setHourlyRate(Number(e.target.value))}
          InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
          sx={{ width: 120 }}
        />
        <Button variant="contained" onClick={fetchReport} disabled={loading}>
          Refresh
        </Button>
        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={handleDownloadPdf}
          disabled={pdfLoading || loading}
        >
          {pdfLoading ? "Generating PDF…" : "Download PDF"}
        </Button>
      </Box>

      {error && (
        <Box sx={{ px: 3, mb: 2, maxWidth: 980, mx: "auto" }}>
          <Alert severity="error">{error}</Alert>
        </Box>
      )}

      {loading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && data && (
        <Box
          className="a4-doc"
          sx={{
            bgcolor: "white",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            borderRadius: 1,
            maxWidth: 980,
            mx: "auto",
            px: { xs: 3, sm: "15mm" },
            py: { xs: 3, sm: "10mm" },
          }}
        >
          {/* Document header */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "auto 1fr auto",
              alignItems: "flex-start",
              gap: 2.5,
              mb: 2.5,
              pb: 1.5,
              borderBottom: `3px solid ${primaryColor}`,
            }}
          >
            {/* Left: org logo or Avatar fallback */}
            <Box>
              {data.meta.organization.logoUrl ? (
                <Box
                  component="img"
                  src={logoSrc(data.meta.organization.logoUrl)}
                  alt="Organisation logo"
                  sx={{ height: 44, objectFit: "contain", display: "block" }}
                />
              ) : (
                <Avatar
                  sx={{
                    bgcolor: "white",
                    color: primaryColor,
                    border: `2px solid ${primaryColor}`,
                    width: 44,
                    height: 44,
                    fontWeight: 700,
                    fontSize: "1.2rem",
                  }}
                >
                  {data.meta.organization.name?.charAt(0).toUpperCase()}
                </Avatar>
              )}
            </Box>

            {/* Centre: report title + org name */}
            <Box>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: "1.35rem",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "#0f172a",
                }}
              >
                Executive Board Report
              </Typography>
              <Typography sx={{ fontSize: "0.82rem", color: "#64748b", mt: 0.5, fontWeight: 500 }}>
                {data.meta.organization.name}
              </Typography>
            </Box>

            {/* Right: period + generated */}
            <Box sx={{ textAlign: "right" }}>
              <Typography sx={{ fontWeight: 700, fontSize: "0.82rem", color: "#334155" }}>
                Covering: {fmtDate(data.meta.start)} to {fmtDate(data.meta.end)}
              </Typography>
              <Typography sx={{ fontSize: "0.72rem", color: "#64748b", mt: 0.4 }}>
                Generated {fmtDate(data.meta.generatedAt)}
              </Typography>
            </Box>
          </Box>

          {/* Executive Summary */}
          <Typography
            sx={{
              fontWeight: 700,
              mb: 1.5,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontSize: "0.72rem",
              color: "text.secondary",
            }}
          >
            Executive Summary
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={Lightbulb}
                label="Ideas submitted"
                value={fmt(data.executiveSummary.totalIdeas.current)}
                trend={data.executiveSummary.totalIdeas}
                color="#3b82f6"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={EmojiEvents}
                label="Implemented"
                value={fmt(data.executiveSummary.implemented.current)}
                trend={data.executiveSummary.implemented}
                color="#10b981"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={Group}
                label="Active users"
                value={fmt(data.executiveSummary.activeUsers.current)}
                trend={data.executiveSummary.activeUsers}
                color="#8b5cf6"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={TrendingUp}
                label="Participation"
                value={`${data.executiveSummary.participationRate}%`}
                color="#f59e0b"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={MonetizationOn}
                label="Annual savings"
                value={fmtCurrency(data.roiImpact.annualCostSavings)}
                color="#10b981"
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4, md: 2 }}>
              <SummaryCard
                icon={HourglassEmpty}
                label="Avg days to impl."
                value={`${data.executiveSummary.avgTimeToImplementation}d`}
                color="#64748b"
              />
            </Grid>
          </Grid>

          <Divider sx={{ mb: 2.5 }} />

          {/* ROI Impact */}
          <Typography
            sx={{
              fontWeight: 700,
              mb: 1.5,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontSize: "0.72rem",
              color: "text.secondary",
            }}
          >
            ROI Impact
          </Typography>
          <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
            {[
              {
                label: "Time saved (annual)",
                value: `${fmt(data.roiImpact.annualTimeSavedHours)} hrs`,
              },
              {
                label: "Cost savings (annual)",
                value: fmtCurrency(data.roiImpact.annualCostSavings),
              },
              {
                label: "Ideas implemented (all time)",
                value: fmt(data.roiImpact.ideasImplemented),
              },
              {
                label: "Avg cost savings per idea",
                value: fmtCurrency(data.roiImpact.costPerIdea),
              },
            ].map((item) => (
              <Grid key={item.label} size={{ xs: 6, md: 3 }}>
                <Card variant="outlined" sx={{ borderRadius: 2 }}>
                  <CardContent sx={{ py: "12px !important" }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {item.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.label}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          <Divider sx={{ mb: 2.5 }} />

          {/* Pipeline Status */}
          <Typography
            sx={{
              fontWeight: 700,
              mb: 1.5,
              textTransform: "uppercase",
              letterSpacing: 1,
              fontSize: "0.72rem",
              color: "text.secondary",
            }}
          >
            Pipeline Status
          </Typography>
          <Box sx={{ mb: data.stuckCount > 0 ? 0 : 2.5 }}>
            <PipelineFunnel pipeline={data.pipeline} />
          </Box>
          {data.stuckCount > 0 && (
            <Alert severity="warning" sx={{ mb: 2.5, mt: 1.5 }} icon={<RemoveCircleOutlined />}>
              {data.stuckCount} idea{data.stuckCount > 1 ? "s" : ""} stuck in Reviewing for more
              than 14 days
            </Alert>
          )}
          {data.pipeline?.unclassified > 0 && (
            <Alert severity="warning" sx={{ mb: 2.5, mt: 1.5 }} icon={<RemoveCircleOutlined />}>
              {data.pipeline.unclassified} idea{data.pipeline.unclassified > 1 ? "s" : ""} with an
              unrecognised status excluded from this pipeline
            </Alert>
          )}

          <Divider sx={{ mb: 2.5 }} />

          {/* Bottom two-column: Top Ideas | Recommendations */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 7 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  fontSize: "0.72rem",
                  color: "text.secondary",
                }}
              >
                Top Ideas for Consideration
              </Typography>
              {data.topIdeas.length === 0 ? (
                <Typography color="text.secondary">No open ideas yet.</Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {data.topIdeas.map((idea, i) => (
                    <Card
                      key={idea.id}
                      variant="outlined"
                      component="a"
                      href={ideaHref(idea.slug)}
                      onClick={(e) => handleIdeaClick(e, idea.slug)}
                      sx={{
                        borderRadius: 2,
                        cursor: "pointer",
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <CardContent
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          py: "10px !important",
                        }}
                      >
                        <Typography
                          sx={{
                            fontWeight: 700,
                            color: "text.disabled",
                            minWidth: 20,
                            fontSize: "0.85rem",
                          }}
                        >
                          {i + 1}.
                        </Typography>
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: "text.primary" }}
                          >
                            {idea.title}
                          </Typography>
                          <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                            {idea.category && (
                              <Chip size="small" label={idea.category} variant="outlined" />
                            )}
                            <Chip size="small" label={idea.status} variant="outlined" />
                            {idea.champion && (
                              <Typography variant="caption" color="text.secondary">
                                Champion: {idea.champion}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                          <Chip
                            size="small"
                            icon={<Star sx={{ fontSize: "0.8rem !important" }} />}
                            label={`${idea.voteCount} votes`}
                            color="primary"
                            variant="outlined"
                          />
                          {idea.timeSavedMinutes && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: "block", mt: 0.5 }}
                            >
                              Saves {idea.timeSavedMinutes} min/use
                            </Typography>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <Typography
                sx={{
                  fontWeight: 700,
                  mb: 1.5,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  fontSize: "0.72rem",
                  color: "text.secondary",
                }}
              >
                Next Quarter Recommendations
              </Typography>
              {data.recommendations.length === 0 ? (
                <Typography color="text.secondary">No recommendations available yet.</Typography>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
                  {data.recommendations.map((idea, i) => (
                    <Card
                      key={idea.id}
                      variant="outlined"
                      component="a"
                      href={ideaHref(idea.slug)}
                      onClick={(e) => handleIdeaClick(e, idea.slug)}
                      sx={{
                        borderRadius: 2,
                        cursor: "pointer",
                        textDecoration: "none",
                        color: "inherit",
                        display: "block",
                        "&:hover": { bgcolor: "action.hover" },
                      }}
                    >
                      <CardContent>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600 }}
                        >
                          #{i + 1} RECOMMENDATION
                        </Typography>
                        <Typography
                          variant="body1"
                          sx={{ fontWeight: 600, mt: 0.5, color: "text.primary" }}
                        >
                          {idea.title}
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                          <Chip size="small" label={`${idea.voteCount} votes`} />
                          {idea.impactScore && (
                            <Chip
                              size="small"
                              label={`Impact: ${idea.impactScore}/10`}
                              color="primary"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </Grid>
          </Grid>

          {/* Footer */}
          <Divider sx={{ mt: 2.5, mb: 1.5, borderColor: "divider", borderBottomWidth: 2 }} />
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "1rem",
                letterSpacing: "-0.02em",
                color: "text.primary",
              }}
            >
              Business Review{" "}
              <Box component="span" sx={{ color: primaryColor }}>
                360
              </Box>
            </Typography>
            <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
              br360.example.com &nbsp;&bull;&nbsp; Confidential
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
