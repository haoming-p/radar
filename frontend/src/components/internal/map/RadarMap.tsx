import { useState, useMemo, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { scaleLinear } from "d3-scale";
import { contourDensity } from "d3-contour";
import { geoPath } from "d3-geo";

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

interface RadarMapProps {
  patents: PatentPoint[];
  clusters: Record<string, ClusterInfo>;
  areas: Record<string, AreaInfo>;
  dimMethod: DimMethod;
  highlightedArea: number | null;
  onHighlightArea: (id: number | null) => void;
  onSelectArea: (id: number) => void;
  dimensions: { width: number; height: number };
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}

// ============ CONTOUR LINE COLOR ============

function getContourStroke(value: number, extent: number[]): string {
  const t = (value - extent[0]) / (extent[1] - extent[0]);

  // Purple-blue gradient for contour lines (like radar 1.0)
  if (t < 0.2) return "rgba(180, 180, 220, 0.3)";
  if (t < 0.4) return "rgba(140, 150, 200, 0.4)";
  if (t < 0.6) return "rgba(100, 120, 190, 0.5)";
  if (t < 0.8) return "rgba(70, 100, 180, 0.6)";
  return "rgba(50, 80, 170, 0.7)";
}

function getContourFill(value: number, extent: number[]): string {
  const t = (value - extent[0]) / (extent[1] - extent[0]);

  // Very subtle fill only at higher density levels
  if (t < 0.5) return "none";
  if (t < 0.7) return "rgba(140, 180, 220, 0.05)";
  if (t < 0.85) return "rgba(100, 170, 140, 0.08)";
  return "rgba(120, 180, 80, 0.12)";
}

// ============ COMPONENT ============

export default function RadarMap({
  patents,
  clusters,
  areas,
  dimMethod,
  highlightedArea,
  onHighlightArea,
  onSelectArea,
  dimensions,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedPositions, setDraggedPositions] = useState<
    Record<number, { x: number; y: number }>
  >({});

  // Get cluster positions based on selected dim method
  const clusterPoints = useMemo(() => {
    return Object.values(clusters).map((c) => {
      const centroid = dimMethod === "tsne" ? c.centroid_tsne : c.centroid_umap;
      return { x: centroid.x, y: centroid.y, count: c.count, id: c.id };
    });
  }, [clusters, dimMethod]);

  // Compute scales + contours from cluster centroids
  const { xScale, yScale, contours, pathGen } = useMemo(() => {
    if (clusterPoints.length === 0) {
      return { xScale: null, yScale: null, contours: [], pathGen: null };
    }

    const padding = 60;
    const xs = clusterPoints.map((p) => p.x);
    const ys = clusterPoints.map((p) => p.y);
    const xExtent = [Math.min(...xs), Math.max(...xs)];
    const yExtent = [Math.min(...ys), Math.max(...ys)];
    const xPad = (xExtent[1] - xExtent[0]) * 0.12;
    const yPad = (yExtent[1] - yExtent[0]) * 0.12;

    const xS = scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([padding, dimensions.width - padding]);

    const yS = scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([dimensions.height - padding, padding]);

    // Generate weighted points for contour density (repeat by count)
    const weightedPoints: { x: number; y: number }[] = [];
    for (const cp of clusterPoints) {
      for (let i = 0; i < cp.count; i++) {
        weightedPoints.push({ x: cp.x, y: cp.y });
      }
    }

    // Small bandwidth so each cluster gets its own contour rings (like radar 1.0)
    const contourGen = contourDensity<{ x: number; y: number }>()
      .x((d) => xS(d.x))
      .y((d) => yS(d.y))
      .size([dimensions.width, dimensions.height])
      .bandwidth(4)
      .thresholds(80);

    const c = contourGen(weightedPoints);
    const pg = geoPath();

    return { xScale: xS, yScale: yS, contours: c, pathGen: pg };
  }, [clusterPoints, dimensions]);

  const densityExtent = useMemo(() => {
    if (contours.length === 0) return [0, 1];
    const values = contours.map((c) => c.value);
    return [Math.min(...values), Math.max(...values)];
  }, [contours]);

  // Area label positions
  const defaultLabelPositions = useMemo(() => {
    if (!xScale || !yScale) return {};
    const mapCenterX = dimensions.width / 2;
    const mapCenterY = dimensions.height / 2;
    const positions: Record<
      number,
      { cx: number; cy: number; labelX: number; labelY: number }
    > = {};

    Object.values(areas).forEach((area) => {
      const cx = xScale(area.centroid.x);
      const cy = yScale(area.centroid.y);
      const angle = Math.atan2(cy - mapCenterY, cx - mapCenterX);
      const radius = 70;
      positions[area.id] = {
        cx,
        cy,
        labelX: cx + Math.cos(angle) * radius,
        labelY: cy + Math.sin(angle) * radius,
      };
    });
    return positions;
  }, [areas, xScale, yScale, dimensions]);

  const getLabelPosition = useCallback(
    (areaId: number) => {
      const def = defaultLabelPositions[areaId];
      if (!def) return null;
      const dragged = draggedPositions[areaId];
      if (dragged)
        return {
          cx: def.cx,
          cy: def.cy,
          labelX: dragged.x,
          labelY: dragged.y,
        };
      return def;
    },
    [defaultLabelPositions, draggedPositions]
  );

  // Drag handlers
  const handleDragStart = useCallback(
    (e: React.MouseEvent, areaId: number) => {
      if (!containerRef.current) return;
      const pos = getLabelPosition(areaId);
      if (!pos) return;
      const rect = containerRef.current.getBoundingClientRect();
      const scaleX = dimensions.width / rect.width;
      const scaleY = dimensions.height / rect.height;
      setDraggingId(areaId);
      setDragOffset({
        x: e.clientX * scaleX - pos.labelX,
        y: e.clientY * scaleY - pos.labelY,
      });
      e.preventDefault();
    },
    [getLabelPosition, dimensions]
  );

  const handleDragMove = useCallback(
    (e: React.MouseEvent) => {
      if (draggingId === null || !containerRef.current) return;
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
    },
    [draggingId, dragOffset, dimensions]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  if (!xScale || !yScale || !pathGen) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        No data to display
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-white"
      onMouseMove={handleDragMove}
      onMouseUp={handleDragEnd}
      onMouseLeave={handleDragEnd}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{ cursor: draggingId !== null ? "grabbing" : "default" }}
      >
        <g
          transform={`scale(${zoom}) translate(${(dimensions.width * (1 - zoom)) / (2 * zoom)}, ${(dimensions.height * (1 - zoom)) / (2 * zoom)})`}
        >
          {/* Contour lines — stroke only, like topographic map */}
          {contours.map((contour, i) => (
            <path
              key={i}
              d={pathGen(contour) || ""}
              fill={getContourFill(contour.value, densityExtent)}
              stroke={getContourStroke(contour.value, densityExtent)}
              strokeWidth={0.8}
            />
          ))}

          {/* Cluster centroid dots */}
          {Object.values(clusters).map((cluster) => {
            const centroid = dimMethod === "tsne" ? cluster.centroid_tsne : cluster.centroid_umap;
            const cx = xScale(centroid.x);
            const cy = yScale(centroid.y);
            // Find area membership
            const areaEntry = Object.values(areas).find((a) =>
              a.cluster_ids?.includes(cluster.id)
            );
            const areaId = areaEntry?.id ?? -1;
            const isHighlighted =
              highlightedArea !== null && areaId === highlightedArea;
            // Size: sqrt scale based on patent count
            const r = Math.max(2, Math.min(10, Math.sqrt(cluster.count) * 1.5));
            return (
              <circle
                key={`cl-${cluster.id}`}
                cx={cx}
                cy={cy}
                r={isHighlighted ? r * 1.3 : r}
                fill={
                  isHighlighted
                    ? "rgba(20, 50, 100, 0.85)"
                    : "rgba(30, 60, 130, 0.65)"
                }
                stroke="rgba(255, 255, 255, 0.6)"
                strokeWidth={0.5}
              />
            );
          })}

          {/* Area label leader lines */}
          {Object.values(areas).map((area) => {
            const pos = getLabelPosition(area.id);
            if (!pos) return null;
            const isHighlighted = highlightedArea === area.id;
            return (
              <g key={`area-line-${area.id}`}>
                <line
                  x1={pos.cx}
                  y1={pos.cy}
                  x2={pos.labelX}
                  y2={pos.labelY}
                  stroke="rgba(100, 100, 100, 0.4)"
                  strokeWidth={isHighlighted ? 1.5 : 1}
                  strokeDasharray="4 3"
                />
                <circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={isHighlighted ? 4 : 3}
                  fill="rgba(100, 100, 100, 0.5)"
                />
              </g>
            );
          })}
        </g>
      </svg>

      {/* HTML area labels (draggable) */}
      {Object.values(areas).map((area) => {
        const pos = getLabelPosition(area.id);
        if (!pos) return null;
        const isHighlighted = highlightedArea === area.id;

        const scaledX =
          pos.labelX * zoom + (dimensions.width * (1 - zoom)) / 2;
        const scaledY =
          pos.labelY * zoom + (dimensions.height * (1 - zoom)) / 2;

        return (
          <div
            key={`label-${area.id}`}
            className="absolute select-none"
            style={{
              left: `${(scaledX / dimensions.width) * 100}%`,
              top: `${(scaledY / dimensions.height) * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: isHighlighted ? 20 : 10,
              cursor: draggingId === area.id ? "grabbing" : "grab",
            }}
            onMouseDown={(e) => handleDragStart(e, area.id)}
            onMouseEnter={() => onHighlightArea(area.id)}
            onMouseLeave={() => onHighlightArea(null)}
            onClick={() => onSelectArea(area.id)}
          >
            <div
              className={`px-3 py-2 rounded text-xs font-semibold shadow-sm border transition-all ${
                isHighlighted
                  ? "bg-white border-gray-400 shadow-md"
                  : "bg-white/90 border-gray-200"
              }`}
              style={{ color: "#0d3356" }}
            >
              {area.label}
              <div className="text-[10px] font-normal text-gray-500 mt-0.5">
                {area.cluster_count} clusters · {area.patent_count} patents
              </div>
            </div>
          </div>
        );
      })}

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={onZoomIn}
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
        >
          <ZoomOut size={16} />
        </button>
        <button
          onClick={onZoomReset}
          className="p-2 bg-white rounded shadow hover:bg-gray-50 border border-gray-200"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  );
}
