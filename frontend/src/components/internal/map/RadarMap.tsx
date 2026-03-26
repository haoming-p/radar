import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Hand, CircleDot, CircleDotDashed, Thermometer, Layers, Eye } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { contourDensity } from "d3-contour";
import { geoPath } from "d3-geo";
import { polygonHull } from "d3";
import { contourFillColor, contourStrokeColor, radar10ContourRGBA } from "./heatmap";
import { pointInPolygon } from "./geometry";
import PlayerShadow from "./PlayerShadow";
import { PlayerInfo } from "../sidebar/PlayersSection";

// ============ CONSTANTS ============

// Distinct colors for key areas (friendly, not red)
export const AREA_COLORS = [
  { fill: "rgba(99, 102, 241, 0.12)", stroke: "rgba(99, 102, 241, 0.6)", dot: "rgba(99, 102, 241, 0.85)" },   // indigo
  { fill: "rgba(16, 185, 129, 0.12)", stroke: "rgba(16, 185, 129, 0.6)", dot: "rgba(16, 185, 129, 0.85)" },   // emerald
  { fill: "rgba(245, 158, 11, 0.12)", stroke: "rgba(245, 158, 11, 0.6)", dot: "rgba(245, 158, 11, 0.85)" },   // amber
  { fill: "rgba(239, 68, 68, 0.12)", stroke: "rgba(239, 68, 68, 0.6)", dot: "rgba(239, 68, 68, 0.85)" },     // red
  { fill: "rgba(168, 85, 247, 0.12)", stroke: "rgba(168, 85, 247, 0.6)", dot: "rgba(168, 85, 247, 0.85)" },   // purple
  { fill: "rgba(6, 182, 212, 0.12)", stroke: "rgba(6, 182, 212, 0.6)", dot: "rgba(6, 182, 212, 0.85)" },     // cyan
  { fill: "rgba(234, 88, 12, 0.12)", stroke: "rgba(234, 88, 12, 0.6)", dot: "rgba(234, 88, 12, 0.85)" },     // orange
  { fill: "rgba(236, 72, 153, 0.12)", stroke: "rgba(236, 72, 153, 0.6)", dot: "rgba(236, 72, 153, 0.85)" },   // pink
];

// ============ TYPES ============

export type DimMethod = "umap" | "tsne";

export interface PatentPoint {
  x_umap: number;
  y_umap: number;
  x_tsne: number;
  y_tsne: number;
  cluster_id: number;
  area_id?: number;
  title: string;
  year: number | null;
  index: number;
}

export interface ClusterInfo {
  id: number;
  centroid_umap: { x: number; y: number };
  centroid_tsne: { x: number; y: number };
  count: number;
  label: string;
  keywords?: string[];
  compound_keywords?: string[];
  trend: number;
}

export interface AreaInfo {
  id: number;
  centroid: { x: number; y: number };
  cluster_ids: number[];
  cluster_count: number;
  patent_count: number;
  label: string;
  summary: string;
  keywords: string;
  trend: number;
}

export interface HotAreaInfo extends AreaInfo {
  boundary: [number, number][];
}

export type ViewSource = "pipeline" | "radar10";

export type InteractionContext = "keyAreas" | "hotAreas" | "currents" | "explore" | "players" | "layers" | null;

// Saved layer types
export interface SavedLayer {
  id: string;
  section: "keyAreas" | "hotAreas" | "convergence" | "signal" | "explore" | "players";
  itemId: number | string; // area.id, convergence.id, signal.id, player name
  visible: boolean;
  // For explore areas, store ephemeral data
  exploreData?: {
    name: string;
    summary: string;
    clusterCount: number;
    patentCount: number;
    topKeywords: string[];
    path: string;
    enclosedClusterIds: number[];
  };
}

// Currents data types
export interface ConvergenceRegion {
  id: number;
  name: string;
  description: string;
  why_care: string;
  cluster_ids: number[];
  cluster_count: number;
  total_patents: number;
  growing_clusters: number;
  zone_ids: string[];
  zone_names: string[];
  center: { x: number; y: number };
  top_clusters: { id: number; keywords: string; zone: string; patents: number; trend: number }[];
}

export interface CurrentSignal {
  id: number;
  name: string;
  description: string;
  cluster_id: number;
  cluster_count: number;
  trend: number;
  zone_id: string;
  zone_name: string;
  keywords: string;
  center: { x: number; y: number };
}

export interface CurrentsData {
  convergence_regions: ConvergenceRegion[];
  signals: CurrentSignal[];
}

export interface ExploreResult {
  path: string;
  enclosedClusterIds: number[];
  clusterCount: number;
  patentCount: number;
  topKeywords: string[];
  currentLevel: number;
  maxLevel: number;
}

