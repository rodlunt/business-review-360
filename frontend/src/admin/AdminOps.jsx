import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// #848: minimal ops dashboard (error rate + email-queue depth over time) on
// the internal admin console. Deferred out of #815, which delivered
// alerting; this delivers the remaining historical-visibility criterion.

const RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
];

function adminFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
}

function formatBucketLabel(iso) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function StatCard({ title, value }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent>
        <Typography color="text.secondary" variant="body2" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function AdminOps() {
  const [rangeIndex, setRangeIndex] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const hours = RANGES[rangeIndex].hours;

  const loadMetrics = useCallback(async (hoursParam) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/internal/ops/metrics?hours=${hoursParam}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMetrics(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics(hours);
  }, [hours, loadMetrics]);

  const errorChartData = (metrics?.errorSeries || []).map((p) => ({
    label: formatBucketLabel(p.bucket),
    count: p.count,
  }));

  const queueChartData = (metrics?.queueSeries || []).map((p) => ({
    label: formatBucketLabel(p.sampledAt),
    pending: p.pending,
    failed: p.failed,
  }));

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
        <Typography variant="h5" fontWeight={600}>
          Ops
        </Typography>
        <Tabs
          value={rangeIndex}
          onChange={(_e, newIndex) => setRangeIndex(newIndex)}
          aria-label="Time range"
        >
          {RANGES.map((r) => (
            <Tab key={r.label} label={r.label} />
          ))}
        </Tabs>
      </Box>

      {loading && <CircularProgress size={32} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!loading && !error && metrics && (
        <>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={4}>
              <StatCard title="Errors (last 24h)" value={metrics.totals.errors24h} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard title="Current queue pending" value={metrics.totals.currentPending} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <StatCard title="Current queue failed" value={metrics.totals.currentFailed} />
            </Grid>
          </Grid>

          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Error rate over time
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={errorChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <ChartTooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#d32f2f"
                  name="Errors"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={2}>
              Email queue depth over time
            </Typography>
            {queueChartData.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No queue samples in this window yet.
              </Typography>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={queueChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <ChartTooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="pending"
                    stroke="#1976d2"
                    name="Pending"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    stroke="#ed6c02"
                    name="Failed"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
