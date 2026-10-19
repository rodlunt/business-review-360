import { useSearchParams } from "react-router-dom";
import { Box, Container, Paper, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import StarIcon from "@mui/icons-material/Star";
import { usePageTitle } from "../hooks/usePageTitle";

export default function FeedbackThanksPage() {
  usePageTitle("Thanks for your feedback");

  const [searchParams] = useSearchParams();
  const rating = parseInt(searchParams.get("rating"), 10);
  const already = searchParams.get("already") === "true";

  return (
    <Container maxWidth="sm" sx={{ py: 10 }}>
      <Paper variant="outlined" sx={{ p: 5, textAlign: "center" }}>
        <CheckCircleIcon sx={{ fontSize: 56, color: "success.main", mb: 2 }} />

        <Typography variant="h5" fontWeight={700} mb={1}>
          {already ? "Already recorded" : "Thank you!"}
        </Typography>

        {already ? (
          <Typography variant="body1" color="text.secondary">
            We already have your response for this survey. Thanks for taking the time.
          </Typography>
        ) : (
          <>
            {rating >= 1 && rating <= 5 && (
              <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, mb: 2 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <StarIcon
                    key={n}
                    sx={{ color: n <= rating ? "warning.main" : "action.disabled", fontSize: 28 }}
                  />
                ))}
              </Box>
            )}
            <Typography variant="body1" color="text.secondary">
              Your feedback has been recorded. We read every response and use it to keep improving
              Business Review 360.
            </Typography>
          </>
        )}
      </Paper>
    </Container>
  );
}
