import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import useOrganizationId from "../hooks/useOrganizationId";
import { orgPath } from "../utils/orgPath";
import IdeaList from "./IdeaList";
import { useIdeasPage } from "../hooks/useIdeasPage";
import { useOrgAccessGuard } from "../hooks/useOrgAccessGuard";
import { usePageTitle } from "../hooks/usePageTitle";
import { useAuth } from "../auth";
import EmptyState from "./EmptyState";
import { usePersonalChangelog } from "../hooks/usePersonalChangelog";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import { LightbulbOutlined } from "@mui/icons-material";

function matchesQuadrant(idea, quadrant) {
  if (!quadrant) return true;
  const impact = idea.impactScore || 5;
  const effort = idea.effortScore || 5;
  switch (quadrant) {
    case "quick-wins":
      return impact > 5.5 && effort <= 5.5;
    case "strategic":
      return impact > 5.5 && effort > 5.5;
    case "fill-ins":
      return impact <= 5.5 && effort <= 5.5;
    case "thankless-tasks":
      return impact <= 5.5 && effort > 5.5;
    default:
      return true;
  }
}

const QUADRANT_INFO = {
  "quick-wins": { name: "Quick Wins", color: "#4caf50", desc: "High impact, low effort" },
  strategic: { name: "Strategic", color: "#2196f3", desc: "High impact, high effort" },
  "fill-ins": { name: "Fill-ins", color: "#ff9800", desc: "Low impact, low effort" },
  "thankless-tasks": { name: "Thankless Tasks", color: "#f44336", desc: "Low impact, high effort" },
};

const DEFAULT_FILTERS = { sort: "trending", status: "all", category: "all", showMyIdeas: false };

function filtersFromSearch(search) {
  const params = new URLSearchParams(search);
  return {
    ...DEFAULT_FILTERS,
    category: params.get("category") || DEFAULT_FILTERS.category,
    search: params.get("search") || "",
  };
}

export default function ReviewIdeas() {
  useOrgAccessGuard();
  usePageTitle("Review Ideas");

  const navigate = useNavigate();
  const organizationId = useOrganizationId();
  const location = useLocation();
  const [refresh, setRefresh] = useState(0);
  const { user } = useAuth();
  const { count: changelogCount, dismiss: dismissChangelog } = usePersonalChangelog();

  const quadrantFilter = new URLSearchParams(location.search).get("quadrant");

  const [activeFilters, setActiveFilters] = useState(() => filtersFromSearch(location.search));

  useEffect(() => {
    setActiveFilters(filtersFromSearch(location.search));
  }, [location.search]);

  const { items, hasMore, total, loading, isLoadingMore, error, loadMore } = useIdeasPage({
    ...activeFilters,
    refresh,
    quadrant: quadrantFilter || undefined,
  });

  const displayedIdeas = items;

  const quadrantInfo = quadrantFilter ? QUADRANT_INFO[quadrantFilter] : null;

  return (
    <Container
      maxWidth="md"
      component="main"
      sx={{ pt: { xs: 2, sm: 2 }, pb: { xs: 4, sm: 6 }, px: { xs: 2, sm: 3 } }}
    >
      <Box mb={{ xs: 1, sm: 2 }} textAlign="center">
        <Typography
          variant="h1"
          component="h1"
          sx={{ color: "text.primary", mb: { xs: 1.5, sm: 2 } }}
        >
          Review Ideas
        </Typography>
        <Typography
          variant="body1"
          sx={{
            fontSize: { xs: "0.875rem", sm: "1rem" },
            color: "text.secondary",
            mb: { xs: 0.5, sm: 2 },
          }}
        >
          Explore and vote on innovative ideas from your team
        </Typography>
        {quadrantInfo && (
          <Box
            sx={{ display: "flex", justifyContent: "center", gap: 1, mt: 2, alignItems: "center" }}
          >
            <Chip
              label={`${quadrantInfo.name}: ${quadrantInfo.desc}`}
              sx={{ bgcolor: quadrantInfo.color, color: "white", fontWeight: 600 }}
              onDelete={() => navigate(orgPath(organizationId, "review"))}
            />
          </Box>
        )}
      </Box>

      {/* Issue #521: personal changelog banner */}
      {changelogCount > 0 && (
        <Box mb={2} aria-live="polite">
          <Alert severity="info" onClose={dismissChangelog} data-testid="changelog-banner">
            {changelogCount === 1
              ? "1 new idea since your last visit"
              : `${changelogCount} new ideas since your last visit`}
          </Alert>
        </Box>
      )}

      {error && (
        <Box mb={3} aria-live="assertive">
          <Alert severity="error">{error}</Alert>
        </Box>
      )}
      {displayedIdeas.length > 0 || loading ? (
        <section aria-label="Ideas List">
          <IdeaList
            ideas={displayedIdeas}
            refresh={refresh}
            onRefresh={() => setRefresh((r) => r + 1)}
            loading={loading}
            hasMore={hasMore && !quadrantFilter}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            totalCount={quadrantFilter ? undefined : total}
            externalFilters={activeFilters}
            onFiltersChange={setActiveFilters}
          />
        </section>
      ) : (
        <Box data-testid="no-ideas-message">
          <EmptyState
            icon={LightbulbOutlined}
            title="No ideas yet"
            description="Be the first to submit an idea and get the conversation started."
            primaryAction={{
              label: "Submit the first idea",
              onClick: () => navigate(orgPath(organizationId, "submit")),
            }}
            secondaryAction={
              user?.isAdmin
                ? {
                    label: "Invite your team",
                    onClick: () => navigate(orgPath(organizationId, "admin")),
                  }
                : undefined
            }
          />
        </Box>
      )}
    </Container>
  );
}
