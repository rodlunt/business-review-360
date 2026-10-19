import React, { useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { CheckCircle, RadioButtonUnchecked, Close } from "@mui/icons-material";

const DISMISS_KEY = (orgId) => `br360_setup_checklist_dismissed_${orgId}`;

export default function SetupChecklist({ organizationId, summary, ideasByCategory, logoUrl }) {
  const [dismissed, setDismissed] = useState(
    () => !!localStorage.getItem(DISMISS_KEY(organizationId))
  );

  const steps = [
    { label: "Upload your logo", done: !!logoUrl },
    { label: "Define at least 3 categories", done: (ideasByCategory?.length ?? 0) >= 3 },
    { label: "Invite at least one team member", done: (summary?.totalUsers ?? 0) > 1 },
    { label: "Submit your first idea", done: (summary?.totalIdeas ?? 0) > 0 },
    { label: "Cast your first vote", done: (summary?.totalVotes ?? 0) > 0 },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = Math.round((completed / steps.length) * 100);

  if (dismissed || pct === 100) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY(organizationId), "1");
    setDismissed(true);
  };

  return (
    <Card variant="outlined" sx={{ mb: 3 }} data-testid="setup-checklist">
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Getting started ({completed}/{steps.length})
          </Typography>
          <IconButton size="small" onClick={handleDismiss} aria-label="Dismiss setup checklist">
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{ mb: 2, borderRadius: 1, height: 6 }}
        />
        <List dense disablePadding>
          {steps.map((step) => (
            <ListItem key={step.label} disableGutters sx={{ py: 0.25 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                {step.done ? (
                  <CheckCircle fontSize="small" color="success" />
                ) : (
                  <RadioButtonUnchecked fontSize="small" color="disabled" />
                )}
              </ListItemIcon>
              <ListItemText
                primary={step.label}
                primaryTypographyProps={{
                  variant: "body2",
                  color: step.done ? "text.secondary" : "text.primary",
                  sx: { textDecoration: step.done ? "line-through" : "none" },
                }}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
