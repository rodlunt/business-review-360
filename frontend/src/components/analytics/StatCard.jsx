import React from "react";
import { Box, Card, CardContent, Typography, Chip } from "@mui/material";

const StatCard = ({ icon: Icon, title, value, subtitle, color, trend }) => (
  <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
    <CardContent sx={{ textAlign: "center" }}>
      <Icon sx={{ color: color, fontSize: 36, mb: 2 }} />
      <Typography variant="h4" sx={{ fontWeight: 700, color: "text.primary", mb: 1 }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {subtitle}
      </Typography>
      {trend && trend.pct !== null && (
        <Box sx={{ mt: 1 }}>
          <Chip
            size="small"
            label={`${trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→"} ${Math.abs(trend.pct)}% vs prior 30d`}
            sx={{
              bgcolor:
                trend.direction === "up"
                  ? "success.light"
                  : trend.direction === "down"
                    ? "error.light"
                    : "action.hover",
              color:
                trend.direction === "up"
                  ? "success.dark"
                  : trend.direction === "down"
                    ? "error.dark"
                    : "text.secondary",
              fontWeight: 600,
              fontSize: "0.7rem",
            }}
          />
        </Box>
      )}
    </CardContent>
  </Card>
);

export default StatCard;
