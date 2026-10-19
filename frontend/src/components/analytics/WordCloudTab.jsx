import React, { useContext } from "react";
import { SettingsContext } from "../../contexts";
import { INFO_TIP_STYLE } from "../../muiTheme";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { Lightbulb } from "@mui/icons-material";
import D3WordCloud from "./D3WordCloud";
import { orgPath } from "../../utils/orgPath";

const WordCloudTab = ({ data, organizationId, navigate }) => {
  const { primaryColor: contextPrimaryColor } = useContext(SettingsContext);
  const primaryColor = contextPrimaryColor || "#1976d2";

  const handleWordClick = (word) => {
    if (!navigate || !organizationId || !word?.text || word.text === "No data") return;
    const params = new URLSearchParams();
    const categories = Array.isArray(word.categories) ? word.categories : [];

    if (categories.length === 1) {
      params.set("category", categories[0]);
    } else {
      params.set("search", word.text);
    }

    navigate(`${orgPath(organizationId, "review")}?${params.toString()}`);
  };

  return (
    <>
      <Card variant="outlined" sx={{ borderRadius: 2, mb: 4 }}>
        <CardContent>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            Idea Keywords
          </Typography>

          {/* How to read Info Tip */}
          <Box
            sx={{ ...INFO_TIP_STYLE, borderLeft: `4px solid ${primaryColor}`, ml: "35px", mb: 2 }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Lightbulb sx={{ color: primaryColor, fontSize: 20, mt: 0.25 }} />
              <Typography variant="body2" color="text.primary">
                <strong>How to read:</strong> Word size represents frequency. Larger words appear
                more often in idea titles and descriptions.
              </Typography>
            </Box>
          </Box>

          {/* How to use Info Tip */}
          <Box
            sx={{ ...INFO_TIP_STYLE, borderLeft: `4px solid ${primaryColor}`, ml: "35px", mb: 2 }}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
              <Lightbulb sx={{ color: primaryColor, fontSize: 20, mt: 0.25 }} />
              <Typography variant="body2" color="text.primary">
                <strong>How to use:</strong> Common keywords signal what your team is naturally
                striving for. Consider adopting them into your company values or strategic focus
                areas.
              </Typography>
            </Box>
          </Box>

          <Box
            sx={{
              width: "100%",
              height: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "#f5f5f5",
              borderRadius: 2,
            }}
          >
            {(() => {
              try {
                // Extract words from idea titles, descriptions, and categories
                const wordCounts = new Map();
                const wordCategories = new Map();
                const stopWords = new Set([
                  "the",
                  "a",
                  "an",
                  "and",
                  "or",
                  "but",
                  "in",
                  "on",
                  "at",
                  "to",
                  "for",
                  "of",
                  "with",
                  "by",
                  "from",
                  "as",
                  "is",
                  "was",
                  "are",
                  "be",
                  "have",
                  "has",
                  "had",
                  "do",
                  "does",
                  "did",
                  "will",
                  "would",
                  "should",
                  "could",
                  "can",
                  "may",
                  "might",
                  "must",
                  "this",
                  "that",
                  "these",
                  "those",
                  "it",
                  "its",
                  "i",
                  "we",
                  "you",
                  "they",
                  "them",
                  "their",
                  "our",
                  "your",
                ]);

                // Process all ideas from categories
                if (data && data.ideasByCategory && data.ideasByCategory.length > 0) {
                  data.ideasByCategory.forEach((cat) => {
                    const category = cat.category.toLowerCase();
                    // Split category into words
                    const catWords = category.split(/[\s\-&]+/);
                    catWords.forEach((word) => {
                      if (word.length > 3 && !stopWords.has(word)) {
                        wordCounts.set(word, (wordCounts.get(word) || 0) + parseInt(cat.count));
                        if (!wordCategories.has(word)) wordCategories.set(word, new Set());
                        wordCategories.get(word).add(cat.category);
                      }
                    });
                  });
                }

                // Convert to array and sort by count
                const wordArray = Array.from(wordCounts.entries())
                  .map(([text, value]) => ({
                    text,
                    value,
                    categories: Array.from(wordCategories.get(text) || []),
                  }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 50); // Top 50 words

                const words = wordArray.length > 0 ? wordArray : [{ text: "No data", value: 1 }];
                const cloudColors = [
                  primaryColor || "#1976d2",
                  "#4caf50",
                  "#2196f3",
                  "#ff9800",
                  "#f44336",
                  "#9c27b0",
                  "#00bcd4",
                ];

                return (
                  <D3WordCloud
                    words={words}
                    width={800}
                    height={600}
                    colors={cloudColors}
                    onWordClick={handleWordClick}
                  />
                );
              } catch (error) {
                console.error("Word cloud error:", error);
                return (
                  <Box sx={{ textAlign: "center", p: 4 }}>
                    <Typography variant="h6" color="text.secondary">
                      Unable to display word cloud
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {error.message || "An error occurred while rendering the visualisation"}
                    </Typography>
                  </Box>
                );
              }
            })()}
          </Box>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", textAlign: "center", mt: 2 }}
          >
            Based on {data.summary.totalIdeas} ideas across {data.ideasByCategory.length} categories
          </Typography>
        </CardContent>
      </Card>
    </>
  );
};

export default WordCloudTab;
