import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Typography,
} from "@mui/material";
import {
  ArrowDownward,
  ArrowUpward,
  AutoAwesome,
  Refresh,
  Settings,
  Warning,
} from "@mui/icons-material";
import { api } from "../../api";
import { orgPath } from "../../utils/orgPath";

function MovementChip({ movement }) {
  const isDown = movement.direction === "down";
  const isStuck = movement.pct === null;
  const Icon = isStuck ? Warning : isDown ? ArrowDownward : ArrowUpward;
  const label =
    movement.note ??
    (isStuck
      ? `${movement.kpi} stuck`
      : `${movement.kpi} ${isDown ? "↓" : "↑"} ${Math.abs(movement.pct)}%`);
  return (
    <Chip
      size="small"
      icon={<Icon sx={{ fontSize: "0.8rem !important" }} />}
      label={label}
      sx={{
        bgcolor: isDown || isStuck ? "error.light" : "success.light",
        color: isDown || isStuck ? "error.dark" : "success.dark",
        fontWeight: 600,
        fontSize: "0.7rem",
        "& .MuiChip-icon": { color: "inherit" },
      }}
    />
  );
}

export default function AIInsightsCard({ organizationId, navigate }) {
  const [state, setState] = useState("idle"); // idle | loading | ready | error | unconfigured
  const [data, setData] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleGenerate = async () => {
    setState("loading");
    setErrorMsg("");
    try {
      const res = await api.get("/analytics/ai-insights");
      if (!res.data.enabled) {
        setState("unconfigured");
        return;
      }
      setData(res.data);
      setState("ready");
    } catch (err) {
      setErrorMsg(
        err.response?.data?.error ??
          "Failed to generate insights. Check that AI is configured in Admin Settings."
      );
      setState("error");
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2, mb: 3, borderColor: "primary.light" }}>
      <CardContent>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: state === "idle" ? 0 : 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <AutoAwesome sx={{ color: "primary.main", fontSize: 20 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              AI Insights
            </Typography>
            <Chip
              size="small"
              label="Beta"
              color="primary"
              variant="outlined"
              sx={{ fontSize: "0.65rem" }}
            />
          </Box>
          {state === "idle" && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AutoAwesome />}
              onClick={handleGenerate}
            >
              Generate insights
            </Button>
          )}
          {state === "ready" && (
            <Button size="small" variant="text" startIcon={<Refresh />} onClick={handleGenerate}>
              Refresh
            </Button>
          )}
        </Box>

        {state === "loading" && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 1 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Analysing your data...
            </Typography>
          </Box>
        )}

        {state === "error" && (
          <Alert severity="error" onClose={() => setState("idle")}>
            {errorMsg}
          </Alert>
        )}

        {state === "unconfigured" && (
          <Alert
            severity="info"
            action={
              <Button
                size="small"
                color="inherit"
                startIcon={<Settings />}
                onClick={() => navigate(orgPath(organizationId, "admin"))}
              >
                Configure
              </Button>
            }
          >
            AI is not enabled for this organisation. Configure it in Admin Settings to unlock
            insights.
          </Alert>
        )}

        {state === "ready" && data && (
          <>
            <Typography variant="body2" sx={{ lineHeight: 1.7, color: "text.primary" }}>
              {data.commentary.replace(/[—–]/g, " - ")}
            </Typography>

            {data.notableMovements?.length > 0 && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Notable:
                  </Typography>
                  {data.notableMovements.map((m) => (
                    <MovementChip key={`${m.kpi}-${m.direction}`} movement={m} />
                  ))}
                </Box>
              </>
            )}

            <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 1.5 }}>
              Generated{" "}
              {new Date(data.generatedAt).toLocaleTimeString("en-AU", {
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              via {data.provider}
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