interface RadarMapProps {
  patents: PatentPoint[];
  clusters: Record<string, ClusterInfo>;
  areas: Record<string, AreaInfo>;
  hotAreas: Record<string, HotAreaInfo>;
  dimMethod: DimMethod;
  viewSource: ViewSource;
  interactionContext: InteractionContext;
  highlightedArea: number | null;
  selectedArea: number | null;
  highlightedHotArea: number | null;
  selectedHotArea: number | null;
  onHighlightArea: (id: number | null) => void;
  onSelectArea: (id: number) => void;
  onHighlightHotArea: (id: number | null) => void;
  onSelectHotArea: (id: number) => void;
  // Currents mode
  currentsData?: CurrentsData;
  activeConvergenceId?: number | null;
  activeSignalId?: number | null;
  // Player mode
  selectedPlayers?: PlayerInfo[];
  selectedYear?: number | null;
  // Explore mode
  exploreClickPx: { x: number; y: number } | null;
  exploreLevelOffset: number;
  onExploreClick: (point: { x: number; y: number }) => void;
  onExploreResult: (result: ExploreResult | null) => void;
  exploreLabel?: { name: string; clusters: number; patents: number } | null;
  // Layers
  savedLayers?: SavedLayer[];
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  dimensions: { width: number; height: number };
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

// ============ COMPONENT ============

export default function RadarMap({
  patents,
  clusters,
  areas,
  hotAreas,
  dimMethod,
  viewSource,
  interactionContext,
  highlightedArea,
  selectedArea,
  highlightedHotArea,
  selectedHotArea,
  onHighlightArea,
  onSelectArea,
  onHighlightHotArea,
  onSelectHotArea,
  currentsData,
  activeConvergenceId,
  activeSignalId,
  selectedPlayers = [],
  selectedYear,
  exploreClickPx,
  exploreLevelOffset,
  onExploreClick,
  onExploreResult,
  exploreLabel,
  savedLayers = [],
  focusMode = false,
  onToggleFocusMode,
  dimensions: propDimensions,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedPositions, setDraggedPositions] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Responsive dimensions — measure container
  const [dimensions, setDimensions] = useState(propDimensions);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Layer visibility — driven by interaction context
  // Key areas context: clusters on, heatmap off, contours off
  // Hot areas / explore context: heatmap on, clusters off
  // Players context: clusters + contours on, heatmap off
  // Currents context: clusters on, heatmap off, contours off (zone hulls shown instead)
  const showClustersAuto = interactionContext === "keyAreas" || interactionContext === "players" || interactionContext === "currents";
  const showHeatmapAuto = interactionContext !== "keyAreas" && interactionContext !== "players" && interactionContext !== "currents";
  const showContoursAuto = interactionContext !== "keyAreas" && interactionContext !== "currents";

  // Manual overrides (user can toggle via buttons, reset when context changes)
  const [showClustersOverride, setShowClustersOverride] = useState<boolean | null>(null);
  const [showContoursOverride, setShowContoursOverride] = useState<boolean | null>(null);
  const [showHeatmapOverride, setShowHeatmapOverride] = useState<boolean | null>(null);

  const showClusters = showClustersOverride ?? showClustersAuto;
  const showContours = showContoursOverride ?? showContoursAuto;
  const showHeatmap = showHeatmapOverride ?? showHeatmapAuto;

  // Reset manual overrides when context changes
  useEffect(() => {
    setShowClustersOverride(null);
    setShowContoursOverride(null);
    setShowHeatmapOverride(null);
  }, [interactionContext]);

  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const panStartOffsetRef = useRef({ x: 0, y: 0 });

  // Get patent positions based on dim method
  const patentPoints = useMemo(() => {
    return patents.map((p) => {
      const x = dimMethod === "tsne" ? p.x_tsne : p.x_umap;
      const y = dimMethod === "tsne" ? p.y_tsne : p.y_umap;
      return { x, y };
    });
  }, [patents, dimMethod]);

  // Cluster centroid positions for radar10 contouring
  const clusterPoints = useMemo(() => {
    const points: { x: number; y: number }[] = [];
    Object.values(clusters).forEach((cluster) => {
      const centroid =
        dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
      // Weight by cluster count so denser clusters produce higher density peaks
      const weight = Math.max(1, cluster.count);
      for (let i = 0; i < weight; i++) {
        points.push({ x: centroid.x, y: centroid.y });
      }
    });
    return points;
  }, [clusters, dimMethod]);

  // Compute scales + contours
  const { xScale, yScale, contours, pathGen } = useMemo(() => {
    if (patentPoints.length === 0) {
      return { xScale: null, yScale: null, contours: [], pathGen: null };
    }

    const padding = 60;
    const paddingRight = 110; // extra room so labels don't hide behind toolbar
    const xs = patentPoints.map((p) => p.x);
    const ys = patentPoints.map((p) => p.y);
    const xExtent = [Math.min(...xs), Math.max(...xs)];
    const yExtent = [Math.min(...ys), Math.max(...ys)];
    const xPad = (xExtent[1] - xExtent[0]) * 0.12;
    const yPad = (yExtent[1] - yExtent[0]) * 0.12;

    const xS = scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([padding, dimensions.width - paddingRight]);

    const yS = scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([dimensions.height - padding, padding]);

    const isRadar10 = viewSource === "radar10";
    const contourInput = isRadar10 ? clusterPoints : patentPoints;
    const bw = isRadar10 ? 3 : 10;

    const contourGen = contourDensity<{ x: number; y: number }>()
      .x((d) => xS(d.x))
      .y((d) => yS(d.y))
      .size([dimensions.width, dimensions.height])
      .bandwidth(bw);

    if (isRadar10) {
      // First pass: get the density range to build logarithmic thresholds
      const probe = contourDensity<{ x: number; y: number }>()
        .x((d) => xS(d.x))
        .y((d) => yS(d.y))
        .size([dimensions.width, dimensions.height])
        .bandwidth(bw)
        .thresholds(5)(contourInput);

      if (probe.length > 0) {
        const minVal = probe[0].value;
        const maxVal = probe[probe.length - 1].value;
        // Combined thresholds: log-spaced for outliers + linear-spaced for hot areas
        const thresholds: number[] = [];

        // Log part: same as before (catches outliers)
        const logCount = 18;  // <-- tune: number of log thresholds (low end)
        const logMin = Math.log(Math.max(minVal * 0.01, 1e-10));
        const logMax = Math.log(Math.max(maxVal, 1e-9));
        for (let i = 0; i < logCount; i++) {
          const logVal = logMin + (logMax - logMin) * (i / (logCount - 1));
          thresholds.push(Math.exp(logVal));
        }

        // Linear part: evenly spaced across full range (adds density in hot areas)
        const linearCount = 10;  // <-- tune: number of linear thresholds (hot area detail)
        for (let i = 0; i < linearCount; i++) {
          thresholds.push(minVal + (maxVal - minVal) * (i / (linearCount - 1)));
        }

        // Deduplicate and sort
        const unique = [...new Set(thresholds.map(v => +v.toPrecision(8)))].sort((a, b) => a - b);
        contourGen.thresholds(unique);
      } else {
        contourGen.thresholds(50);
      }
    } else {
      contourGen.thresholds(60);
    }

    const c = contourGen(contourInput);
    const pg = geoPath();

    return { xScale: xS, yScale: yS, contours: c, pathGen: pg };
  }, [patentPoints, clusterPoints, dimensions, viewSource]);

  const densityExtent = useMemo(() => {
    if (contours.length === 0) return [0, 1];
    const values = contours.map((c) => c.value);
    return [Math.min(...values), Math.max(...values)];
  }, [contours]);

  // Origin (0,0) in pixel space
  const originX = xScale ? xScale(0) : dimensions.width / 2;
  const originY = yScale ? yScale(0) : dimensions.height / 2;

  // Max radius for percentage circles
  const maxRadius = useMemo(() => {
    if (!xScale || !yScale) return 200;
    const xDomain = xScale.domain();
    const yDomain = yScale.domain();
    const dx = Math.max(
      Math.abs(xScale(xDomain[0]) - originX),
      Math.abs(xScale(xDomain[1]) - originX)
    );
    const dy = Math.max(
      Math.abs(yScale(yDomain[0]) - originY),
      Math.abs(yScale(yDomain[1]) - originY)
    );
    return Math.max(dx, dy);
  }, [xScale, yScale, originX, originY]);

  // Transform origin for zoom: at (0,0) data point
  const transformOriginPx = useMemo(() => {
    return `${originX}px ${originY}px`;
  }, [originX, originY]);

  // Area label default positions (centroid + pushed outward from map center)
  const defaultLabelPositions = useMemo(() => {
    if (!xScale || !yScale) return {};
    const positions: Record<
      number,
      { cx: number; cy: number; labelX: number; labelY: number }
    > = {};

    Object.values(areas).forEach((area) => {
      const cx = xScale(area.centroid.x);
      const cy = yScale(area.centroid.y);
      positions[area.id] = { cx, cy, labelX: cx, labelY: cy };
    });
    // labelX/labelY are computed dynamically in the label render block (pushToEdge)
    // Store centroids here for reference
    return positions;
  }, [areas, xScale, yScale, dimensions]);

  // Get label position: check for dragged override, else use default
  const getLabelPos = useCallback(
    (key: string, defaultPos: { cx: number; cy: number; labelX: number; labelY: number }) => {
      const dragged = draggedPositions[key];
      if (dragged) return { cx: defaultPos.cx, cy: defaultPos.cy, labelX: dragged.x, labelY: dragged.y };
      return defaultPos;
    },
    [draggedPositions]
  );

  // Sorted areas by patent count (for default display order)
  const sortedAreaIds = useMemo(() => {
    return Object.values(areas)
      .sort((a, b) => b.patent_count - a.patent_count)
      .map((a) => a.id);
  }, [areas]);

  // Default: show top 2 areas
  const defaultVisibleAreas = useMemo(() => new Set(sortedAreaIds.slice(0, 2)), [sortedAreaIds]);

  // An area is visible if: it's in the default top 2, OR it's selected, OR it's hovered
  const isAreaVisible = useCallback(
    (areaId: number) => {
      if (selectedArea === areaId) return true;
      if (highlightedArea === areaId) return true;
      if (selectedArea === null && defaultVisibleAreas.has(areaId)) return true;
      return false;
    },
    [selectedArea, highlightedArea, defaultVisibleAreas]
  );

  // Get color for an area based on its rank
  const getAreaColor = useCallback(
    (areaId: number) => {
      const idx = sortedAreaIds.indexOf(areaId);
      return AREA_COLORS[idx % AREA_COLORS.length];
    },
    [sortedAreaIds]
  );

  // Area boundary hulls (convex hull of member cluster positions, padded + smoothed)
  const areaHulls = useMemo(() => {
    if (!xScale || !yScale) return {};
    const hulls: Record<number, string> = {};

    for (const area of Object.values(areas)) {
      const points: [number, number][] = area.cluster_ids
        .map((cid) => clusters[String(cid)])
        .filter(Boolean)
        .map((c) => {
          const centroid = dimMethod === "tsne" ? c.centroid_tsne : c.centroid_umap;
          return [xScale(centroid.x), yScale(centroid.y)] as [number, number];
        });

      if (points.length < 3) {
        // Fallback: circle for small areas
        const cx = xScale(area.centroid.x);
        const cy = yScale(area.centroid.y);
        hulls[area.id] = `M ${cx + 15} ${cy} A 15 15 0 1 1 ${cx - 15} ${cy} A 15 15 0 1 1 ${cx + 15} ${cy} Z`;
        continue;
      }

      const hull = polygonHull(points);
      if (!hull) continue;

      // Pad hull outward from centroid and generate smooth path
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

      // Smooth path with cubic bezier curves
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
  }, [areas, clusters, xScale, yScale, dimMethod]);

  // Hot area boundary paths — derived from actual d3-contour data so they
  // perfectly coincide with the visible contour lines on the map.
  // For each hot area, we find the lowest-density contour level whose polygon
  // still contains the hot area centroid and ≥60% of its clusters.
  const hotAreaPaths = useMemo(() => {
    if (!xScale || !yScale || contours.length === 0 || Object.keys(hotAreas).length === 0) return {};

    // Pre-compute cluster pixel positions
    const clusterPixels: Record<number, [number, number]> = {};
    for (const cid of Object.keys(clusters)) {
      const cl = clusters[cid];
      const centroid = dimMethod === "tsne" ? cl.centroid_tsne : cl.centroid_umap;
      clusterPixels[cl.id] = [xScale(centroid.x), yScale(centroid.y)];
    }

    const paths: Record<number, string> = {};

    for (const ha of Object.values(hotAreas)) {
      const cx = xScale(ha.centroid.x);
      const cy = yScale(ha.centroid.y);
      const targetClusterCount = ha.cluster_ids.length * 0.6;

      // Search contours from high density to low, find the first level where
      // a polygon contains the centroid AND enough clusters
      for (let ci = contours.length - 1; ci >= 0; ci--) {
        const contour = contours[ci];
        // contour.coordinates is MultiPolygon: polygon[] where polygon = ring[]
        for (const polygon of contour.coordinates) {
          const outerRing = polygon[0] as [number, number][];
          if (!outerRing || outerRing.length < 3) continue;

          if (!pointInPolygon(cx, cy, outerRing)) continue;

          // Count how many of this hot area's clusters are inside
          let insideCount = 0;
          for (const cid of ha.cluster_ids) {
            const pt = clusterPixels[cid];
            if (pt && pointInPolygon(pt[0], pt[1], outerRing)) insideCount++;
          }

          if (insideCount >= targetClusterCount) {
            // Use this contour polygon as the boundary — it IS a visible contour line
            let d = `M ${outerRing[0][0]} ${outerRing[0][1]}`;
            for (let i = 1; i < outerRing.length; i++) {
              d += ` L ${outerRing[i][0]} ${outerRing[i][1]}`;
            }
            d += " Z";
            paths[ha.id] = d;
            break;
          }
        }
        if (paths[ha.id]) break;
      }
    }

    return paths;
  }, [hotAreas, contours, clusters, xScale, yScale, dimMethod]);

  // Sorted hot areas by patent count
  const sortedHotAreaIds = useMemo(() => {
    return Object.values(hotAreas)
      .sort((a, b) => b.patent_count - a.patent_count)
      .map((a) => a.id);
  }, [hotAreas]);

  // ── Explore mode: compute selection from click point + level offset ──
  const exploreData = useMemo((): ExploreResult | null => {
    if (!exploreClickPx || !xScale || !yScale || contours.length === 0) return null;

    const px = exploreClickPx.x;
    const py = exploreClickPx.y;

    // Find all contour levels that have a polygon containing the click point (tightest first)
    const validLevels: { ci: number; pi: number }[] = [];
    for (let ci = contours.length - 1; ci >= 0; ci--) {
      for (let pi = 0; pi < contours[ci].coordinates.length; pi++) {
        const outerRing = contours[ci].coordinates[pi][0] as [number, number][];
        if (outerRing && outerRing.length >= 3 && pointInPolygon(px, py, outerRing)) {
          validLevels.push({ ci, pi });
          break;
        }
      }
    }

    if (validLevels.length === 0) return null;

    const offset = Math.min(exploreLevelOffset, validLevels.length - 1);
    const { ci, pi } = validLevels[offset];
    const outerRing = contours[ci].coordinates[pi][0] as [number, number][];

    // Build SVG path
    let d = `M ${outerRing[0][0]} ${outerRing[0][1]}`;
    for (let i = 1; i < outerRing.length; i++) {
      d += ` L ${outerRing[i][0]} ${outerRing[i][1]}`;
    }
    d += " Z";

    // Find enclosed clusters
    const enclosed = Object.values(clusters).filter((c) => {
      const centroid = dimMethod === "tsne" ? c.centroid_tsne : c.centroid_umap;
      return pointInPolygon(xScale(centroid.x), yScale(centroid.y), outerRing);
    });

    const patentCount = enclosed.reduce((sum, c) => sum + c.count, 0);
    const kwMap: Record<string, number> = {};
    for (const c of enclosed) {
      for (const kw of (c.compound_keywords || c.keywords || [])) {
        kwMap[kw] = (kwMap[kw] || 0) + 1;
      }
    }
    const topKeywords = Object.entries(kwMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([kw]) => kw);

    return {
      path: d,
      enclosedClusterIds: enclosed.map((c) => c.id),
      clusterCount: enclosed.length,
      patentCount,
      topKeywords,
      currentLevel: offset,
      maxLevel: validLevels.length - 1,
    };
  }, [exploreClickPx, exploreLevelOffset, contours, clusters, xScale, yScale, dimMethod]);

  // Emit explore result to parent
  const prevExploreDataRef = useRef<ExploreResult | null>(null);
  useEffect(() => {
    if (exploreData !== prevExploreDataRef.current) {
      prevExploreDataRef.current = exploreData;
      onExploreResult(exploreData);
    }
  }, [exploreData, onExploreResult]);

  // Explore click handler — convert click coords to SVG space
  const handleExploreClick = useCallback(
    (e: React.MouseEvent) => {
      if (interactionContext !== "explore") return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("[data-interactive]")) return;
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Convert client coords to viewBox coords
      const viewBoxX = ((e.clientX - rect.left) / rect.width) * dimensions.width;
      const viewBoxY = ((e.clientY - rect.top) / rect.height) * dimensions.height;

      // Invert the zoom+pan transform: style transform is scale(zoom) translate(panOffset)
      // with transformOrigin at (originX, originY)
      const svgX = (viewBoxX - originX * (1 - zoom) - panOffset.x * zoom) / zoom;
      const svgY = (viewBoxY - originY * (1 - zoom) - panOffset.y * zoom) / zoom;

      onExploreClick({ x: svgX, y: svgY });
    },
    [interactionContext, dimensions, zoom, panOffset, originX, originY, onExploreClick]
  );

  // Label drag handler — works for any label type via string key
  const handleLabelDragStart = useCallback(
    (e: React.MouseEvent, key: string, labelX: number, labelY: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = dimensions.width / rect.width;
      const scaleY = dimensions.height / rect.height;
      // Convert label SVG coords to screen-relative offset accounting for zoom+pan
      setDraggingId(key);
      setDragOffset({
        x: e.clientX * scaleX - labelX,
        y: e.clientY * scaleY - labelY,
      });
      e.preventDefault();
    },
    [dimensions]
  );

  // Pan handlers
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      if (draggingId !== null || e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest("button") || target.closest("[data-interactive]"))
        return;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY };
      panStartOffsetRef.current = { ...panOffset };
    },
    [draggingId, panOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Label dragging
      if (draggingId !== null && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = dimensions.width / rect.width;
        const scaleY = dimensions.height / rect.height;
        setDraggedPositions((prev) => ({
          ...prev,
          [draggingId]: {
            x: e.clientX * scaleX - dragOffset.x,
            y: e.clientY * scaleY - dragOffset.y,
          },
        }));
        return;
      }
      // Map panning
      if (isPanning) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPanOffset({
          x: panStartOffsetRef.current.x + dx / zoom,
          y: panStartOffsetRef.current.y + dy / zoom,
        });
      }
    },
    [draggingId, dragOffset, dimensions, isPanning, zoom]
  );

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
    setIsPanning(false);
  }, []);

  // Scroll wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) onZoomIn();
      else onZoomOut();
    },
    [onZoomIn, onZoomOut]
  );

  if (!xScale || !yScale || !pathGen) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No data to display
      </div>
    );
  }

  const cursorStyle = isPanning
    ? "grabbing"
    : draggingId !== null
      ? "grabbing"
      : interactionContext === "explore"
        ? "crosshair"
        : "grab";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-white"
      style={{ cursor: cursorStyle }}
      onClick={handleExploreClick}
      onMouseDown={handlePanStart}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
      >
        <g
          transform={`translate(${panOffset.x}, ${panOffset.y})`}
          style={{
            transform: `scale(${zoom}) translate(${panOffset.x}px, ${panOffset.y}px)`,
            transformOrigin: transformOriginPx,
          }}
        >
          {/* Contour regions */}
          {showContours && contours.map((contour, i) => {
            const isRadar10 = viewSource === "radar10";
            // For radar10: log-normalized density so colors are stable regardless of threshold count
            // For pipeline: linear density-based t
            let t: number;
            if (isRadar10 && densityExtent[1] > densityExtent[0]) {
              const logDMin = Math.log(Math.max(densityExtent[0], 1e-10));
              const logDMax = Math.log(Math.max(densityExtent[1], 1e-9));
              const logVal = Math.log(Math.max(contour.value, 1e-10));
              t = Math.max(0, Math.min(1, (logVal - logDMin) / (logDMax - logDMin)));
            } else {
              t = (contour.value - densityExtent[0]) / (densityExtent[1] - densityExtent[0]);
            }

            let fill: string;
            let stroke: string;
            let strokeWidth: number;

            if (!isRadar10) {
              // Pipeline view
              fill = contourFillColor(t);
              stroke = contourStrokeColor(t);
              strokeWidth = 0.6;
            } else if (showHeatmap) {
              // Radar 1.0 with heatmap colors
              const [r, g, b, a] = radar10ContourRGBA(t);
              fill = `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
              stroke = `rgb(${Math.round(r*0.9)},${Math.round(g*0.8)}, ${Math.round(b*0.8)})`
              strokeWidth = 0.5;
            } else {
              // Radar 1.0 lines only
              fill = "none";
              stroke = "rgba(50, 140, 230, 0.7)";
              strokeWidth = 0.4;
            }

            return (
              <path
                key={i}
                d={pathGen(contour) || ""}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap={isRadar10 ? "round" : undefined}
                strokeLinejoin={isRadar10 ? "round" : undefined}
              />
            );
          })}

          {/* Crosshair lines at (0,0) */}
          <line
            x1={0}
            y1={originY}
            x2={dimensions.width}
            y2={originY}
            stroke="rgba(150, 160, 180, 0.5)"
            strokeWidth={1}
          />
          <line
            x1={originX}
            y1={0}
            x2={originX}
            y2={dimensions.height}
            stroke="rgba(150, 160, 180, 0.5)"
            strokeWidth={1}
          />

          {/* Percentage circles at 20%, 40%, 60%, 80% from (0,0) */}
          {[0.2, 0.4, 0.6, 0.8].map((pct) => {
            const r = maxRadius * pct;
            const label = `${Math.round(pct * 100)}%`;
            return (
              <g key={pct}>
                <circle
                  cx={originX}
                  cy={originY}
                  r={r}
                  fill="none"
                  stroke="rgba(150, 160, 180, 0.5)"
                  strokeWidth={0.8}
                  strokeDasharray="4,4"
                />
                <text
                  x={originX}
                  y={originY + r + 14}
                  textAnchor="middle"
                  fill="rgba(100, 110, 130, 0.7)"
                  fontSize={11}
                  fontFamily="sans-serif"
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Area boundary hulls — all shown in keyAreas context */}
          {interactionContext === "keyAreas" && Object.values(areas).map((area) => {
            const path = areaHulls[area.id];
            if (!path) return null;
            const isOverview = selectedArea == null;
            const isSelected = area.id === selectedArea;
            // Overview: all hulls equal emphasis; selected: one emphasized, rest faint
            const emphasized = isOverview || isSelected;
            return (
              <path
                key={`area-hull-${area.id}`}
                d={path}
                fill={emphasized ? "rgba(99, 102, 241, 0.08)" : "rgba(99, 102, 241, 0.02)"}
                stroke={emphasized ? "rgba(99, 102, 241, 0.5)" : "rgba(99, 102, 241, 0.2)"}
                strokeWidth={emphasized ? 1.5 : 1}
                strokeDasharray={isSelected ? "none" : "6 3"}
                style={{ cursor: "pointer" }}
                data-interactive
                onClick={() => onSelectArea(area.id)}
              />
            );
          })}

          {/* Hot area boundaries — all shown in hotAreas context, biggest emphasized */}
          {interactionContext === "hotAreas" && sortedHotAreaIds.map((haId) => {
            const ha = hotAreas[String(haId)];
            if (!ha) return null;
            const path = hotAreaPaths[ha.id];
            if (!path) return null;
            const isOverview = selectedHotArea == null;
            const isSelected = ha.id === selectedHotArea;
            const emphasized = isOverview || isSelected;
            return (
              <path
                key={`hot-area-${ha.id}`}
                d={path}
                fill={emphasized ? "rgba(245, 158, 11, 0.10)" : "rgba(245, 158, 11, 0.02)"}
                stroke={emphasized ? "rgba(245, 158, 11, 0.5)" : "rgba(245, 158, 11, 0.2)"}
                strokeWidth={emphasized ? 2 : 1}
                strokeDasharray={isSelected ? "none" : "6 4"}
                style={{ cursor: "pointer" }}
                data-interactive
                onClick={() => onSelectHotArea(ha.id)}
              />
            );
          })}

          {/* Currents: zone hulls + convergence visualization (not for signals) */}
          {interactionContext === "currents" && activeSignalId == null && (() => {
            // Determine involved zone IDs
            const involvedZoneIds = new Set<number>();
            if (currentsData) {
              if (activeConvergenceId != null) {
                // Single selection: zones from that region
                const cr = currentsData.convergence_regions.find((r) => r.id === activeConvergenceId);
                if (cr) cr.zone_ids.forEach((zid) => involvedZoneIds.add(Number(zid)));
              } else {
                // Overview: zones from all top 3 regions
                currentsData.convergence_regions.slice(0, 3).forEach((cr) => {
                  cr.zone_ids.forEach((zid) => involvedZoneIds.add(Number(zid)));
                });
              }
            }

            // Show all zone hulls — involved zones highlighted, others faint
            return Object.values(areas).map((area) => {
              const path = areaHulls[area.id];
              if (!path) return null;
              const isInvolved = involvedZoneIds.has(area.id);
              return (
                <path
                  key={`curr-zone-${area.id}`}
                  d={path}
                  fill={isInvolved ? "rgba(99, 102, 241, 0.08)" : "rgba(99, 102, 241, 0.02)"}
                  stroke={isInvolved ? "rgba(99, 102, 241, 0.45)" : "rgba(99, 102, 241, 0.15)"}
                  strokeWidth={isInvolved ? 1.5 : 1}
                  strokeDasharray="6 3"
                />
              );
            });
          })()}

          {/* Currents: convergence cluster highlights */}
          {interactionContext === "currents" && currentsData && (() => {
            // Signal mode: just the orange cluster dot (label handled by unified label system)
            if (activeSignalId != null) {
              const sig = currentsData.signals.find((s) => s.id === activeSignalId);
              if (!sig) return null;
              const cluster = clusters[String(sig.cluster_id)];
              if (!cluster) return null;
              const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
              const cx = xScale(centroid.x);
              const cy = yScale(centroid.y);
              const r = Math.max(3, Math.min(14, Math.sqrt(cluster.count) * 1.2));
              return (
                <g>
                  <circle cx={cx} cy={cy} r={r + 6} fill="rgba(234, 88, 12, 0.9)" opacity={0.12} />
                  <circle cx={cx} cy={cy} r={r} fill="rgba(234, 88, 12, 0.9)" opacity={0.7} stroke="white" strokeWidth={1} />
                </g>
              );
            }

            // Overview (no selection) or single selected convergence region
            const isOverview = activeConvergenceId == null;
            const visibleRegions = isOverview
              ? currentsData.convergence_regions.slice(0, 3)
              : currentsData.convergence_regions.filter((r) => r.id === activeConvergenceId);

            // Helper: build hull path for a set of cluster pixel positions
            const buildHull = (pixels: { cx: number; cy: number }[]) => {
              if (pixels.length < 3) return "";
              const gCx = pixels.reduce((s, p) => s + p.cx, 0) / pixels.length;
              const gCy = pixels.reduce((s, p) => s + p.cy, 0) / pixels.length;
              const pts: [number, number][] = pixels.map((p) => [p.cx, p.cy]);
              const hull = polygonHull(pts);
              if (!hull) return "";
              const padding = 8;
              const padded = hull.map(([px, py]: [number, number]) => {
                const dx = px - gCx;
                const dy = py - gCy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const scale = dist > 0 ? (dist + padding) / dist : 1;
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
              <g>
                {visibleRegions.map((cr) => {
                  const clusterPixels: { id: number; cx: number; cy: number; r: number }[] = [];
                  for (const cid of cr.cluster_ids) {
                    const cluster = clusters[String(cid)];
                    if (!cluster) continue;
                    const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
                    clusterPixels.push({
                      id: cid,
                      cx: xScale(centroid.x),
                      cy: yScale(centroid.y),
                      r: Math.max(3, Math.min(14, Math.sqrt(cluster.count) * 1.2)),
                    });
                  }
                  if (clusterPixels.length === 0) return null;
                  const hullPath = buildHull(clusterPixels);

                  return (
                    <g key={`curr-region-${cr.id}`}>
                      {hullPath && (
                        <path
                          d={hullPath}
                          fill="rgba(220, 38, 38, 0.06)"
                          stroke="rgba(220, 38, 38, 0.3)"
                          strokeWidth={1.5}
                          strokeDasharray="6 3"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Explore mode: selected contour boundary */}
          {interactionContext === "explore" && exploreData && (
            <>
              <path
                d={exploreData.path}
                fill="rgba(5, 150, 105, 0.08)"
                stroke="rgba(5, 150, 105, 0.7)"
                strokeWidth={2.5}
              />
              {exploreClickPx && (
                <circle
                  cx={exploreClickPx.x}
                  cy={exploreClickPx.y}
                  r={4}
                  fill="rgba(5, 150, 105, 0.8)"
                  stroke="white"
                  strokeWidth={1.5}
                />
              )}
            </>
          )}

          {/* Player patent dots + density circle */}
          {interactionContext === "players" && selectedPlayers.map((player) => {
            // Filter patents by year if selected
            const visiblePatents = selectedYear != null
              ? player.patents.filter((p) => p.year === selectedYear)
              : player.patents;

            // Hide player entirely if selected year has 0 patents
            if (selectedYear != null && visiblePatents.length === 0) return null;

            // Use year-specific dense center/radius
            const yearData = selectedYear != null
              ? player.yearlyData.find((d) => d.year === selectedYear)
              : null;
            const center = yearData && yearData.count > 0 ? yearData.center : player.center;
            const radius = yearData && yearData.count > 1 ? yearData.radius : player.radius;

            return (
              <g key={player.name}>
                {/* Density circle */}
                <PlayerShadow
                  name={player.name}
                  color={player.color}
                  center={center}
                  radius={radius}
                  xScale={xScale}
                  yScale={yScale}
                  showLabel={true}
                  opacity={0.3}
                />

                {/* Individual patent dots */}
                {visiblePatents.map((p) => (
                  <circle
                    key={p.index}
                    cx={xScale(p.x)}
                    cy={yScale(p.y)}
                    r={2.5}
                    fill={player.color}
                    opacity={0.7}
                    stroke="white"
                    strokeWidth={0.5}
                  />
                ))}
              </g>
            );
          })}

          {/* Saved layers overlay — visible when not in focus mode, or always when in layers tab */}
          {savedLayers.length > 0 && (interactionContext === "layers" || !focusMode) && (() => {
            // Skip layers whose section is currently the active interaction context (avoid doubling)
            const sectionToContext: Record<string, string> = {
              keyAreas: "keyAreas", hotAreas: "hotAreas",
              convergence: "currents", signal: "currents",
              explore: "explore", players: "players",
            };
            const visibleLayers = savedLayers.filter((l) =>
              l.visible && (interactionContext === "layers" || sectionToContext[l.section] !== interactionContext
                // Always show saved explore areas even when in explore tab (they're distinct from current selection)
                || l.section === "explore")
            );
            return visibleLayers.map((layer) => {
              if (layer.section === "keyAreas") {
                const path = areaHulls[layer.itemId as number];
                if (!path) return null;
                return (
                  <path
                    key={`saved-${layer.id}`}
                    d={path}
                    fill="rgba(99, 102, 241, 0.06)"
                    stroke="rgba(99, 102, 241, 0.4)"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                );
              }
              if (layer.section === "hotAreas") {
                const path = hotAreaPaths[layer.itemId as number];
                if (!path) return null;
                return (
                  <path
                    key={`saved-${layer.id}`}
                    d={path}
                    fill="rgba(245, 158, 11, 0.06)"
                    stroke="rgba(245, 158, 11, 0.4)"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                );
              }
              if (layer.section === "convergence" && currentsData) {
                const cr = currentsData.convergence_regions.find((c) => c.id === layer.itemId);
                if (!cr) return null;
                // Show zone hulls for the convergence region
                return (
                  <g key={`saved-${layer.id}`}>
                    {cr.zone_ids.map((zid) => {
                      const path = areaHulls[Number(zid)];
                      if (!path) return null;
                      return (
                        <path
                          key={`saved-cr-zone-${zid}`}
                          d={path}
                          fill="rgba(239, 68, 68, 0.04)"
                          stroke="rgba(239, 68, 68, 0.3)"
                          strokeWidth={1}
                          strokeDasharray="6 3"
                        />
                      );
                    })}
                  </g>
                );
              }
              if (layer.section === "signal" && currentsData) {
                const sig = currentsData.signals.find((s) => s.id === layer.itemId);
                if (!sig) return null;
                const cluster = clusters[String(sig.cluster_id)];
                if (!cluster) return null;
                const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
                const cx = xScale(centroid.x);
                const cy = yScale(centroid.y);
                const r = Math.max(3, Math.min(14, Math.sqrt(cluster.count) * 1.2));
                return (
                  <g key={`saved-${layer.id}`}>
                    <circle cx={cx} cy={cy} r={r + 4} fill="rgba(234, 88, 12, 0.15)" />
                    <circle cx={cx} cy={cy} r={r} fill="rgba(234, 88, 12, 0.6)" stroke="white" strokeWidth={1} />
                  </g>
                );
              }
              if (layer.section === "explore" && layer.exploreData) {
                return (
                  <path
                    key={`saved-${layer.id}`}
                    d={layer.exploreData.path}
                    fill="rgba(5, 150, 105, 0.06)"
                    stroke="rgba(5, 150, 105, 0.5)"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                );
              }
              // Players — skip for now (no full circle yet)
              return null;
            });
          })()}

          {/* Cluster centroid dots */}
          {showClusters && Object.values(clusters).map((cluster) => {
            const centroid =
              dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
            const cx = xScale(centroid.x);
            const cy = yScale(centroid.y);
            const areaEntry = Object.values(areas).find((a) =>
              a.cluster_ids?.includes(cluster.id)
            );
            const areaId = areaEntry?.id ?? -1;
            const isActive = areaId !== -1 && areaId === highlightedArea;
            const r = Math.max(1.7, Math.min(12, Math.sqrt(cluster.count) * 0.8));
            return (
              <circle
                key={`cl-${cluster.id}`}
                cx={cx}
                cy={cy}
                r={r}
                fill={isActive ? "rgba(99, 102, 241, 0.8)" : "rgba(50, 140, 230, 0.65)"}
                stroke="none"
              />
            );
          })}

          {/* Currents: arrows from zones to convergence (rendered on top of cluster dots) */}
          {interactionContext === "currents" && currentsData && activeSignalId == null && (() => {
            const isOverview = activeConvergenceId == null;
            const visibleRegions = isOverview
              ? currentsData.convergence_regions.slice(0, 3)
              : currentsData.convergence_regions.filter((r) => r.id === activeConvergenceId);

            return (
              <g>
                <defs>
                  <marker id="current-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                    <path d="M 0 0 L 8 3 L 0 6 L 2 3 Z" fill="rgba(220, 38, 38, 0.5)" />
                  </marker>
                </defs>
                {visibleRegions.map((cr) => {
                  // Compute convergence center from cluster positions
                  const clusterPositions: { cx: number; cy: number }[] = [];
                  for (const cid of cr.cluster_ids) {
                    const cluster = clusters[String(cid)];
                    if (!cluster) continue;
                    const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
                    clusterPositions.push({ cx: xScale(centroid.x), cy: yScale(centroid.y) });
                  }
                  if (clusterPositions.length === 0) return null;
                  const crCx = clusterPositions.reduce((s, p) => s + p.cx, 0) / clusterPositions.length;
                  const crCy = clusterPositions.reduce((s, p) => s + p.cy, 0) / clusterPositions.length;

                  return cr.zone_ids.map((zid) => {
                    const zone = areas[String(zid)];
                    if (!zone) return null;
                    const zCx = xScale(zone.centroid.x);
                    const zCy = yScale(zone.centroid.y);
                    const sx = zCx + (crCx - zCx) * 0.1;
                    const sy = zCy + (crCy - zCy) * 0.1;
                    const ex = zCx + (crCx - zCx) * 0.9;
                    const ey = zCy + (crCy - zCy) * 0.9;
                    const mx = (sx + ex) / 2;
                    const my = (sy + ey) / 2;
                    const dx = ex - sx;
                    const dy = ey - sy;
                    const len = Math.hypot(dx, dy);
                    if (len < 10) return null;
                    const perpX = -dy / len * len * 0.15;
                    const perpY = dx / len * len * 0.15;
                    return (
                      <path
                        key={`arrow-${cr.id}-${zid}`}
                        d={`M ${sx} ${sy} Q ${mx + perpX} ${my + perpY}, ${ex} ${ey}`}
                        fill="none"
                        stroke="rgba(220, 38, 38, 0.35)"
                        strokeWidth={2}
                        strokeLinecap="round"
                        markerEnd="url(#current-arrow)"
                      />
                    );
                  });
                })}
              </g>
            );
          })()}

          {/* ── SVG Labels: leader line + draggable tag for all contexts ── */}
          {(() => {
            type LabelDef = { key: string; cx: number; cy: number; labelX: number; labelY: number; title: string; sub: string; borderColor: string; textColor: string };
            const labels: LabelDef[] = [];
            // Helper: push label outward from a reference center by a fixed distance
            const pushOut = (cx: number, cy: number, refX: number, refY: number, dist: number) => {
              const dx = cx - refX;
              const dy = cy - refY;
              const d = Math.hypot(dx, dy);
              if (d < 1) return { labelX: cx, labelY: cy - dist };
              return { labelX: cx + (dx / d) * dist, labelY: cy + (dy / d) * dist };
            };

            // Compute content center (average of all area centroids) for balanced spreading
            const allAreaCentroids = Object.values(areas).map((a) => defaultLabelPositions[a.id]).filter(Boolean);
            const contentCx = allAreaCentroids.length > 0
              ? allAreaCentroids.reduce((s, p) => s + p.cx, 0) / allAreaCentroids.length
              : dimensions.width / 2;
            const contentCy = allAreaCentroids.length > 0
              ? allAreaCentroids.reduce((s, p) => s + p.cy, 0) / allAreaCentroids.length
              : dimensions.height / 2;

            if (interactionContext === "keyAreas") {
              const showAll = selectedArea == null;
              const visible = showAll ? Object.values(areas) : Object.values(areas).filter((a) => a.id === selectedArea);
              for (const area of visible) {
                const defPos = defaultLabelPositions[area.id];
                if (!defPos) continue;
                const pushed = pushOut(defPos.cx, defPos.cy, contentCx, contentCy, showAll ? 140 : 100);
                labels.push({
                  key: `zone-${area.id}`,
                  cx: defPos.cx, cy: defPos.cy,
                  labelX: pushed.labelX, labelY: pushed.labelY,
                  title: area.label,
                  sub: `${area.cluster_count} clusters · ${area.patent_count} patents`,
                  borderColor: "rgba(99,102,241,0.5)", textColor: "#4f46e5",
                });
              }
            }

            if (interactionContext === "hotAreas") {
              const showAll = selectedHotArea == null;
              const visibleIds = showAll ? sortedHotAreaIds : sortedHotAreaIds.filter((id) => id === selectedHotArea);
              // Content center for hot areas
              const haCentroids = visibleIds.map((id) => hotAreas[String(id)]).filter(Boolean);
              const haRefX = haCentroids.length > 0
                ? haCentroids.reduce((s, ha) => s + xScale(ha.centroid.x), 0) / haCentroids.length
                : contentCx;
              const haRefY = haCentroids.length > 0
                ? haCentroids.reduce((s, ha) => s + yScale(ha.centroid.y), 0) / haCentroids.length
                : contentCy;
              for (const haId of visibleIds) {
                const ha = hotAreas[String(haId)];
                if (!ha) continue;
                const cx = xScale(ha.centroid.x);
                const cy = yScale(ha.centroid.y);
                const pushed = pushOut(cx, cy, haRefX, haRefY, showAll ? 130 : 90);
                labels.push({
                  key: `hot-${ha.id}`,
                  cx, cy,
                  labelX: pushed.labelX, labelY: pushed.labelY,
                  title: ha.label,
                  sub: `${ha.cluster_count} clusters · ${ha.patent_count} patents`,
                  borderColor: "rgba(245,158,11,0.5)", textColor: "#d97706",
                });
              }
            }

            if (interactionContext === "currents" && currentsData) {
              const isOverview = activeConvergenceId == null && activeSignalId == null;
              if (isOverview) {
                const crList = currentsData.convergence_regions.slice(0, 3);
                const crRefX = crList.reduce((s, cr) => s + xScale(cr.center.x), 0) / crList.length;
                const crRefY = crList.reduce((s, cr) => s + yScale(cr.center.y), 0) / crList.length;
                for (const cr of crList) {
                  const cx = xScale(cr.center.x);
                  const cy = yScale(cr.center.y);
                  const pushed = pushOut(cx, cy, crRefX, crRefY, 120);
                  labels.push({
                    key: `curr-${cr.id}`,
                    cx, cy,
                    labelX: pushed.labelX, labelY: pushed.labelY,
                    title: cr.name,
                    sub: `${cr.cluster_count} clusters · ${cr.zone_names.length} zones`,
                    borderColor: "rgba(220,38,38,0.5)", textColor: "#b91c1c",
                  });
                }
              } else if (activeConvergenceId != null) {
                const cr = currentsData.convergence_regions.find((r) => r.id === activeConvergenceId);
                if (cr) {
                  const convCx = xScale(cr.center.x);
                  const convCy = yScale(cr.center.y);
                  for (const zid of cr.zone_ids) {
                    const area = areas[zid];
                    if (!area) continue;
                    const zoneCx = xScale(area.centroid.x);
                    const zoneCy = yScale(area.centroid.y);
                    const pushed = pushOut(zoneCx, zoneCy, convCx, convCy, 100);
                    labels.push({
                      key: `curr-zone-${zid}`,
                      cx: zoneCx, cy: zoneCy,
                      labelX: pushed.labelX, labelY: pushed.labelY,
                      title: area.label, sub: "",
                      borderColor: "rgba(99,102,241,0.5)", textColor: "#4f46e5",
                    });
                  }
                }
              } else if (activeSignalId != null) {
                // Signal label: "Cluster X" + cluster name, alternate left/right
                const sig = currentsData.signals.find((s) => s.id === activeSignalId);
                if (sig) {
                  const cluster = clusters[String(sig.cluster_id)];
                  if (cluster) {
                    const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
                    const cx = xScale(centroid.x);
                    const cy = yScale(centroid.y);
                    // Alternate: even index → right, odd → left
                    const sigIdx = currentsData.signals.findIndex((s) => s.id === activeSignalId);
                    const side = sigIdx % 2 === 0 ? 1 : -1;
                    labels.push({
                      key: `signal-${sig.id}`,
                      cx, cy,
                      labelX: cx + side * 100,
                      labelY: cy,
                      title: `Cluster ${sig.cluster_id}`,
                      sub: cluster.label,
                      borderColor: "rgba(234,88,12,0.5)", textColor: "#c2410c",
                    });
                  }
                }
              }
            }

            // Explore mode: show label when AI has generated a name
            if (interactionContext === "explore" && exploreLabel && exploreClickPx) {
              const cx = exploreClickPx.x;
              const cy = exploreClickPx.y;
              const pushed = pushOut(cx, cy, contentCx, contentCy, 100);
              labels.push({
                key: "explore-area",
                cx, cy,
                labelX: pushed.labelX, labelY: pushed.labelY,
                title: exploreLabel.name,
                sub: `${exploreLabel.clusters} clusters · ${exploreLabel.patents} patents`,
                borderColor: "rgba(5,150,105,0.5)", textColor: "#059669",
              });
            }

            // Saved layer labels — show when not in focus mode or in layers tab
            if (savedLayers.length > 0 && (interactionContext === "layers" || !focusMode)) {
              const sectionToCtx: Record<string, string> = {
                keyAreas: "keyAreas", hotAreas: "hotAreas",
                convergence: "currents", signal: "currents",
                explore: "explore", players: "players",
              };
              for (const layer of savedLayers.filter((l) =>
                l.visible && (interactionContext === "layers" || sectionToCtx[l.section] !== interactionContext
                  || l.section === "explore")
              )) {
                let cx = 0, cy = 0, title = "", sub = "";
                let borderColor = "rgba(100,100,100,0.4)", textColor = "#666";

                if (layer.section === "keyAreas") {
                  const area = areas[String(layer.itemId)];
                  if (!area) continue;
                  const defPos = defaultLabelPositions[area.id];
                  if (!defPos) continue;
                  cx = defPos.cx; cy = defPos.cy;
                  title = area.label;
                  sub = `${area.cluster_count} clusters · ${area.patent_count} patents`;
                  borderColor = "rgba(99,102,241,0.5)"; textColor = "#4338ca";
                } else if (layer.section === "hotAreas") {
                  const ha = hotAreas[String(layer.itemId)];
                  if (!ha) continue;
                  cx = xScale(ha.centroid.x); cy = yScale(ha.centroid.y);
                  title = ha.label;
                  sub = `${ha.cluster_count} clusters · ${ha.patent_count} patents`;
                  borderColor = "rgba(245,158,11,0.5)"; textColor = "#b45309";
                } else if (layer.section === "convergence" && currentsData) {
                  const cr = currentsData.convergence_regions.find((c) => c.id === layer.itemId);
                  if (!cr) continue;
                  cx = xScale(cr.center.x); cy = yScale(cr.center.y);
                  title = cr.name;
                  sub = `${cr.cluster_count} clusters · ${cr.total_patents} patents`;
                  borderColor = "rgba(239,68,68,0.5)"; textColor = "#b91c1c";
                } else if (layer.section === "signal" && currentsData) {
                  const sig = currentsData.signals.find((s) => s.id === layer.itemId);
                  if (!sig) continue;
                  const cluster = clusters[String(sig.cluster_id)];
                  if (!cluster) continue;
                  const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
                  cx = xScale(centroid.x); cy = yScale(centroid.y);
                  title = sig.name;
                  sub = `${sig.cluster_count} patents`;
                  borderColor = "rgba(234,88,12,0.5)"; textColor = "#c2410c";
                } else if (layer.section === "explore" && layer.exploreData) {
                  // Use center of path - approximate from first coordinate
                  const pathMatch = layer.exploreData.path.match(/M\s*([\d.]+)\s+([\d.]+)/);
                  if (!pathMatch) continue;
                  cx = parseFloat(pathMatch[1]); cy = parseFloat(pathMatch[2]);
                  title = layer.exploreData.name;
                  sub = `${layer.exploreData.clusterCount} clusters · ${layer.exploreData.patentCount} patents`;
                  borderColor = "rgba(5,150,105,0.5)"; textColor = "#059669";
                } else {
                  continue;
                }

                const pushed = pushOut(cx, cy, contentCx, contentCy, 120);
                labels.push({
                  key: `saved-label-${layer.id}`,
                  cx, cy,
                  labelX: pushed.labelX, labelY: pushed.labelY,
                  title, sub, borderColor, textColor,
                });
              }
            }

            // Repulsion pass: push overlapping labels apart
            const minDist = 40;
            for (let iter = 0; iter < 5; iter++) {
              for (let i = 0; i < labels.length; i++) {
                for (let j = i + 1; j < labels.length; j++) {
                  // Skip labels that have been manually dragged
                  if (draggedPositions[labels[i].key] || draggedPositions[labels[j].key]) continue;
                  const dx = labels[j].labelX - labels[i].labelX;
                  const dy = labels[j].labelY - labels[i].labelY;
                  const dist = Math.hypot(dx, dy);
                  if (dist < minDist && dist > 0) {
                    const push = (minDist - dist) / 2;
                    const ux = dx / dist;
                    const uy = dy / dist;
                    labels[i].labelX -= ux * push;
                    labels[i].labelY -= uy * push;
                    labels[j].labelX += ux * push;
                    labels[j].labelY += uy * push;
                  }
                }
              }
            }

            // Render labels with leader lines — all in SVG
            return labels.map((lb) => {
              const pos = getLabelPos(lb.key, lb);
              // Measure text for rect sizing (approximate: 6px per char at 10px font)
              const titleW = lb.title.length * 5.5 + 16;
              const subW = lb.sub ? lb.sub.length * 4.5 + 16 : 0;
              const boxW = Math.max(titleW, subW, 60);
              const boxH = lb.sub ? 30 : 18;
              return (
                <g key={lb.key}>
                  {/* Leader line */}
                  <line
                    x1={pos.cx} y1={pos.cy}
                    x2={pos.labelX} y2={pos.labelY}
                    stroke={lb.borderColor}
                    strokeWidth={1.8}
                    strokeDasharray="6 4"
                  />
                  <circle cx={pos.cx} cy={pos.cy} r={5} fill={lb.borderColor} stroke="white" strokeWidth={1.5} />
                  {/* Label background */}
                  <rect
                    x={pos.labelX - boxW / 2} y={pos.labelY - boxH / 2}
                    width={boxW} height={boxH}
                    rx={4} ry={4}
                    fill="white" fillOpacity={0.95}
                    stroke={lb.borderColor} strokeWidth={1}
                    style={{ cursor: "grab" }}
                    data-interactive
                    onMouseDown={(e) => handleLabelDragStart(e, lb.key, pos.labelX, pos.labelY)}
                  />
                  {/* Label text */}
                  <text
                    x={pos.labelX} y={lb.sub ? pos.labelY - 3 : pos.labelY + 3.5}
                    textAnchor="middle"
                    fontSize={10} fontWeight={600} fontFamily="system-ui, sans-serif"
                    fill={lb.textColor}
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {lb.title}
                  </text>
                  {lb.sub && (
                    <text
                      x={pos.labelX} y={pos.labelY + 10}
                      textAnchor="middle"
                      fontSize={8.5} fontFamily="system-ui, sans-serif"
                      fill="#888"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {lb.sub}
                    </text>
                  )}
                </g>
              );
            });
          })()}
        </g>
      </svg>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-1">
        <button
          onClick={onZoomIn}
          data-interactive
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={onZoomOut}
          data-interactive
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={() => {
            onZoomReset();
            setPanOffset({ x: 0, y: 0 });
          }}
          data-interactive
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
          title="Reset view"
        >
          <RotateCcw size={16} />
        </button>
        <button
          onClick={() => setPanOffset({ x: 0, y: 0 })}
          data-interactive
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
          title="Reset pan"
        >
          <Hand size={16} />
        </button>
        <div className="w-full border-t border-gray-200 my-1" />
        {/* Contour lines toggle */}
        {viewSource === "radar10" && (
          <button
            onClick={() => setShowContoursOverride((v) => v == null ? !showContours : !v)}
            data-interactive
            className={`p-2 rounded shadow border border-gray-200 ${
              showContours ? "bg-white hover:bg-gray-50" : "bg-gray-100 hover:bg-gray-200"
            }`}
            title={showContours ? "Hide contour lines" : "Show contour lines"}
          >
            <Layers size={16} />
          </button>
        )}
        {/* Cluster dots toggle */}
        <button
          onClick={() => setShowClustersOverride((v) => v == null ? !showClusters : !v)}
          data-interactive
          className={`p-2 rounded shadow border border-gray-200 ${
            showClusters ? "bg-white hover:bg-gray-50" : "bg-gray-100 hover:bg-gray-200"
          }`}
          title={showClusters ? "Hide clusters" : "Show clusters"}
        >
          {showClusters ? <CircleDot size={16} /> : <CircleDotDashed size={16} />}
        </button>
        {/* Heatmap colors toggle */}
        {viewSource === "radar10" && (
          <button
            onClick={() => setShowHeatmapOverride((v) => v == null ? !showHeatmap : !v)}
            data-interactive
            className={`p-2 rounded shadow border border-gray-200 ${
              showHeatmap ? "bg-orange-50 hover:bg-orange-100 border-orange-300" : "bg-white hover:bg-gray-50"
            }`}
            title={showHeatmap ? "Hide heatmap colors" : "Show heatmap colors"}
          >
            <Thermometer size={16} />
          </button>
        )}
        {/* Focus mode — hide saved layers for clean exploration */}
        {savedLayers.length > 0 && (
          <>
            <div className="w-full border-t border-gray-200 my-1" />
            <button
              onClick={onToggleFocusMode}
              data-interactive
              className={`p-2 rounded shadow border border-gray-200 ${
                focusMode ? "bg-blue-50 hover:bg-blue-100 border-blue-300" : "bg-white hover:bg-gray-50"
              }`}
              title={focusMode ? "Show saved layers (Focus mode ON)" : "Hide saved layers (Focus mode)"}
            >
              <Eye size={16} className={focusMode ? "text-blue-600" : ""} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
