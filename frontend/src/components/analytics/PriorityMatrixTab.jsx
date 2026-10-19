import React, { useState, useRef, useContext, useEffect } from "react";
import { SettingsContext } from "../../contexts";
import { INFO_TIP_STYLE } from "../../muiTheme";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Alert,
  Chip,
  Divider,
  Paper,
  Button,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { TrendingUp, Lightbulb, Speed, Build } from "@mui/icons-material";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { orgPath } from "../../utils/orgPath";

const PriorityMatrixTab = ({ matrixData, organizationId, navigate }) => {
  const { primaryColor: contextPrimaryColor } = useContext(SettingsContext);
  const primaryColor = contextPrimaryColor || "#1976d2";
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const chartHeight = isMobile ? 500 : 650;
  const chartMargin = isMobile
    ? { top: 16, right: 8, bottom: 72, left: 52 }
    : { top: 20, right: 20, bottom: 100, left: 80 };

  const [matrixZoom, setMatrixZoom] = useState({ xDomain: [0, 11], yDomain: [0, 11] });
  const [hoverCard, setHoverCard] = useState(null);
  const [hoveredIdeaId, setHoveredIdeaId] = useState(null);
  const priorityMatrixRef = useRef(null);
  const chartContainerRef = useRef(null);
  const hoverTimeoutRef = useRef(null);
  const cardRef = useRef(null);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const getQuadrantColor = (x, y) => {
    if (y > 5.5 && x <= 5.5) return "#4caf50";
    else if (y > 5.5 && x > 5.5) return "#2196f3";
    else if (y <= 5.5 && x <= 5.5) return "#ff9800";
    else return "#f44336";
  };

  const buildCoordinateMap = (ideas) => {
    const coordinateMap = new Map();
    ideas.forEach((idea) => {
      const x = idea.effortScore || 5;
      const y = idea.impactScore || 5;
      const key = `${x},${y}`;
      const ideaData = {
        x,
        y,
        id: idea.id,
        slug: idea.slug,
        title: idea.title,
        status: idea.status,
        category: idea.category,
        voteCount: parseInt(idea.voteCount) || 0,
      };
      if (coordinateMap.has(key)) {
        const existing = coordinateMap.get(key);
        existing.ideas.push(ideaData);
        existing.count++;
        existing.totalVotes += ideaData.voteCount;
      } else {
        coordinateMap.set(key, {
          ...ideaData,
          ideas: [ideaData],
          count: 1,
          totalVotes: ideaData.voteCount,
        });
      }
    });
    return coordinateMap;
  };

  const findHoveredPoint = (mouseX, mouseY, chartWidth) => {
    if (!matrixData || !matrixData.ideas) return null;
    const containerHeight = chartHeight;
    const plotWidth = chartWidth - chartMargin.left - chartMargin.right;
    const plotHeight = containerHeight - chartMargin.top - chartMargin.bottom;
    const plotX = mouseX - chartMargin.left;
    const plotY = mouseY - chartMargin.top;
    if (plotX < 0 || plotX > plotWidth || plotY < 0 || plotY > plotHeight) return null;
    const xRange = matrixZoom.xDomain[1] - matrixZoom.xDomain[0];
    const yRange = matrixZoom.yDomain[1] - matrixZoom.yDomain[0];
    const dataX = (plotX / plotWidth) * xRange + matrixZoom.xDomain[0];
    const dataY = matrixZoom.yDomain[1] - (plotY / plotHeight) * yRange;
    const coordinateMap = buildCoordinateMap(matrixData.ideas);
    const threshold = 0.8;
    let closestPoint = null;
    let closestDistance = Infinity;
    coordinateMap.forEach((point) => {
      const distance = Math.sqrt(Math.pow(point.x - dataX, 2) + Math.pow(point.y - dataY, 2));
      if (distance < threshold && distance < closestDistance) {
        closestDistance = distance;
        closestPoint = point;
      }
    });
    return closestPoint;
  };

  const handleDotHover = (data, event) => {
    if (!data) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const ideas = data.ideas || [data];
    let position = { top: 50, left: "50%" };
    if (chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect();
      const containerHeight = chartHeight;
      const plotWidth = rect.width - chartMargin.left - chartMargin.right;
      const plotHeight = containerHeight - chartMargin.top - chartMargin.bottom;
      const xRange = matrixZoom.xDomain[1] - matrixZoom.xDomain[0];
      const yRange = matrixZoom.yDomain[1] - matrixZoom.yDomain[0];
      const dotPixelX = chartMargin.left + ((data.x - matrixZoom.xDomain[0]) / xRange) * plotWidth;
      const dotPixelY = chartMargin.top + ((matrixZoom.yDomain[1] - data.y) / yRange) * plotHeight;
      const cardWidth = 350;
      const cardHeight = 400;
      let left = dotPixelX;
      let top = dotPixelY;
      if (left + cardWidth > rect.width) left = dotPixelX - cardWidth;
      if (top + cardHeight > containerHeight) top = dotPixelY - cardHeight;
      if (left < 0) left = 0;
      if (top < 0) top = 0;
      position = { top, left };
    }
    setHoverCard({ ideas, x: data.x, y: data.y, position });
    setHoveredIdeaId(null);
  };

  const handleDotLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverCard(null);
      setHoveredIdeaId(null);
    }, 500);
  };

  const handleChartMouseMove = (event) => {
    if (!chartContainerRef.current) return;
    const isOverCard =
      hoverCard &&
      cardRef.current &&
      (() => {
        const cardRect = cardRef.current.getBoundingClientRect();
        return (
          event.clientX >= cardRect.left &&
          event.clientX <= cardRect.right &&
          event.clientY >= cardRect.top &&
          event.clientY <= cardRect.bottom
        );
      })();
    if (isOverCard) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      return;
    }
    const rect = chartContainerRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const hoveredPoint = findHoveredPoint(mouseX, mouseY, rect.width);
    if (hoveredPoint) {
      const currentKey = hoverCard ? `${hoverCard.x},${hoverCard.y}` : null;
      const newKey = `${hoveredPoint.x},${hoveredPoint.y}`;
      if (currentKey !== newKey) {
        handleDotHover(hoveredPoint, event);
      } else if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    } else if (hoverCard && !hoverTimeoutRef.current) {
      handleDotLeave();
    }
  };

  const handleCardEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleCardLeave = () => {
    handleDotLeave();
  };

  const handleIdeaClick = (slug) => {
    navigate(orgPath(organizationId, `idea/${slug}`));
  };

  const handleDotClick = (data) => {
    const ideas = data.ideas || [data];
    if (ideas.length === 1) {
      navigate(orgPath(organizationId, `idea/${data.slug}`));
    }
  };

  const handleMatrixZoomReset = () => setMatrixZoom({ xDomain: [0, 11], yDomain: [0, 11] });

  if (!matrixData) return null;

  const scatterData = matrixData.ideas
    ? Array.from(buildCoordinateMap(matrixData.ideas).values())
    : [];

  return (
    <>
      <Grid container spacing={2} sx={{ mb: 4 }}>
        {[
          {
            label: "Quick Wins",
            key: "Quick Wins",
            color: "#4caf50",
            quadrant: "quick-wins",
            Icon: Speed,
            caption: "High impact, low effort",
          },
          {
            label: "Strategic",
            key: "Strategic",
            color: "#2196f3",
            quadrant: "strategic",
            Icon: TrendingUp,
            caption: "High impact, high effort",
          },
          {
            label: "Fill-ins",
            key: "Fill-ins",
            color: "#ff9800",
            quadrant: "fill-ins",
            Icon: Build,
            caption: "Low impact, low effort",
          },
          {
            label: "Thankless Tasks",
            key: "Thankless Tasks",
            color: "#f44336",
            quadrant: "thankless-tasks",
            Icon: Build,
            caption: "Low impact, high effort",
          },
        ].map(({ label, key, color, quadrant, Icon, caption }) => (
          <Grid key={key} size={{ xs: 12, sm: 6, md: 3 }}>
            <Card
              variant="outlined"
              sx={{
                height: "100%",
                borderRadius: 2,
                borderLeft: `4px solid ${color}`,
                cursor: "pointer",
                transition: "box-shadow 0.2s",
                "&:hover": { boxShadow: 3 },
              }}
              onClick={() => navigate(orgPath(organizationId, "review") + `?quadrant=${quadrant}`)}
            >
              <CardContent>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Icon sx={{ color, fontSize: 24 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {matrixData.quadrants[key]}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  {label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {caption} • Click to view
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Box ref={priorityMatrixRef}>
        <Card variant="outlined" sx={{ borderRadius: 2, mb: 4 }}>
          <CardContent>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
              Priority Matrix ({matrixData.totalIdeas} ideas)
            </Typography>

            <Box
              sx={{
                ...INFO_TIP_STYLE,
                borderLeft: `4px solid ${primaryColor}`,
                ml: { xs: 0, sm: "35px" },
                mb: 2,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Lightbulb sx={{ color: primaryColor, fontSize: 20, mt: 0.25 }} />
                <Typography variant="body2" color="text.secondary">
                  <strong>How to use:</strong> Each dot represents an idea. Click any dot to view
                  details. Focus on <strong style={{ color: "#4caf50" }}>Quick Wins</strong> for
                  immediate value, and <strong style={{ color: "#2196f3" }}>Strategic</strong> ideas
                  for long-term gains.
                </Typography>
              </Box>
            </Box>

            <Box sx={{ ml: { xs: 0, sm: "35px" }, mb: 2 }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(5, auto)" },
                  gap: 1,
                  alignItems: "stretch",
                }}
              >
                {[
                  {
                    label: "All",
                    onClick: handleMatrixZoomReset,
                    active: matrixZoom.xDomain[0] === 0 && matrixZoom.xDomain[1] === 11,
                    color: null,
                  },
                  {
                    label: "Quick Wins",
                    onClick: () => setMatrixZoom({ xDomain: [0, 5.5], yDomain: [5.5, 11] }),
                    active:
                      matrixZoom.xDomain[0] === 0 &&
                      matrixZoom.xDomain[1] === 5.5 &&
                      matrixZoom.yDomain[0] === 5.5,
                    color: "#15803d",
                  },
                  {
                    label: "Strategic",
                    onClick: () => setMatrixZoom({ xDomain: [5.5, 11], yDomain: [5.5, 11] }),
                    active:
                      matrixZoom.xDomain[0] === 5.5 &&
                      matrixZoom.xDomain[1] === 11 &&
                      matrixZoom.yDomain[0] === 5.5,
                    color: "#1565c0",
                  },
                  {
                    label: "Fill-ins",
                    onClick: () => setMatrixZoom({ xDomain: [0, 5.5], yDomain: [0, 5.5] }),
                    active:
                      matrixZoom.xDomain[0] === 0 &&
                      matrixZoom.xDomain[1] === 5.5 &&
                      matrixZoom.yDomain[0] === 0,
                    color: "#ff9800",
                  },
                  {
                    label: "Thankless",
                    onClick: () => setMatrixZoom({ xDomain: [5.5, 11], yDomain: [0, 5.5] }),
                    active:
                      matrixZoom.xDomain[0] === 5.5 &&
                      matrixZoom.xDomain[1] === 11 &&
                      matrixZoom.yDomain[0] === 0,
                    color: "#f44336",
                  },
                ].map(({ label, onClick, active, color }) => (
                  <Button
                    key={label}
                    variant="outlined"
                    size="small"
                    onClick={onClick}
                    disabled={active && label === "All"}
                    sx={{
                      color: color || undefined,
                      borderColor: color || undefined,
                      fontWeight: 600,
                      bgcolor: active ? (color ? `${color}1a` : "action.selected") : "transparent",
                      "&:hover": color ? { borderColor: color, bgcolor: `${color}1a` } : {},
                      minHeight: 38,
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </Box>
            </Box>

            <Box
              ref={chartContainerRef}
              onMouseMove={handleChartMouseMove}
              onMouseLeave={handleDotLeave}
              sx={{ position: "relative", width: "100%", overflowX: "hidden" }}
            >
              <ResponsiveContainer width="100%" height={chartHeight}>
                <ScatterChart margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Effort"
                    domain={matrixZoom.xDomain}
                    allowDataOverflow={false}
                    ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(
                      (t) =>
                        t >= Math.ceil(matrixZoom.xDomain[0]) &&
                        t <= Math.floor(matrixZoom.xDomain[1])
                    )}
                    label={{
                      position: "bottom",
                      offset: 40,
                      content: (props) => {
                        const { viewBox } = props;
                        return (
                          <g>
                            <text
                              x={viewBox.width / 2 + viewBox.x}
                              y={viewBox.height + viewBox.y + (isMobile ? 30 : 35)}
                              textAnchor="middle"
                              fill="#333"
                              style={{ fontSize: isMobile ? 12 : 16 }}
                            >
                              <tspan fontWeight="700">Effort </tspan>
                              <tspan fontWeight="400">(1 = Easy, 10 = Hard)</tspan>
                            </text>
                          </g>
                        );
                      },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="Impact"
                    domain={matrixZoom.yDomain}
                    allowDataOverflow={false}
                    ticks={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(
                      (t) =>
                        t >= Math.ceil(matrixZoom.yDomain[0]) &&
                        t <= Math.floor(matrixZoom.yDomain[1])
                    )}
                    label={{
                      position: "insideLeft",
                      content: (props) => {
                        const { viewBox } = props;
                        return (
                          <g
                            transform={`translate(${viewBox.x - (isMobile ? 22 : 30)},${viewBox.y + viewBox.height / 2}) rotate(-90)`}
                          >
                            <text
                              textAnchor="middle"
                              fill="#333"
                              style={{ fontSize: isMobile ? 12 : 16 }}
                            >
                              <tspan fontWeight="700">Impact </tspan>
                              <tspan fontWeight="400">(1 = Low, 10 = High)</tspan>
                            </text>
                          </g>
                        );
                      },
                    }}
                  />
                  <ReferenceLine x={5.5} stroke="#666" strokeWidth={2} strokeDasharray="5 5" />
                  <ReferenceLine y={5.5} stroke="#666" strokeWidth={2} strokeDasharray="5 5" />
                  <Scatter data={scatterData} onClick={(data) => data && handleDotClick(data)}>
                    {scatterData.map((point, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getQuadrantColor(point.x, point.y)}
                        opacity={0.8}
                        r={Math.max(8 + point.totalVotes * 2, 8 + point.count * 3)}
                        style={{ cursor: "pointer" }}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>

              {hoverCard && (
                <Paper
                  ref={cardRef}
                  onMouseEnter={handleCardEnter}
                  onMouseLeave={handleCardLeave}
                  sx={{
                    position: "absolute",
                    top: hoverCard.position.top,
                    left: hoverCard.position.left,
                    p: 2,
                    maxWidth: 350,
                    maxHeight: 400,
                    overflowY: "auto",
                    zIndex: 1000,
                    boxShadow: 4,
                    pointerEvents: "auto",
                  }}
                >
                  {hoverCard.ideas.length > 1 && (
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: 700, color: "primary.main", mb: 1, display: "block" }}
                    >
                      {hoverCard.ideas.length} ideas at this position
                    </Typography>
                  )}
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Impact: {hoverCard.y}/10 | Effort: {hoverCard.x}/10
                  </Typography>
                  <Divider sx={{ mb: 1 }} />
                  {hoverCard.ideas.map((idea, idx) => (
                    <Box
                      key={idea.id}
                      onMouseEnter={() => setHoveredIdeaId(idea.id)}
                      onMouseLeave={() => setHoveredIdeaId(null)}
                      onClick={() => handleIdeaClick(idea.slug)}
                      sx={{
                        mb: idx < hoverCard.ideas.length - 1 ? 1.5 : 0,
                        p: 1,
                        borderRadius: 1,
                        cursor: "pointer",
                        bgcolor: hoveredIdeaId === idea.id ? "action.hover" : "transparent",
                        border: hoveredIdeaId === idea.id ? "2px solid" : "2px solid transparent",
                        borderColor: hoveredIdeaId === idea.id ? "primary.main" : "transparent",
                        transition: "all 0.2s",
                        "&:hover": { bgcolor: "action.hover", borderColor: "primary.main" },
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {idea.title}
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ fontSize: "0.75rem" }}
                      >
                        Votes: {idea.voteCount}
                      </Typography>
                      {idea.category && (
                        <Chip
                          label={idea.category}
                          size="small"
                          sx={{ mt: 0.5, fontSize: "0.7rem", height: 20 }}
                        />
                      )}
                    </Box>
                  ))}
                </Paper>
              )}
            </Box>
          </CardContent>
        </Card>

        {matrixData.totalIdeas === 0 && (
          <Alert severity="info" sx={{ mt: 3 }}>
            No ideas found. Create your first idea and assign impact/effort scores to see it appear
            on the matrix!
          </Alert>
        )}
      </Box>
    </>
  );
};

export default PriorityMatrixTab;
