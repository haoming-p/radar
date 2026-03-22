import { useState, useMemo, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import { ScaleLinear } from "d3-scale";
import { GeoPath, GeoPermissibleObjects } from "d3-geo";
import { ContourMultiPolygon } from "d3-contour";
import {
  MarketCategory,
  CATEGORY_CONFIG,
  AreaInfo,
  Point,
  AreaPoint,
  ViewMode,
} from "./StepAnalysisSpatial";
import DraggableLabel from "./DraggableLabel";
import PlayerShadow from "./PlayerShadow";
import { PlayerInfo } from "../sidebar/PlayersSection";

interface LabelPosition {
  x: number;
  y: number;
}

interface AnalysisMapProps {
  points: Point[];
  areaPoints: AreaPoint[];
  viewMode: ViewMode;
  labelsToShow: AreaInfo[];
  visibleCategories: Record<string, boolean>;
  visibleAreas: Record<number, boolean>;
  highlightedArea: number | null;
  dimensions: { width: number; height: number };
  zoom: number;
  xScale: ScaleLinear<number, number> | null;
  yScale: ScaleLinear<number, number> | null;
  contours: ContourMultiPolygon[];
  pathGenerator: GeoPath<unknown, GeoPermissibleObjects> | null;
  densityExtent: number[];
  draggedPositions: Record<number, LabelPosition>;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onHighlightArea: (id: number | null) => void;
  onToggleAreaVisibility: (id: number) => void;
  onExpandArea: (id: number) => void;
  onDragLabel: (id: number, position: LabelPosition) => void;
  // Player props
  selectedPlayers: PlayerInfo[];
  selectedYear: number | null;
  // Label editing props
  editedLabels: Record<number, string>;
  editedShortLabels: Record<number, string>;
  onEditLabel: (areaId: number, newLabel: string) => void;
  onEditShortLabel: (areaId: number, newShortLabel: string) => void;
}

export default function AnalysisMap({
  points,
  areaPoints,
  viewMode,
  labelsToShow,
  visibleCategories,
  visibleAreas,
  highlightedArea,
  dimensions,
  zoom,
  xScale,
  yScale,
  contours,
  pathGenerator,
  densityExtent,
  draggedPositions,
  onZoomIn,
  onZoomOut,
  onHighlightArea,
  onToggleAreaVisibility,
  onExpandArea,
  onDragLabel,
  // Player props
  selectedPlayers,
  selectedYear,
  // Label editing props
  editedLabels,
  editedShortLabels,
  onEditLabel,
  onEditShortLabel,
}: AnalysisMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drag state - handled at container level for smooth dragging
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Color scale for contours
  const getContourColor = (value: number): string => {
    const t =
      (value - densityExtent[0]) / (densityExtent[1] - densityExtent[0]);

    const colors = [
      { stop: 0.0, r: 200, g: 210, b: 240, a: 0.1 },
      { stop: 0.3, r: 100, g: 170, b: 220, a: 0.6 },
      { stop: 0.6, r: 100, g: 200, b: 120, a: 0.8 },
      { stop: 0.9, r: 230, g: 220, b: 50, a: 1 },
    ];

    for (let i = 0; i < colors.length - 1; i++) {
      if (t <= colors[i + 1].stop) {
        const c1 = colors[i];
        const c2 = colors[i + 1];
        const blend = (t - c1.stop) / (c2.stop - c1.stop);

        const r = Math.round(c1.r + (c2.r - c1.r) * blend);
        const g = Math.round(c1.g + (c2.g - c1.g) * blend);
        const b = Math.round(c1.b + (c2.b - c1.b) * blend);
        const a = c1.a + (c2.a - c1.a) * blend;

        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
      }
    }

    return `rgba(230, 220, 50, 0.9)`;
  };

  // Calculate default label positions based on area position on map
  const defaultLabelPositions = useMemo(() => {
    if (!xScale || !yScale) return {};

    const mapCenterX = dimensions.width / 2;
    const mapCenterY = dimensions.height / 2;
    
    // Label dimensions
    const labelWidth = 170;
    const labelHeight = 32;
    
    // Account for zoom - visible area shrinks when zoomed in
    const visibleWidth = dimensions.width / zoom;
    const visibleHeight = dimensions.height / zoom;
    const offsetX = (dimensions.width - visibleWidth) / 2;
    const offsetY = (dimensions.height - visibleHeight) / 2;
    
    // Boundaries with padding
    const padding = 20;
    const minX = offsetX + padding + labelWidth / 2;
    const maxX = offsetX + visibleWidth - padding - labelWidth / 2;
    const minY = offsetY + padding + labelHeight;
    const maxY = offsetY + visibleHeight - padding - 100; 

    const positions: Record<number, { cx: number; cy: number; labelX: number; labelY: number }> = {};

    labelsToShow.forEach((area) => {
      const cx = xScale(area.centroid.x);
      const cy = yScale(area.centroid.y);

      // Calculate angle from map center to area
      const angle = Math.atan2(cy - mapCenterY, cx - mapCenterX);

      const labelRadius = 55;
      const dx = Math.cos(angle) * labelRadius;
      const dy = Math.sin(angle) * labelRadius;

      // Calculate where label would end up - apply boundary checks
      const labelX = Math.max(minX, Math.min(maxX, cx + dx));
      const labelY = Math.max(minY, Math.min(maxY, cy + dy));

      positions[area.id] = { cx, cy, labelX, labelY };
    });

    return positions;
  }, [labelsToShow, xScale, yScale, dimensions, zoom]);

  // Get label position (dragged or default)
  const getLabelPosition = useCallback((areaId: number) => {
    const defaultPos = defaultLabelPositions[areaId];
    if (!defaultPos) return null;

    const dragged = draggedPositions[areaId];
    if (dragged) {
      return { 
        cx: defaultPos.cx, 
        cy: defaultPos.cy, 
        labelX: dragged.x, 
        labelY: dragged.y 
      };
    }

    return defaultPos;
  }, [defaultLabelPositions, draggedPositions]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent, areaId: number) => {
    if (!containerRef.current) return;
    
    const pos = getLabelPosition(areaId);
    if (!pos) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;
    
    setDraggingId(areaId);
    setDragOffset({
      x: (e.clientX - rect.left) * scaleX / zoom - pos.labelX,
      y: (e.clientY - rect.top) * scaleY / zoom - pos.labelY,
    });
  }, [getLabelPosition, dimensions, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (draggingId === null || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;

    const newX = (e.clientX - rect.left) * scaleX / zoom - dragOffset.x;
    const newY = (e.clientY - rect.top) * scaleY / zoom - dragOffset.y;

    onDragLabel(draggingId, { x: newX, y: newY });
  }, [draggingId, dragOffset, dimensions, zoom, onDragLabel]);

  const handleMouseUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  if (!xScale || !yScale) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">No data to display</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative bg-gray-100 overflow-hidden map-container"
      onMouseMove={draggingId !== null ? handleMouseMove : undefined}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={onZoomIn}
          className="p-2 bg-white rounded-lg shadow hover:bg-gray-50">
          <ZoomIn className="w-5 h-5 text-gray-600" />
        </button>
        <button
          onClick={onZoomOut}
          className="p-2 bg-white rounded-lg shadow hover:bg-gray-50">
          <ZoomOut className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* SVG Map Layer */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        className="absolute inset-0"
      >
        {/* Background */}
        <rect
          width={dimensions.width}
          height={dimensions.height}
          fill="#f8fafc"
        />

        {/* Grid circles */}
        <g opacity={1}>
          {[100, 200, 300].map((r) => (
            <circle
              key={r}
              cx={dimensions.width / 2}
              cy={dimensions.height / 2}
              r={r}
              fill="none"
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          ))}
          <line
            x1={0}
            y1={dimensions.height / 2}
            x2={dimensions.width}
            y2={dimensions.height / 2}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          <line
            x1={dimensions.width / 2}
            y1={0}
            x2={dimensions.width / 2}
            y2={dimensions.height}
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        </g>

        {/* Density contours */}
        <g>
          {contours.map((contour, i) => (
            <path
              key={i}
              d={pathGenerator?.(contour) || ""}
              fill={getContourColor(contour.value)}
              stroke="rgba(80, 120, 160, 0.4)"
              strokeWidth={0.8}
              opacity={0.6}
            />
          ))}
        </g>

        {/* Player Shadows */}
        {xScale && yScale && selectedPlayers.length > 0 && (
          <g className="player-shadows">
            {selectedPlayers.map((player) => {
              // Get center for selected year, or overall center
              const yearData = selectedYear
                ? player.yearlyData.find((d) => d.year === selectedYear)
                : null;
              const center = yearData?.center || player.center;
              const radius = player.radius;

              return (
                <PlayerShadow
                  key={player.name}
                  name={player.name}
                  color={player.color}
                  center={center}
                  radius={radius}
                  xScale={xScale}
                  yScale={yScale}
                />
              );
            })}
          </g>
        )}

        {/* Points */}
        {viewMode === "patents" ? (
          <g>
            {points.map((point, i) => (
              <circle
                key={i}
                cx={xScale(point.x)}
                cy={yScale(point.y)}
                r={2}
                fill="#3b82f6"
                opacity={0.4}
              />
            ))}
          </g>
        ) : (
          <g>
            {areaPoints.map((areaPoint) => {
              const isHighlighted = highlightedArea === areaPoint.id;
              const isVisible = visibleCategories[areaPoint.category];

              const baseRadius = 0;
              const countScale = Math.sqrt(areaPoint.count / 5);
              const radius = Math.max(baseRadius, baseRadius + countScale * 2);

              const cx = xScale(areaPoint.x);
              const cy = yScale(areaPoint.y);

              return (
                <g
                  key={areaPoint.id}
                  onMouseEnter={() => onHighlightArea(areaPoint.id)}
                  onMouseLeave={() => onHighlightArea(null)}
                  style={{ cursor: "pointer" }}
                  opacity={isVisible ? (isHighlighted ? 1 : 0.8) : 0.2}
                >
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius}
                    fill={isHighlighted ? "rgba(59, 130, 246, 0.3)" : "rgba(59, 130, 246, 0.1)"}
                    stroke="#3b82f6"
                    strokeWidth={isHighlighted ? 2 : 1.5}
                  />
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHighlighted ? 4 : 3}
                    fill="#3b82f6"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* Leader lines and boundary circles (SVG) */}
        {labelsToShow.map((area) => {
          const config = CATEGORY_CONFIG[area.category as MarketCategory];
          const isHighlighted = highlightedArea === area.id;
          const isCategoryVisible = visibleCategories[area.category as string];
          const isAreaVisible = visibleAreas[area.id] !== false;

          if (!isCategoryVisible || !isAreaVisible) return null;

          const pos = getLabelPosition(area.id);
          if (!pos) return null;

          const { cx, cy, labelX, labelY } = pos;

          const baseRadius = 0;
          const countScale = Math.sqrt(area.count / 10);
          const radius = baseRadius + countScale * 5;

          return (
            <g key={`svg-${area.id}`}>
              {/* Boundary circle */}
              <circle
                cx={cx}
                cy={cy}
                r={radius}
                fill={isHighlighted ? config.bgColor : "none"}
                stroke={config.color}
                strokeWidth={isHighlighted ? 3 : 2}
                strokeDasharray={isHighlighted ? "none" : "4,3"}
                opacity={isHighlighted ? 1 : 0.7}
              />

              {/* Leader line */}
              <line
                x1={cx}
                y1={cy}
                x2={labelX}
                y2={labelY}
                stroke={config.color}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeDasharray={isHighlighted ? "none" : "2,2"}
                opacity={isHighlighted ? 0.8 : 0.5}
              />
            </g>
          );
        })}
      </svg>

      {/* HTML Labels Layer */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
      >
        {labelsToShow.map((area) => {
          const config = CATEGORY_CONFIG[area.category as MarketCategory];
          const isCategoryVisible = visibleCategories[area.category as string];
          const isAreaVisible = visibleAreas[area.id] !== false;

          if (!isCategoryVisible || !isAreaVisible) return null;

          const pos = getLabelPosition(area.id);
          if (!pos) return null;

          return (
            <DraggableLabel
              key={`label-${area.id}`}
              area={area}
              config={config}
              position={{ x: pos.labelX, y: pos.labelY }}
              isHighlighted={highlightedArea === area.id}
              isDragging={draggingId === area.id}
              dimensions={dimensions}
              onHover={onHighlightArea}
              onToggleVisibility={onToggleAreaVisibility}
              onExpandInSidebar={onExpandArea}
              onDragStart={handleDragStart}
              // Label editing props
              editedLabel={editedLabels[area.id]}
              editedShortLabel={editedShortLabels[area.id]}
              onEditLabel={onEditLabel}
              onEditShortLabel={onEditShortLabel}
            />
          );
        })}
      </div>
    </div>
  );
}