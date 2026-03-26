import { useMemo, useState, useRef, useCallback } from "react";
import { scaleLinear } from "d3-scale";
import { contourDensity } from "d3-contour";
import { geoPath } from "d3-geo";
import { polygonHull } from "d3";
import { radar10ContourRGBA } from "../internal/map/heatmap";
import { pointInPolygon } from "../internal/map/geometry";
import { PatentPoint, ClusterInfo, AreaInfo, HotAreaInfo, CurrentsData, AREA_COLORS } from "../internal/map/RadarMap";

interface ReportMapProps {
  patents: PatentPoint[];
  clusters: Record<string, ClusterInfo>;
  areas: Record<string, AreaInfo>;
  hotAreas?: Record<string, HotAreaInfo>;
  currentsData?: CurrentsData;
  // Display modes
  mode: "zone" | "hotmap" | "currents";
  // For zone mode: which single area to highlight
  highlightAreaId?: number;
  // For currents: which convergence region to highlight
  highlightConvergenceId?: number;
  width?: number;
  height?: number;
}

export default function ReportMap({
  patents,
  clusters,
  areas,
  hotAreas = {},
  currentsData,
  mode,
  highlightAreaId,
  highlightConvergenceId,
  width = 600,
  height = 460,
}: ReportMapProps) {
  const dimMethod = "umap"; // radar10 always uses umap

  const patentPoints = useMemo(() => {
    return patents.map((p) => ({ x: p.x_umap, y: p.y_umap }));
  }, [patents]);

  const clusterPoints = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    Object.values(clusters).forEach((cluster) => {
      const centroid = cluster.centroid_umap;
      const weight = Math.max(1, cluster.count);
      for (let i = 0; i < weight; i++) {
        points.push({ x: centroid.x, y: centroid.y });
      }
    });
    return points;
  }, [clusters]);

  const { xScale, yScale, contours, pathGen } = useMemo(() => {
    if (patentPoints.length === 0) {
      return { xScale: null, yScale: null, contours: [], pathGen: null };
    }

    const padding = 40;
    const xs = patentPoints.map((p) => p.x);
    const ys = patentPoints.map((p) => p.y);
    const xExtent = [Math.min(...xs), Math.max(...xs)];
    const yExtent = [Math.min(...ys), Math.max(...ys)];
    const xPad = (xExtent[1] - xExtent[0]) * 0.12;
    const yPad = (yExtent[1] - yExtent[0]) * 0.12;

    const xS = scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([padding, width - padding]);

    const yS = scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([height - padding, padding]);

    // Use cluster-weighted points for radar10
    const contourGen = contourDensity<{ x: number; y: number }>()
      .x((d) => xS(d.x))
      .y((d) => yS(d.y))
      .size([width, height])
      .bandwidth(3);

    // Log-spaced + linear thresholds (same as main RadarMap)
    const probe = contourDensity<{ x: number; y: number }>()
      .x((d) => xS(d.x))
      .y((d) => yS(d.y))
      .size([width, height])
      .bandwidth(3)
      .thresholds(5)(clusterPoints);

    if (probe.length > 0) {
      const minVal = probe[0].value;
      const maxVal = probe[probe.length - 1].value;
      const thresholds: number[] = [];
      const logCount = 18;
      const logMin = Math.log(Math.max(minVal * 0.01, 1e-10));
      const logMax = Math.log(Math.max(maxVal, 1e-9));
      for (let i = 0; i < logCount; i++) {
        thresholds.push(Math.exp(logMin + (logMax - logMin) * (i / (logCount - 1))));
      }
      const linearCount = 10;
      for (let i = 0; i < linearCount; i++) {
        thresholds.push(minVal + (maxVal - minVal) * (i / (linearCount - 1)));
      }
      const unique = [...new Set(thresholds.map(v => +v.toPrecision(8)))].sort((a, b) => a - b);
      contourGen.thresholds(unique);
    } else {
      contourGen.thresholds(50);
    }

    const c = contourGen(clusterPoints);
    const pg = geoPath();
    return { xScale: xS, yScale: yS, contours: c, pathGen: pg };
  }, [patentPoints, clusterPoints, width, height]);

  const densityExtent = useMemo(() => {
    if (contours.length === 0) return [0, 1];
    const values = contours.map((c) => c.value);
    return [Math.min(...values), Math.max(...values)];
  }, [contours]);

  // Origin for crosshairs
  const originX = xScale ? xScale(0) : width / 2;
  const originY = yScale ? yScale(0) : height / 2;
  const maxRadius = useMemo(() => {
    if (!xScale || !yScale) return 200;
    const xDomain = xScale.domain();
    const yDomain = yScale.domain();
    const dx = Math.max(Math.abs(xScale(xDomain[0]) - originX), Math.abs(xScale(xDomain[1]) - originX));
    const dy = Math.max(Math.abs(yScale(yDomain[0]) - originY), Math.abs(yScale(yDomain[1]) - originY));
    return Math.max(dx, dy);
  }, [xScale, yScale, originX, originY]);

  // Sorted area IDs by patent count
  const sortedAreaIds = useMemo(() => {
    return Object.values(areas).sort((a, b) => b.patent_count - a.patent_count).map((a) => a.id);
  }, [areas]);

  // Area hulls
  const areaHulls = useMemo(() => {
    if (!xScale || !yScale) return {};
    const hulls: Record<number, string> = {};
    for (const area of Object.values(areas)) {
      const points: [number, number][] = area.cluster_ids
        .map((cid) => clusters[String(cid)])
        .filter(Boolean)
        .map((c) => [xScale(c.centroid_umap.x), yScale(c.centroid_umap.y)] as [number, number]);

      if (points.length < 3) {
        const cx = xScale(area.centroid.x);
        const cy = yScale(area.centroid.y);
        hulls[area.id] = `M ${cx + 15} ${cy} A 15 15 0 1 1 ${cx - 15} ${cy} A 15 15 0 1 1 ${cx + 15} ${cy} Z`;
        continue;
      }
      const hull = polygonHull(points);
      if (!hull) continue;
      const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
      const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
      const padding = 5;
      const padded = hull.map(([px, py]) => {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist > 0 ? (dist + padding) / dist : 1;
        return [cx + dx * scale, cy + dy * scale] as [number, number];
      });
      const n = padded.length;
      let d = `M ${padded[0][0]} ${padded[0][1]}`;
      for (let i = 0; i < n; i++) {
        const p0 = padded[i];
        const p1 = padded[(i + 1) % n];
        const p2 = padded[(i + 2) % n];
        const cpx1 = p0[0] + (p1[0] - padded[(i - 1 + n) % n][0]) * 0.25;
        const cpy1 = p0[1] + (p1[1] - padded[(i - 1 + n) % n][1]) * 0.25;
        const cpx2 = p1[0] - (p2[0] - p0[0]) * 0.25;
        const cpy2 = p1[1] - (p2[1] - p0[1]) * 0.25;
        d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${p1[0]} ${p1[1]}`;
      }
      d += " Z";
      hulls[area.id] = d;
    }
    return hulls;
  }, [areas, clusters, xScale, yScale]);

  // Hot area contour-based paths
  const hotAreaPaths = useMemo(() => {
    if (!xScale || !yScale || contours.length === 0 || Object.keys(hotAreas).length === 0) return {};
    const clusterPixels: Record<number, [number, number]> = {};
    for (const cid of Object.keys(clusters)) {
      const cl = clusters[cid];
      clusterPixels[cl.id] = [xScale(cl.centroid_umap.x), yScale(cl.centroid_umap.y)];
    }
    const paths: Record<number, string> = {};
    for (const ha of Object.values(hotAreas)) {
      const cx = xScale(ha.centroid.x);
      const cy = yScale(ha.centroid.y);
      const targetClusterCount = ha.cluster_ids.length * 0.6;
      for (let ci = contours.length - 1; ci >= 0; ci--) {
        const contour = contours[ci];
        for (const polygon of contour.coordinates) {
          const outerRing = polygon[0] as [number, number][];
          if (!outerRing || outerRing.length < 3) continue;
          if (!pointInPolygon(cx, cy, outerRing)) continue;
          let insideCount = 0;
          for (const cid of ha.cluster_ids) {
            const pt = clusterPixels[cid];
            if (pt && pointInPolygon(pt[0], pt[1], outerRing)) insideCount++;
          }
          if (insideCount >= targetClusterCount) {
            paths[ha.id] = `M ${outerRing.map(([x, y]) => `${x} ${y}`).join(" L ")} Z`;
            break;
          }
        }
        if (paths[ha.id]) break;
      }
    }
    return paths;
  }, [hotAreas, clusters, contours, xScale, yScale]);

  if (!xScale || !yScale || !pathGen) return null;

  // Determine whether to show heatmap fills
  const showHeatmap = mode === "hotmap";

  // Label positions pushed outward from content center
  const allAreaCentroids = Object.values(areas).map((a) => ({
    cx: xScale(a.centroid.x), cy: yScale(a.centroid.y),
  }));
  const contentCx = allAreaCentroids.reduce((s, p) => s + p.cx, 0) / allAreaCentroids.length;
  const contentCy = allAreaCentroids.reduce((s, p) => s + p.cy, 0) / allAreaCentroids.length;

  const pushOut = (cx: number, cy: number, dist: number) => {
    const dx = cx - contentCx;
    const dy = cy - contentCy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { lx: cx, ly: cy - dist };
    return { lx: cx + (dx / d) * dist, ly: cy + (dy / d) * dist };
  };

  // ── Zoom / Pan state ──
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Mouse position in SVG coords
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.min(8, Math.max(1, zoom * factor));
    // Keep point under cursor stable
    const newPanX = mx - (mx - pan.x) * (newZoom / zoom);
    const newPanY = my - (my - pan.y) * (newZoom / zoom);
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  }, [zoom, pan]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, [zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const transform = `translate(${pan.x}, ${pan.y}) scale(${zoom})`;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="bg-white rounded-lg border border-gray-200"
      style={{ cursor: zoom > 1 ? "grab" : "zoom-in" }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    >
      <defs>
        <clipPath id={`clip-${mode}-${highlightAreaId ?? "all"}`}>
          <rect x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${mode}-${highlightAreaId ?? "all"})`}>
      <g transform={transform}>
      {/* Contours */}
      {contours.map((contour, i) => {
        const logDMin = Math.log(Math.max(densityExtent[0], 1e-10));
        const logDMax = Math.log(Math.max(densityExtent[1], 1e-9));
        const logVal = Math.log(Math.max(contour.value, 1e-10));
        const t = Math.max(0, Math.min(1, (logVal - logDMin) / (logDMax - logDMin)));

        let fill: string;
        let stroke: string;
        if (showHeatmap) {
          const [r, g, b, a] = radar10ContourRGBA(t);
          fill = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
          stroke = `rgb(${Math.round(r * 0.9)},${Math.round(g * 0.8)}, ${Math.round(b * 0.8)})`;
        } else {
          fill = "none";
          stroke = "rgba(50, 140, 230, 0.7)";
        }

        return (
          <path
            key={i}
            d={pathGen(contour) || ""}
            fill={fill}
            stroke={stroke}
            strokeWidth={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}

      {/* Crosshairs */}
      <line x1={0} y1={originY} x2={width} y2={originY} stroke="rgba(150,160,180,0.4)" strokeWidth={0.8} />
      <line x1={originX} y1={0} x2={originX} y2={height} stroke="rgba(150,160,180,0.4)" strokeWidth={0.8} />

      {/* Percentage circles */}
      {[0.2, 0.4, 0.6, 0.8].map((pct) => (
        <circle
          key={pct}
          cx={originX}
          cy={originY}
          r={maxRadius * pct}
          fill="none"
          stroke="rgba(150,160,180,0.4)"
          strokeWidth={0.6}
          strokeDasharray="4,4"
        />
      ))}

      {/* Zone mode: highlight one area, show all hulls faintly */}
      {mode === "zone" && Object.values(areas).map((area) => {
        const path = areaHulls[area.id];
        if (!path) return null;
        const isHighlighted = area.id === highlightAreaId;
        const colorIdx = sortedAreaIds.indexOf(area.id);
        const color = AREA_COLORS[colorIdx % AREA_COLORS.length];
        return (
          <path
            key={`zone-${area.id}`}
            d={path}
            fill={isHighlighted ? color.fill.replace("0.12", "0.18") : "rgba(99,102,241,0.03)"}
            stroke={isHighlighted ? color.stroke : "rgba(99,102,241,0.15)"}
            strokeWidth={isHighlighted ? 2 : 0.8}
            strokeDasharray={isHighlighted ? "none" : "6 3"}
          />
        );
      })}

      {/* Zone mode: labels */}
      {mode === "zone" && Object.values(areas).map((area) => {
        const cx = xScale(area.centroid.x);
        const cy = yScale(area.centroid.y);
        const isHighlighted = area.id === highlightAreaId;
        if (!isHighlighted) return null;
        const { lx, ly } = pushOut(cx, cy, 30);
        const colorIdx = sortedAreaIds.indexOf(area.id);
        const color = AREA_COLORS[colorIdx % AREA_COLORS.length];
        return (
          <g key={`label-${area.id}`}>
            <line x1={cx} y1={cy} x2={lx} y2={ly} stroke={color.stroke} strokeWidth={1} />
            <text x={lx} y={ly - 4} textAnchor="middle" fill={color.dot} fontSize={11} fontWeight={600} fontFamily="system-ui, sans-serif">
              {area.label.length > 35 ? area.label.slice(0, 35) + "..." : area.label}
            </text>
          </g>
        );
      })}

      {/* Cluster dots (zone + currents mode) */}
      {(mode === "zone" || mode === "currents") && Object.values(clusters).map((cluster) => {
        const cx = xScale(cluster.centroid_umap.x);
        const cy = yScale(cluster.centroid_umap.y);
        const r = Math.max(1.5, Math.min(10, Math.sqrt(cluster.count) * 0.7));
        return (
          <circle
            key={`cl-${cluster.id}`}
            cx={cx}
            cy={cy}
            r={r}
            fill="rgba(50,140,230,0.55)"
            stroke="none"
          />
        );
      })}

      {/* Hot map mode: hot area boundaries + labels */}
      {mode === "hotmap" && Object.values(hotAreas).map((ha) => {
        const path = hotAreaPaths[ha.id];
        if (!path) return null;
        return (
          <path
            key={`ha-${ha.id}`}
            d={path}
            fill="rgba(245,158,11,0.10)"
            stroke="rgba(245,158,11,0.6)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        );
      })}
      {mode === "hotmap" && Object.values(hotAreas).map((ha) => {
        const cx = xScale(ha.centroid.x);
        const cy = yScale(ha.centroid.y);
        const { lx, ly } = pushOut(cx, cy, 25);
        return (
          <g key={`ha-label-${ha.id}`}>
            <line x1={cx} y1={cy} x2={lx} y2={ly} stroke="rgba(245,158,11,0.6)" strokeWidth={1} />
            <text x={lx} y={ly - 4} textAnchor="middle" fill="rgba(180,100,0,0.9)" fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif">
              {ha.label.length > 30 ? ha.label.slice(0, 30) + "..." : ha.label}
            </text>
          </g>
        );
      })}

      {/* Currents mode: zone hulls + convergence region highlights */}
      {mode === "currents" && (() => {
        if (!currentsData) return null;
        const involvedZoneIds = new Set<number>();
        if (highlightConvergenceId != null) {
          const cr = currentsData.convergence_regions.find((r) => r.id === highlightConvergenceId);
          if (cr) cr.zone_ids.forEach((zid) => involvedZoneIds.add(Number(zid)));
        } else {
          currentsData.convergence_regions.slice(0, 3).forEach((cr) => {
            cr.zone_ids.forEach((zid) => involvedZoneIds.add(Number(zid)));
          });
        }

        const visibleRegions = highlightConvergenceId != null
          ? currentsData.convergence_regions.filter((r) => r.id === highlightConvergenceId)
          : currentsData.convergence_regions.slice(0, 3);

        // Build hull for convergence region clusters
        const buildHull = (pixels: { cx: number; cy: number }[]) => {
          if (pixels.length < 3) return "";
          const gCx = pixels.reduce((s, p) => s + p.cx, 0) / pixels.length;
          const gCy = pixels.reduce((s, p) => s + p.cy, 0) / pixels.length;
          const pts: [number, number][] = pixels.map((p) => [p.cx, p.cy]);
          const hull = polygonHull(pts);
          if (!hull) return "";
          const pad = 8;
          const padded = hull.map(([px, py]: [number, number]) => {
            const dx = px - gCx;
            const dy = py - gCy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const scale = dist > 0 ? (dist + pad) / dist : 1;
            return [gCx + dx * scale, gCy + dy * scale] as [number, number];
          });
          const n = padded.length;
          let d = `M ${padded[0][0]} ${padded[0][1]}`;
          for (let i = 0; i < n; i++) {
            const p0 = padded[i];
            const p1 = padded[(i + 1) % n];
            const p2 = padded[(i + 2) % n];
            const cpx1 = p0[0] + (p1[0] - padded[(i - 1 + n) % n][0]) * 0.25;
            const cpy1 = p0[1] + (p1[1] - padded[(i - 1 + n) % n][1]) * 0.25;
            const cpx2 = p1[0] - (p2[0] - p0[0]) * 0.25;
            const cpy2 = p1[1] - (p2[1] - p0[1]) * 0.25;
            d += ` C ${cpx1} ${cpy1}, ${cpx2} ${cpy2}, ${p1[0]} ${p1[1]}`;
          }
          return d + " Z";
        };

        return (
          <>
            {/* Zone hulls */}
            {Object.values(areas).map((area) => {
              const path = areaHulls[area.id];
              if (!path) return null;
              const isInvolved = involvedZoneIds.has(area.id);
              return (
                <path
                  key={`curr-zone-${area.id}`}
                  d={path}
                  fill={isInvolved ? "rgba(99,102,241,0.08)" : "rgba(99,102,241,0.02)"}
                  stroke={isInvolved ? "rgba(99,102,241,0.45)" : "rgba(99,102,241,0.12)"}
                  strokeWidth={isInvolved ? 1.5 : 0.8}
                  strokeDasharray="6 3"
                />
              );
            })}
            {/* Convergence region clusters */}
            {visibleRegions.map((cr) => {
              const clusterPxs: { cx: number; cy: number; r: number }[] = [];
              for (const cid of cr.cluster_ids) {
                const cluster = clusters[String(cid)];
                if (!cluster) continue;
                clusterPxs.push({
                  cx: xScale(cluster.centroid_umap.x),
                  cy: yScale(cluster.centroid_umap.y),
                  r: Math.max(3, Math.min(14, Math.sqrt(cluster.count) * 1.2)),
                });
              }
              if (clusterPxs.length === 0) return null;
              const hullPath = buildHull(clusterPxs);
              return (
                <g key={`cr-${cr.id}`}>
                  {hullPath && (
                    <path d={hullPath} fill="rgba(220,38,38,0.06)" stroke="rgba(220,38,38,0.3)" strokeWidth={1.5} strokeDasharray="6 3" />
                  )}
                  {clusterPxs.map((cp, i) => (
                    <g key={i}>
                      <circle cx={cp.cx} cy={cp.cy} r={cp.r + 4} fill="rgba(220,38,38,0.8)" opacity={0.15} />
                      <circle cx={cp.cx} cy={cp.cy} r={cp.r} fill="rgba(220,38,38,0.8)" opacity={0.7} stroke="white" strokeWidth={1} />
                    </g>
                  ))}
                </g>
              );
            })}
            {/* Zone labels for involved zones */}
            {Object.values(areas).filter((a) => involvedZoneIds.has(a.id)).map((area) => {
              const cx = xScale(area.centroid.x);
              const cy = yScale(area.centroid.y);
              const { lx, ly } = pushOut(cx, cy, 25);
              return (
                <text key={`curr-label-${area.id}`} x={lx} y={ly} textAnchor="middle" fill="rgba(55,65,81,0.8)" fontSize={9} fontWeight={500} fontFamily="system-ui, sans-serif">
                  {area.label.length > 30 ? area.label.slice(0, 30) + "..." : area.label}
                </text>
              );
            })}
          </>
        );
      })()}
      </g>
      </g>
      {/* Zoom hint (fades at zoom > 1) */}
      {zoom <= 1 && (
        <text x={width - 8} y={height - 8} textAnchor="end" fontSize={9} fill="rgba(150,160,180,0.5)" fontFamily="system-ui, sans-serif">
          Scroll to zoom &middot; Double-click to reset
        </text>
      )}
    </svg>
  );
}
