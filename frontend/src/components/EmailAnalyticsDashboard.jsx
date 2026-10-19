/**
 * EmailAnalyticsDashboard Component
 *
 * Admin dashboard for email performance analytics and monitoring.
 * Displays metrics, charts, alerts, and recent email logs.
 *
 * Issue #448: Email analytics and monitoring dashboard
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  CircularProgress,
  Alert,
  AlertTitle,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  LinearProgress,
  Tooltip,
  IconButton,
  Collapse,
} from "@mui/material";
import {
  Email as EmailIcon,
  CheckCircle as DeliveredIcon,
  Visibility as OpenedIcon,
  TouchApp as ClickedIcon,
  Error as BouncedIcon,
  Warning as WarningIcon,
  ReportProblem as SpamIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from "@mui/icons-material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { usePageTitle } from "../hooks/usePageTitle";

// API base URL
const API_URL = import.meta.env.VITE_API_URL || "/api";

// Helper to format percentage
const formatPercent = (value) => {
  if (value === null || value === undefined) return "0%";
  return `${parseFloat(value).toFixed(1)}%`;
};

// Helper to format number with commas
const formatNumber = (value) => {
  if (value === null || value === undefined) return "0";
  return parseInt(value).toLocaleString();
};

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleString();
};

// Metric card component
function MetricCard({ title, value, icon: Icon, color, trend, subtitle }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <Box>
            <Typography color="text.secondary" variant="body2" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" component="div" sx={{ fontWeight: "bold" }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              p: 1,
              borderRadius: 2,
              bgcolor: `${color}.50`,
              color: `${color}.main`,
            }}
          >
            <Icon fontSize="large" />
          </Box>
        </Box>
        {trend !== undefined && (
          <Box sx={{ display: "flex", alignItems: "center", mt: 1 }}>
            {trend >= 0 ? (
              <TrendingUpIcon color="success" fontSize="small" />
            ) : (
              <TrendingDownIcon color="error" fontSize="small" />
            )}
            <Typography
              variant="body2"
              color={trend >= 0 ? "success.main" : "error.main"}
              sx={{ ml: 0.5 }}
            >
              {Math.abs(trend)}% vs last period
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Rate metric component with progress bar
function RateMetric({ label, value, target, isReverse = false }) {
  const numValue = parseFloat(value) || 0;
  const numTarget = parseFloat(target) || 100;
  const progress = Math.min(100, (numValue / numTarget) * 100);

  // For reverse metrics (like bounce rate), lower is better
  const isGood = isReverse ? numValue <= numTarget : numValue >= numTarget;

  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="body2">{label}</Typography>
        <Typography variant="body2" fontWeight="bold">
          {formatPercent(numValue)}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={isReverse ? Math.max(0, 100 - progress) : progress}
        color={isGood ? "success" : "warning"}
        sx={{ height: 8, borderRadius: 1 }}
      />
    </Box>
  );
}

// Status chip component
function StatusChip({ status }) {
  const getColor = () => {
    switch (status?.toLowerCase()) {
      case "sent":
        return "info";
      case "delivered":
        return "success";
      case "opened":
        return "primary";
      case "clicked":
        return "secondary";
      case "bounced":
        return "error";
      case "complained":
        return "error";
      case "failed":
        return "error";
      default:
        return "default";
    }
  };

  return <Chip size="small" label={status} color={getColor()} />;
}

// Health status chip
function HealthChip({ status }) {
  const getConfig = () => {
    switch (status?.toLowerCase()) {
      case "healthy":
        return { color: "success", label: "Healthy" };
      case "warning":
        return { color: "warning", label: "Warning" };
      case "critical":
        return { color: "error", label: "Critical" };
      case "low-engagement":
        return { color: "info", label: "Low Engagement" };
      default:
        return { color: "default", label: status || "Unknown" };
    }
  };

  const config = getConfig();
  return <Chip size="small" label={config.label} color={config.color} />;
}

// Alert component for email health issues
function EmailAlerts({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <Alert severity="success" sx={{ mb: 2 }}>
        <AlertTitle>All Clear</AlertTitle>
        No email delivery issues detected.
      </Alert>
    );
  }

  return (
    <Box>
      {alerts.map((alert, index) => (
        <Alert
          key={index}
          severity={
            alert.level === "critical" ? "error" : alert.level === "warning" ? "warning" : "info"
          }
          sx={{ mb: 1 }}
        >
          <AlertTitle>
            {alert.emailType ? `${alert.emailType}: ` : ""}
            {alert.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </AlertTitle>
          {alert.message}
        </Alert>
      ))}
    </Box>
  );
}

// Email type breakdown table
function EmailTypeBreakdown({ emailTypes }) {
  if (!emailTypes || emailTypes.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        No email type data available
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Email Type</TableCell>
            <TableCell align="right">Sent</TableCell>
            <TableCell align="right">Open Rate</TableCell>
            <TableCell align="right">CTR</TableCell>
            <TableCell align="right">Bounce</TableCell>
            <TableCell align="center">Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {emailTypes.map((type) => (
            <TableRow key={type.emailType} hover>
              <TableCell>
                <Typography variant="body2" fontWeight="medium">
                  {type.emailType.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </Typography>
              </TableCell>
              <TableCell align="right">{formatNumber(type.sent)}</TableCell>
              <TableCell align="right">{formatPercent(type.openRate)}</TableCell>
              <TableCell align="right">{formatPercent(type.clickThroughRate)}</TableCell>
              <TableCell align="right">{formatPercent(type.bounceRate)}</TableCell>
              <TableCell align="center">
                <HealthChip status={type.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Recent email logs table
function RecentEmailLogs({ logs }) {
  const [expandedRow, setExpandedRow] = useState(null);

  if (!logs || logs.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }}>
        No recent email logs
      </Typography>
    );
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell width={40}></TableCell>
            <TableCell>Type</TableCell>
            <TableCell>Recipient</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Sent</TableCell>
            <TableCell align="right">Opens</TableCell>
            <TableCell align="right">Clicks</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {logs.map((log) => (
            <React.Fragment key={log.id}>
              <TableRow hover>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    {expandedRow === log.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                    {log.type}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Tooltip title={log.to}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                      {log.to}
                    </Typography>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <StatusChip status={log.status} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" noWrap>
                    {formatDate(log.sentAt)}
                  </Typography>
                </TableCell>
                <TableCell align="right">{log.openCount || 0}</TableCell>
                <TableCell align="right">{log.clickCount || 0}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={7} sx={{ py: 0 }}>
                  <Collapse in={expandedRow === log.id}>
                    <Box sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">
                            Subject
                          </Typography>
                          <Typography variant="body2">{log.subject || "-"}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="caption" color="text.secondary">
                            Delivered At
                          </Typography>
                          <Typography variant="body2">{formatDate(log.deliveredAt)}</Typography>
                        </Grid>
                        {log.openedAt && (
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary">
                              First Opened
                            </Typography>
                            <Typography variant="body2">{formatDate(log.openedAt)}</Typography>
                          </Grid>
                        )}
                        {log.clickedAt && (
                          <Grid item xs={12} sm={6}>
                            <Typography variant="caption" color="text.secondary">
                              First Clicked
                            </Typography>
                            <Typography variant="body2">{formatDate(log.clickedAt)}</Typography>
                          </Grid>
                        )}
                        {log.bouncedAt && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Bounce Info
                            </Typography>
                            <Typography variant="body2" color="error">
                              {log.bounceType}: {log.bounceReason || log.error}
                            </Typography>
                          </Grid>
                        )}
                        {log.spamReportedAt && (
                          <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary">
                              Spam Report
                            </Typography>
                            <Typography variant="body2" color="error">
                              Reported at: {formatDate(log.spamReportedAt)}
                            </Typography>
                          </Grid>
                        )}
                      </Grid>
                    </Box>
                  </Collapse>
                </TableCell>
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// Time series chart component
function TimeSeriesChart({ data, metric = "opened" }) {
  if (!data || data.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No time series data available</Typography>
      </Box>
    );
  }

  // Format data for chart
  const chartData = data.map((item) => ({
    ...item,
    date: new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <ChartTooltip />
        <Legend />
        <Line type="monotone" dataKey="sent" stroke="#2196f3" name="Sent" strokeWidth={2} />
        <Line
          type="monotone"
          dataKey="delivered"
          stroke="#4caf50"
          name="Delivered"
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="opened" stroke="#9c27b0" name="Opened" strokeWidth={2} />
        <Line type="monotone" dataKey="clicked" stroke="#ff9800" name="Clicked" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Main dashboard component
export default function EmailAnalyticsDashboard() {
  // Issue #626: page-owned document.title.
  usePageTitle("Email Analytics");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState(0);

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_URL}/admin/email-analytics/dashboard?days=${days}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error("Error fetching email analytics:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle period change
  const handlePeriodChange = (event) => {
    setDays(event.target.value);
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchData();
  };

  if (loading && !data) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        <AlertTitle>Error Loading Analytics</AlertTitle>
        {error}
      </Alert>
    );
  }

  const { summary, emailTypes, timeSeries, alerts, recentLogs } = data || {};
  const { totals, metrics } = summary || {};

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 3 }}>
        <Typography variant="h5" component="h1" fontWeight="bold">
          Email Analytics
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select value={days} onChange={handlePeriodChange} label="Period">
              <MenuItem value={7}>Last 7 days</MenuItem>
              <MenuItem value={14}>Last 14 days</MenuItem>
              <MenuItem value={30}>Last 30 days</MenuItem>
              <MenuItem value={60}>Last 60 days</MenuItem>
              <MenuItem value={90}>Last 90 days</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={handleRefresh} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Alerts Section */}
      <Box sx={{ mb: 3 }}>
        <EmailAlerts alerts={alerts} />
      </Box>

      {/* Overview Metrics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Emails Sent"
            value={formatNumber(totals?.sent)}
            icon={EmailIcon}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Delivered"
            value={formatNumber(totals?.delivered)}
            subtitle={`${formatPercent(metrics?.deliveryRate)} delivery rate`}
            icon={DeliveredIcon}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Opened"
            value={formatNumber(totals?.uniqueOpens)}
            subtitle={`${formatPercent(metrics?.openRate)} open rate`}
            icon={OpenedIcon}
            color="info"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <MetricCard
            title="Clicked"
            value={formatNumber(totals?.uniqueClicks)}
            subtitle={`${formatPercent(metrics?.clickThroughRate)} CTR`}
            icon={ClickedIcon}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Secondary Metrics Row */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Bounced"
            value={formatNumber(totals?.bounced)}
            subtitle={`${formatPercent(metrics?.bounceRate)} bounce rate`}
            icon={BouncedIcon}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Spam Reports"
            value={formatNumber(totals?.spamReported)}
            subtitle={`${formatPercent(metrics?.spamRate)} spam rate`}
            icon={SpamIcon}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <MetricCard
            title="Unsubscribed"
            value={formatNumber(totals?.unsubscribed)}
            subtitle={`${formatPercent(metrics?.unsubscribeRate)} unsubscribe rate`}
            icon={WarningIcon}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Rate Metrics Card */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Performance Metrics
          </Typography>
          <Grid container spacing={4}>
            <Grid item xs={12} md={6}>
              <RateMetric label="Delivery Rate" value={metrics?.deliveryRate} target={95} />
              <RateMetric label="Open Rate" value={metrics?.openRate} target={30} />
              <RateMetric label="Click-Through Rate" value={metrics?.clickThroughRate} target={5} />
            </Grid>
            <Grid item xs={12} md={6}>
              <RateMetric label="Bounce Rate" value={metrics?.bounceRate} target={5} isReverse />
              <RateMetric label="Spam Rate" value={metrics?.spamRate} target={0.1} isReverse />
              <RateMetric
                label="Unsubscribe Rate"
                value={metrics?.unsubscribeRate}
                target={2}
                isReverse
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Tabs for detailed data */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
            <Tab label="Time Series" />
            <Tab label="By Email Type" />
            <Tab label="Recent Emails" />
          </Tabs>
        </Box>

        {activeTab === 0 && (
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Email Activity Over Time
            </Typography>
            <TimeSeriesChart data={timeSeries} />
          </CardContent>
        )}

        {activeTab === 1 && (
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Performance by Email Type
            </Typography>
            <EmailTypeBreakdown emailTypes={emailTypes} />
          </CardContent>
        )}

        {activeTab === 2 && (
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Recent Email Activity
            </Typography>
            <RecentEmailLogs logs={recentLogs} />
          </CardContent>
        )}
      </Card>
    </Box>
  );
}
