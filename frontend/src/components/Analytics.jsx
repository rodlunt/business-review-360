import React, { useEffect, useState, useContext } from "react";
import { SettingsContext } from "../contexts";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { usePageTitle } from "../hooks/usePageTitle";
import { useNavigate, useLocation } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import { useAuth } from "../auth";
import { PAGE_TITLE_STYLE } from "../muiTheme";
import {
  Box,
  Alert,
  CircularProgress,
  Container,
  Tabs,
  Tab,
  Button,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Calculate,
  Dashboard as DashboardIcon,
  GridOn,
  Cloud as CloudIcon,
  Assessment,
  BarChartOutlined,
  Poll,
} from "@mui/icons-material";
import EmptyState from "./EmptyState";
import useAnalyticsData from "./analytics/useAnalyticsData";
import OverviewTab from "./analytics/OverviewTab";
import PriorityMatrixTab from "./analytics/PriorityMatrixTab";
import WordCloudTab from "./analytics/WordCloudTab";
import RoiCalculatorDialog from "./analytics/RoiCalculatorDialog";

export default function Analytics() {
  // SECURITY: Validate user can only access their own org
  useOrgAccessGuard();

  const { loading: authLoading } = useAuth();
  const organizationId = useOrganizationId();
  const { primaryColor: contextPrimaryColor } = useContext(SettingsContext);
  const navigate = useNavigate();
  const location = useLocation();

  const { data, matrixData, loading, error, fetchAnalyticsData, fetchMatrixData } =
    useAnalyticsData();

  const [currentTab, setCurrentTab] = useState(0);
  const [roiDialogOpen, setRoiDialogOpen] = useState(false);

  // Issue #626: page-owned document.title. Analytics hosts three sub-views
  // selected by URL (priority-matrix, word-cloud, or the default summary).
  const analyticsPageTitle = location.pathname.includes("priority-matrix")
    ? "Priority Matrix"
    : location.pathname.includes("word-cloud")
      ? "Word Cloud"
      : "Analytics";
  usePageTitle(analyticsPageTitle);

  useEffect(() => {
    // Wait for auth to be ready before making API calls
    if (authLoading) return;
    fetchAnalyticsData();
    fetchMatrixData();
  }, [authLoading]);

  // Switch to appropriate tab based on URL
  useEffect(() => {
    if (location.pathname.includes("priority-matrix")) {
      setCurrentTab(1);
    } else if (location.pathname.includes("word-cloud")) {
      setCurrentTab(2);
    } else if (location.pathname.includes("board-report")) {
      setCurrentTab(3);
    } else if (location.pathname.includes("surveys")) {
      setCurrentTab(4);
    }
  }, [location.pathname, matrixData]);

  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
    // Update URL when switching tabs
    if (newValue === 1) {
      navigate(orgPath(organizationId, "analytics/priority-matrix"));
    } else if (newValue === 2) {
      navigate(orgPath(organizationId, "analytics/word-cloud"));
    } else if (newValue === 3) {
      navigate(orgPath(organizationId, "analytics/board-report"));
    } else if (newValue === 4) {
      navigate(orgPath(organizationId, "analytics/surveys"));
    } else {
      navigate(orgPath(organizationId, "analytics"));
    }
  };

  if (loading) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}
      >
        <CircularProgress sx={{ color: contextPrimaryColor || "#1976d2" }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ maxWidth: 1200, mx: "auto", p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!data) return null;

  const { summary, ideasByCategory } = data;

  if (summary?.totalIdeas === 0) {
    return (
      <Container maxWidth="md" sx={{ pt: 4 }} data-testid="analytics-empty-state">
        <EmptyState
          icon={BarChartOutlined}
          title="No data to analyse yet"
          description="Submit your first idea to start seeing analytics about your team's engagement and ideas."
          primaryAction={{
            label: "Submit an idea",
            onClick: () => navigate(orgPath(organizationId, "submit")),
          }}
        />
      </Container>
    );
  }

  return (
    <Container
      maxWidth="lg"
      component="main"
      sx={{ pt: { xs: 3, sm: 4 }, pb: { xs: 2, sm: 4 }, px: { xs: 2, sm: 3 } }}
    >
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBack />}
          onClick={() => navigate(orgPath(organizationId, "home"))}
          size="small"
          sx={{ textTransform: "none", fontWeight: 500 }}
        >
          Back to Ideas
        </Button>
      </Box>

      {/* Header */}
      <Box mb={{ xs: 1.5, sm: 3 }} textAlign="center">
        <Typography {...PAGE_TITLE_STYLE}>Analytics Dashboard</Typography>
        <Typography
          variant="body1"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            color: "text.secondary",
            mb: { xs: 0.5, sm: 2 },
          }}
        >
          Kaizen-style continuous improvement metrics
        </Typography>
      </Box>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            justifyContent: "space-between",
            alignItems: { xs: "stretch", sm: "flex-end" },
            gap: 1,
          }}
        >
          <Tabs
            value={currentTab}
            onChange={handleTabChange}
            aria-label="analytics tabs"
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab icon={<DashboardIcon />} label="Overview" iconPosition="start" />
            <Tab icon={<GridOn />} label="Priority Matrix" iconPosition="start" />
            <Tab icon={<CloudIcon />} label="Word Cloud" iconPosition="start" />
            <Tab icon={<Assessment />} label="Board Report" iconPosition="start" />
            <Tab icon={<Poll />} label="Surveys" iconPosition="start" />
          </Tabs>
          <Button
            variant="contained"
            startIcon={<Calculate />}
            onClick={() => setRoiDialogOpen(true)}
            sx={{ mb: 1, alignSelf: { xs: "flex-start", sm: "flex-end" } }}
          >
            ROI Calculator
          </Button>
        </Box>
      </Box>

      {/* Tab Panel 0: Overview */}
      {currentTab === 0 && (
        <OverviewTab data={data} organizationId={organizationId} navigate={navigate} />
      )}

      {/* Tab Panel 1: Priority Matrix */}
      {currentTab === 1 &&
        (matrixData ? (
          <PriorityMatrixTab
            matrixData={matrixData}
            organizationId={organizationId}
            navigate={navigate}
          />
        ) : null)}

      {/* Tab Panel 2: Word Cloud */}
      {currentTab === 2 &&
        (data ? (
          <WordCloudTab data={data} organizationId={organizationId} navigate={navigate} />
        ) : null)}

      <RoiCalculatorDialog open={roiDialogOpen} onClose={() => setRoiDialogOpen(false)} />
    </Container>
  );
}
