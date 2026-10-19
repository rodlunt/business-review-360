import React from "react";
import { useContext } from "react";
import { SettingsContext } from "../../contexts";
import { INFO_TIP_STYLE } from "../../muiTheme";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Divider,
  Tooltip as MuiTooltip,
} from "@mui/material";
import {
  TrendingUp,
  People,
  Comment,
  ThumbUp,
  CheckCircle,
  Warning,
  Schedule,
  AttachMoney,
  Visibility,
  Lightbulb,
  Timer,
  CheckCircleOutlined,
} from "@mui/icons-material";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import SetupChecklist from "../SetupChecklist";
import StatCard from "./StatCard";
import AIInsightsCard from "./AIInsightsCard";
import { orgPath } from "../../utils/orgPath";
import { fillDailySeries } from "../../utils/fillDailySeries";

const OverviewTab = ({ data, organizationId, navigate }) => {
  const { primaryColor: contextPrimaryColor, logoUrl } = useContext(SettingsContext);
  const primaryColor = contextPrimaryColor || "#1976d2";

  const {
    summary,
    stuckIdeas = [],
    ideasByStatus,
    ideasByCategory,
    ideasOverTime,
    topIdeasByVotes,
    userEngagement,
  } = data;

  // Generate color variations from primary color for charts
  const lightenColor = (color, percent) => {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = ((num >> 8) & 0x00ff) + amt;
    const B = (num & 0x0000ff) + amt;
    return (
      "#" +
      (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
      )
        .toString(16)
        .slice(1)
    );
  };

  const darkenColor = (color, percent) => {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = ((num >> 8) & 0x00ff) - amt;
    const B = (num & 0x0000ff) - amt;
    return (
      "#" +
      (0x1000000 + (R > 0 ? R : 0) * 0x10000 + (G > 0 ? G : 0) * 0x100 + (B > 0 ? B : 0))
        .toString(16)
        .slice(1)
    );
  };

  // Status color mapping - EXACT colors from screenshot (NOT tied to primary color)
  // NOTE: These colors are ONLY used for Ideas by Status graph dots and bars
  // All other components (icons, charts, chips) use primaryColor from theme
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case "reviewing":
        return "#ed6c02"; // orange
      case "in progress":
        return "#2e7d32"; // green
      case "approved":
        return "#2e7d32"; // green
      case "complete":
        return "#2e7d32"; // green
      case "rejected":
        return "#d32f2f"; // red
      case "duplicate":
        return "#d32f2f"; // red
      case "hidden":
        return "#757575"; // grey
      case "open":
        return "#757575"; // grey
      default:
        return "#757575"; // grey
    }
  };

  // Format data for charts - ensure all 8 statuses are present in correct order
  const allStatuses = [
    "Reviewing",
    "In Progress",
    "Approved",
    "Complete",
    "Rejected",
    "Duplicate",
    "Hidden",
    "Open",
  ];

  // Create a map of existing data
  const statusCountMap = {};
  ideasByStatus.forEach((item) => {
    statusCountMap[item.status] = parseInt(item.count);
  });

  // Build complete status data with all 8 statuses, then append anything the
  // API returned that this list does not know (e.g. the backend's "Other"
  // bucket, #951) so no status silently vanishes from the chart.
  const statusData = allStatuses
    .map((status) => ({
      status,
      count: statusCountMap[status] || 0,
    }))
    .concat(
      Object.keys(statusCountMap)
        .filter((status) => !allStatuses.includes(status))
        .map((status) => ({ status, count: statusCountMap[status] }))
    );

  const categoryData = ideasByCategory.slice(0, 8).map((item) => ({
    category: item.category.length > 12 ? item.category.substring(0, 12) + "..." : item.category,
    fullCategory: item.category, // Keep full category name for tooltip
    count: parseInt(item.count),
  }));

  // #952: the API now serves a true 30-day window; zero-fill it so days
  // without submissions render as zero instead of being skipped, which drew
  // a misleadingly continuous line across sparse data.
  const timelineData = fillDailySeries(ideasOverTime, 30).map((item) => ({
    // timeZone UTC pins the label to the key's own calendar day; without it,
    // viewers west of UTC saw every label shifted back a day.
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    ideas: item.count,
  }));

  // Format time saved for display
  const formatTimeSaved = (minutes) => {
    if (!minutes || minutes === 0) return "0 min";
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) {
      // Less than 1 day
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    }
    // 1 day or more
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  };

  return (
    <>
      {/* Setup checklist: admin only, auto-hides at 100% or on dismiss */}
      <SetupChecklist
        organizationId={organizationId}
        summary={summary}
        ideasByCategory={ideasByCategory}
        logoUrl={logoUrl}
      />

      {/* Kaizen Tip */}
      <Box sx={{ ...INFO_TIP_STYLE, borderLeft: `4px solid ${primaryColor}`, mb: 4 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
          <Lightbulb sx={{ color: primaryColor, fontSize: 20, mt: 0.25 }} />
          <Typography variant="body2" color="text.primary">
            <strong>Kaizen Tip:</strong> Focus on reducing "Reviewing" time and increasing
            completion rate. Engage with high-vote ideas to maintain momentum. Encourage active
            contributors to mentor others.
          </Typography>
        </Box>
      </Box>

      {/* Stuck ideas card */}
      {stuckIdeas.length > 0 && (
        <Card
          variant="outlined"
          sx={{ mb: 3, borderColor: "warning.main" }}
          data-testid="stuck-ideas-card"
        >
          <CardContent>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
              <Warning sx={{ color: "warning.main" }} />
              <Typography variant="subtitle1" fontWeight={700}>
                Needs attention ({stuckIdeas.length})
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              {stuckIdeas.length === 1 ? "This idea has" : "These ideas have"} been in
              &ldquo;Reviewing&rdquo; for over 30 days.
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {stuckIdeas.map((idea) => (
                <Box component="li" key={idea.id} sx={{ mb: 0.5 }}>
                  <Typography
                    variant="body2"
                    component="a"
                    onClick={() => navigate(orgPath(organizationId, `idea/${idea.slug}`))}
                    sx={{
                      cursor: "pointer",
                      color: "primary.main",
                      textDecoration: "underline",
                      fontWeight: 500,
                    }}
                  >
                    {idea.title}
                  </Typography>
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {idea.daysSinceUpdate}d &middot; {idea.voteCount} vote
                    {idea.voteCount !== 1 ? "s" : ""}
                  </Typography>
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      {/* AI Insights (issue #730) */}
      <AIInsightsCard organizationId={organizationId} navigate={navigate} />

      {/* Overview Metrics */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Overview
      </Typography>
      <Box sx={{ maxWidth: "lg", mx: "auto" }}>
        <Grid container spacing={2} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              icon={TrendingUp}
              title="Total ideas"
              value={summary.totalIdeas}
              subtitle={`${summary.wouldSpendOwnMoney} high-confidence`}
              color={primaryColor}
              trend={summary.trends?.totalIdeas}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              icon={People}
              title="Active users"
              value={summary.activeUsers}
              subtitle={`of ${summary.totalUsers} total users`}
              color={primaryColor}
              trend={summary.trends?.activeUsers}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              icon={CheckCircle}
              title="Completion"
              value={`${summary.completionRate}%`}
              subtitle="Approved or completed"
              color={primaryColor}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <StatCard
              icon={Schedule}
              title="Avg resolution"
              value={`${summary.avgTimeToResolution}d`}
              subtitle="Days to complete"
              color={primaryColor}
            />
          </Grid>
        </Grid>
      </Box>

      {/* Engagement Metrics */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Engagement
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Comment sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {summary.totalComments}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Total comments
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {summary.avgCommentsPerIdea} avg per idea
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <ThumbUp sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {summary.totalVotes}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Total votes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {summary.avgVotesPerIdea} avg per idea
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <AttachMoney sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {summary.wouldSpendOwnMoney}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                High confidence
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Users willing to invest
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Visibility sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {summary.publicIdeas} / {summary.privateIdeas}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Public / private
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Visibility split
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Time Saved Metrics */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Time Saved
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <Timer sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {formatTimeSaved(summary.potentialTimeSaved)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Potential time saved
              </Typography>
              <Typography variant="body2" color="text.secondary">
                From incomplete ideas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: "100%" }}>
            <CardContent sx={{ textAlign: "center" }}>
              <CheckCircleOutlined sx={{ fontSize: 36, color: primaryColor, mb: 2 }} />
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
                {formatTimeSaved(summary.actualTimeSaved)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
                Actual time saved
              </Typography>
              <Typography variant="body2" color="text.secondary">
                From completed ideas
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts Section */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Trends & Distribution
      </Typography>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {/* Ideas Over Time */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, minHeight: 400 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Submission Trend (Last 30 Days)
              </Typography>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={timelineData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="ideas" stroke={primaryColor} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Ideas by Status */}
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, minHeight: 400 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Ideas by Status
              </Typography>
              <ResponsiveContainer width="100%" height={330}>
                <BarChart data={statusData} margin={{ top: 20, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="status"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tick={(props) => {
                      const { x, y, payload } = props;
                      const status = payload.value;
                      const color = getStatusColor(status);
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <text
                            x={0}
                            y={0}
                            textAnchor="end"
                            fill="#666"
                            transform="rotate(-45)"
                            style={{ fontSize: "0.75rem" }}
                          >
                            <tspan fill={color} style={{ fontSize: "1.2em" }}>
                              ●{" "}
                            </tspan>
                            {status}
                          </text>
                        </g>
                      );
                    }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count">
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getStatusColor(entry.status)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Ideas by Category - Bar Chart */}
        {categoryData.length > 0 && (
          <Grid size={{ xs: 12 }}>
            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                  Ideas by Category
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Distribution of ideas across different categories
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="category"
                      angle={-45}
                      textAnchor="end"
                      height={100}
                      tick={(props) => {
                        const { x, y, payload } = props;
                        const dataItem = categoryData.find((d) => d.category === payload.value);
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <MuiTooltip
                              title={
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {dataItem?.fullCategory || payload.value}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {dataItem?.count} idea{dataItem?.count !== 1 ? "s" : ""}
                                  </Typography>
                                </Box>
                              }
                              placement="top"
                              arrow
                              PopperProps={{
                                sx: {
                                  "& .MuiTooltip-tooltip": {
                                    transition: "none !important",
                                    animation: "none !important",
                                  },
                                },
                              }}
                            >
                              <text
                                x={0}
                                y={0}
                                textAnchor="end"
                                fill="#666"
                                transform="rotate(-45)"
                                style={{ fontSize: "0.75rem", cursor: "help" }}
                              >
                                {payload.value}
                              </text>
                            </MuiTooltip>
                          </g>
                        );
                      }}
                    />
                    <YAxis allowDecimals={false} />
                    <Bar dataKey="count" fill={primaryColor} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>

      {/* Top Performers */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: "text.primary" }}>
        Top Performers
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Top Ideas by Votes
              </Typography>
              {topIdeasByVotes.slice(0, 5).map((idea, index) => (
                <Box key={idea.id} sx={{ mb: 2 }}>
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: { xs: "column", sm: "row" },
                      justifyContent: "space-between",
                      alignItems: { xs: "flex-start", sm: "center" },
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1, minWidth: 0 }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: "text.secondary",
                          fontWeight: 700,
                          minWidth: 30,
                          flexShrink: 0,
                        }}
                      >
                        #{index + 1}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          display: "-webkit-box",
                          WebkitLineClamp: { xs: 2, sm: 1 },
                          WebkitBoxOrient: "vertical",
                          wordBreak: "break-word",
                        }}
                      >
                        {idea.title}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${idea.voteCount} votes`}
                      size="small"
                      sx={{
                        bgcolor: primaryColor,
                        color: "white",
                        flexShrink: 0,
                        ml: { xs: 4.5, sm: 0 },
                      }}
                    />
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, ml: 4.5, flexWrap: "wrap" }}>
                    <Chip
                      label={idea.status}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: primaryColor, color: primaryColor }}
                    />
                    <Chip
                      label={idea.category}
                      size="small"
                      variant="outlined"
                      sx={{ borderColor: primaryColor, color: primaryColor }}
                    />
                  </Box>
                  {index < 4 && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Most Active Contributors
              </Typography>
              {userEngagement.slice(0, 5).map((user, index) => (
                <Box key={user.id} sx={{ mb: 2 }}>
                  <Box
                    sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: "text.secondary", fontWeight: 700, minWidth: 30 }}
                      >
                        #{index + 1}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {user.username}
                      </Typography>
                    </Box>
                    <Chip
                      label={`${user.ideaCount} ideas`}
                      size="small"
                      sx={{ bgcolor: primaryColor, color: "white" }}
                    />
                  </Box>
                  {index < 4 && <Divider sx={{ mt: 2 }} />}
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default OverviewTab;
