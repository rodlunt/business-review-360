import React, { useEffect, useState, useRef } from "react";
import cloud from "d3-cloud";
import * as d3 from "d3";

// Custom D3 Word Cloud Component
//
// Self-measuring: a ResizeObserver on the wrapping div tracks the
// container's actual width and recomputes layout on resize. Width prop
// becomes the cap (defaults to 800), so the cloud uses available space
// up to that limit and degrades gracefully on mobile. Font sizes scale
// proportionally with width so the largest word never exceeds the
// container at any breakpoint. Closes #602.
const D3WordCloud = ({ words, width = 800, height = 600, colors, onWordClick }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: width, h: height });

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const measured = containerRef.current?.clientWidth || width;
      const w = Math.min(measured, width);
      // Maintain the default 4:3 ratio rather than stretching.
      const h = Math.min(w * 0.75, height);
      setSize({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [width, height]);

  useEffect(() => {
    if (!words || words.length === 0 || !svgRef.current) return;

    // Clear existing SVG content
    d3.select(svgRef.current).selectAll("*").remove();

    // Create color scale
    const colorScale = d3.scaleOrdinal(colors || d3.schemeCategory10);

    // Calculate font size scale, scaled down on narrow containers so
    // the largest word still fits horizontally and vertical-orientation
    // words fit within the height budget.
    const scaleFactor = Math.min(size.w / 800, 1);
    const maxValue = Math.max(...words.map((w) => w.value));
    const minValue = Math.min(...words.map((w) => w.value));
    const fontSizeScale = d3
      .scaleLinear()
      .domain([minValue, maxValue])
      .range([16 * scaleFactor, 72 * scaleFactor]);

    // Generate word cloud layout
    const layout = cloud()
      .size([size.w, size.h])
      .words(
        words.map((d) => ({
          text: d.text,
          size: fontSizeScale(d.value),
          value: d.value,
          categories: d.categories || [],
        }))
      )
      .padding(5)
      .rotate(() => (Math.random() > 0.5 ? 0 : -90))
      .font("Roboto, sans-serif")
      .fontSize((d) => d.size)
      .on("end", draw);

    layout.start();

    function draw(words) {
      const svg = d3.select(svgRef.current).attr("width", size.w).attr("height", size.h);

      const g = svg.append("g").attr("transform", `translate(${size.w / 2},${size.h / 2})`);

      const text = g
        .selectAll("text")
        .data(words)
        .enter()
        .append("text")
        .style("font-size", (d) => `${d.size}px`)
        .style("font-family", "Roboto, sans-serif")
        .style("font-weight", "bold")
        .style("fill", (d, i) => colorScale(i))
        .style("cursor", onWordClick ? "pointer" : "default")
        .attr("role", onWordClick ? "link" : null)
        .attr("tabindex", onWordClick ? 0 : null)
        .attr("text-anchor", "middle")
        .attr("transform", (d) => `translate(${d.x},${d.y})rotate(${d.rotate})`)
        .text((d) => d.text);

      // Add hover effect
      text
        .on("mouseover", function () {
          d3.select(this).style("opacity", 0.7);
        })
        .on("mouseout", function () {
          d3.select(this).style("opacity", 1);
        })
        .on("click", function (event, d) {
          if (onWordClick) onWordClick(d);
        })
        .on("keydown", function (event, d) {
          if (onWordClick && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            onWordClick(d);
          }
        });
    }
  }, [words, size, colors, onWordClick]);

  return (
    <div ref={containerRef} style={{ width: "100%", display: "flex", justifyContent: "center" }}>
      <svg ref={svgRef} />
    </div>
  );
};

export default D3WordCloud;
