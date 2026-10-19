import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        minHeight: 280,
        gap: 2,
        px: 3,
        pb: { xs: 4, sm: 6 },
      }}
      aria-live="polite"
      data-testid="empty-state"
    >
      {Icon && (
        <Box
          sx={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            bgcolor: "primary.main",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.12,
            position: "relative",
          }}
        >
          <Icon
            sx={{
              fontSize: 36,
              color: "primary.main",
              opacity: 1 / 0.12,
              position: "absolute",
            }}
          />
        </Box>
      )}
      <Box sx={{ mt: Icon ? -1 : 0 }}>
        <Typography variant="h6" color="text.primary" fontWeight={600} gutterBottom>
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: "auto" }}>
            {description}
          </Typography>
        )}
      </Box>
      <Box display="flex" flexDirection={{ xs: "column", sm: "row" }} gap={1.5} mt={1}>
        {primaryAction && (
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={primaryAction.onClick}
            data-testid="empty-state-primary"
          >
            {primaryAction.label}
          </Button>
        )}
        {secondaryAction && (
          <Button
            variant="outlined"
            color="primary"
            size="large"
            onClick={secondaryAction.onClick}
            data-testid="empty-state-secondary"
          >
            {secondaryAction.label}
          </Button>
        )}
      </Box>
    </Box>
  );
}
