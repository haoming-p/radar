import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { scaleLinear } from "d3-scale";
import { contourDensity } from "d3-contour";
import { geoPath } from "d3-geo";
import { ArrowLeft, Loader2, Settings, HelpCircle, RefreshCw } from "lucide-react";

import AnalysisSidebar from "../sidebar/AnaylysisSidebar";
import AnalysisMap from "./AnalysisMap";
import HighlightsPanel from "../highlights/HighlightsPanel";
import PlayerTimeline from "../timeline/PlayerTimeline";
import ReportGenerator from "../report/ReportGenerator";
import ChatBot from "../chat/ChatBot";
import { PlayerInfo } from "../sidebar/PlayersSection";
import { processPlayerData, parseCSV } from "../../../scripts/PlayerDataUtils";
import { API_BASE_URL } from "../../../config";

// Import CSV for player data processing
import patentsCsvText from "../../../testData/population_normalized.csv?raw";

// ============ TYPES ============
export type MarketCategory = "major" | "growing" | "sparse" | "avoid";
export type ViewMode = "patents" | "areas";

export const CATEGORY_CONFIG: Record<
  MarketCategory,
  { color: string; bgColor: string; label: string; description: string }
> = {
  growing: {
    color: "#166534",
    bgColor: "rgba(22, 101, 52, 0.15)",
    label: "Growing",
    description: "Emerging opportunity, rising trend",
  },
  sparse: {
    color: "#F97316",
    bgColor: "rgba(249, 115, 22, 0.1)",
    label: "Niche",
    description: "Untapped market, low count",
  },
  major: {
    color: "#991B1B",
    bgColor: "rgba(153, 27, 27, 0.1)",
    label: "Established",
    description: "Crowded market, high competition",
  },
  avoid: {
    color: "#1F2937",
    bgColor: "rgba(31, 41, 55, 0.1)",
    label: "Avoid",
    description: "Declining market",
  },
};

// Patent from new JSON format
export interface Patent {
  x: number;
  y: number;
  area_id: number;
  topic_id: number;
  title: string;
  year?: number;
  index: number;
}

// Area (was "cluster" in old format)
export interface AreaInfo {
  id: number;
  centroid: { x: number; y: number };
  count: number;
  label: string;
  topic_id: number;
  topic_dominance: number;
  yearCounts?: Record<string, number>;
  trend?: number;
  category?: MarketCategory;
  topic_category?: MarketCategory;
}

// Topic info
export interface TopicInfo {
  id: number;
  label: string;
  totalPatents: number;
  areaCount: number;
  areas: {
    area_id: number;
    count: number;
    category: MarketCategory;
    topic_category?: MarketCategory;
    trend: number;
    centroid: { x: number; y: number };
    label: string;
  }[];
}

interface CategorySummary {
  color: string;
  bgColor: string;
  label: string;
  description: string;
  count: number;
}

interface SpatialData {
  patents: Patent[];
  areas: Record<string, AreaInfo>;
  topics: Record<string, TopicInfo>;
  categories: Record<string, CategorySummary>;
  stats: {
    total_patents: number;
    total_areas: number;
    total_topics: number;
    avg_per_area: number;
    grid_size: number;
    noise_patents: number;
  };
  method: {
    dimensionality: string;
    clustering: string;
    cluster_params: Record<string, unknown>;
    grid_size: number;
  };
}

// For map rendering
export interface Point {
  x: number;
  y: number;
  area_id: number;
  topic_id: number;
  title: string;
}

// Area point for "areas as points" view
export interface AreaPoint {
  x: number;
  y: number;
  id: number;
  count: number;
  category: MarketCategory;
  topic_id: number;
  label: string;
}

const DEMO_API_BASE = API_BASE_URL;

interface StepAnalysisSpatialProps {
  onBack: () => void;
  liveData?: SpatialData | null;
  uploadedFile?: File | null;
}

export default function StepAnalysisSpatial({
  onBack,
  liveData,
  uploadedFile,
}: StepAnalysisSpatialProps) {
  // ============ STATE ============
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("patents");
  const [patents, setPatents] = useState<Patent[]>([]);
  const [areas, setAreas] = useState<Record<string, AreaInfo>>({});
  const [topics, setTopics] = useState<Record<string, TopicInfo>>({});
  const [stats, setStats] = useState<SpatialData["stats"] | null>(null);
  const [method, setMethod] = useState<SpatialData["method"] | null>(null);
  const [dimensions] = useState({ width: 900, height: 700 });
  const [zoom, setZoom] = useState(1.2);

  // Visibility state
  const [visibleCategories, setVisibleCategories] = useState<
    Record<string, boolean>
  >({
    growing: true,
    sparse: true,
    major: false,
    avoid: false,
  });
  const [visibleAreas, setVisibleAreas] = useState<Record<number, boolean>>({});
  const [highlightedArea, setHighlightedArea] = useState<number | null>(null);

  // Drag and expand state (for map labels)
  const [draggedPositions, setDraggedPositions] = useState<
    Record<number, { x: number; y: number }>
  >({});
  const [expandedAreaId, setExpandedAreaId] = useState<number | null>(null);

  // Pipeline settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [pipelineParams, setPipelineParams] = useState({
    grid_size: 1.2,
    min_cluster_size: 20,
    min_samples: 5,
    top_players: 20,
  });
  const settingsRef = useRef<HTMLDivElement>(null);

  // Regeneration state
  const [regenerating, setRegenerating] = useState(false);
  const [regenMessage, setRegenMessage] = useState("");
  const regenAbortRef = useRef<AbortController | null>(null);

  // ============ PLAYERS STATE ============
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [yearRange, setYearRange] = useState<[number, number]>([2015, 2024]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // ============ LABEL EDITING STATE ============
  const [editedLabels, setEditedLabels] = useState<Record<number, string>>({}); // Full keywords
  const [editedShortLabels, setEditedShortLabels] = useState<
    Record<number, string>
  >({}); // 缩略词

  // ============ REPORT GENERATOR STATE ============
  const [showReportModal, setShowReportModal] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  // ============ HIGHLIGHTS STATE ============
  const [showHighlights, setShowHighlights] = useState(false);

  // Load edited labels from localStorage on mount
  useEffect(() => {
    const savedLabels = localStorage.getItem("radar-edited-labels");
    if (savedLabels) {
      try {
        setEditedLabels(JSON.parse(savedLabels));
      } catch (e) {
        console.warn("Failed to load edited labels from localStorage");
      }
    }
    const savedShortLabels = localStorage.getItem("radar-edited-short-labels");
    if (savedShortLabels) {
      try {
        setEditedShortLabels(JSON.parse(savedShortLabels));
      } catch (e) {
        console.warn("Failed to load edited short labels from localStorage");
      }
    }
  }, []);

  // Save edited labels to localStorage when changed
  useEffect(() => {
    if (Object.keys(editedLabels).length > 0) {
      localStorage.setItem("radar-edited-labels", JSON.stringify(editedLabels));
    }
  }, [editedLabels]);

  // Save edited short labels to localStorage when changed
  useEffect(() => {
    if (Object.keys(editedShortLabels).length > 0) {
      localStorage.setItem(
        "radar-edited-short-labels",
        JSON.stringify(editedShortLabels),
      );
    }
  }, [editedShortLabels]);

  // Load dragged positions from localStorage on mount
  useEffect(() => {
    const savedPositions = localStorage.getItem("radar-dragged-positions");
    if (savedPositions) {
      try {
        setDraggedPositions(JSON.parse(savedPositions));
      } catch (e) {
        console.warn("Failed to load dragged positions from localStorage");
      }
    }
  }, []);

  // Save dragged positions to localStorage when changed
  useEffect(() => {
    if (Object.keys(draggedPositions).length > 0) {
      localStorage.setItem(
        "radar-dragged-positions",
        JSON.stringify(draggedPositions)
      );
    }
  }, [draggedPositions]);

  // ============ DATA LOADING ============
  useEffect(() => {
    setLoading(true);
    try {
      if (!liveData) {
        setLoading(false);
        return;
      }
      const data = liveData as SpatialData;
      setPatents(data.patents);
      setAreas(data.areas);
      setTopics(data.topics);
      setStats(data.stats);
      setMethod(data.method);
      // Sync pipeline params from loaded data
      if (data.method) {
        setPipelineParams((prev) => ({
          ...prev,
          grid_size: data.method.grid_size ?? prev.grid_size,
          min_cluster_size:
            (data.method.cluster_params?.min_cluster_size as number) ??
            prev.min_cluster_size,
          min_samples:
            (data.method.cluster_params?.min_samples as number) ??
            prev.min_samples,
        }));
      }
    } catch (error) {
      console.error("Failed to load spatial data:", error);
    }
    setLoading(false);
  }, [liveData]);

  // Load and process player data from CSV
  useEffect(() => {
    // Only process when we have patents and areas
    if (patents.length === 0 || Object.keys(areas).length === 0) return;

    try {
      // Parse CSV text (imported at build time)
      const rawPatents = parseCSV(patentsCsvText);

      // Process with spatial data
      const { players: processedPlayers, yearRange: processedYearRange } =
        processPlayerData(
          rawPatents,
          patents, // spatial patents from JSON
          areas, // areas for labels
          20, // top 20 players
        );

      setPlayers(processedPlayers);
      setYearRange(processedYearRange);
    } catch (error) {
      console.warn("Failed to process player data:", error);
    }
  }, [patents, areas]);

  // ============ COMPUTED DATA ============

  // Convert patents to points for map
  const points = useMemo((): Point[] => {
    return patents.map((p) => ({
      x: p.x,
      y: p.y,
      area_id: p.area_id,
      topic_id: p.topic_id,
      title: p.title,
    }));
  }, [patents]);

  // Convert areas to points for "areas as points" view (like Radar 1.0)
  const areaPoints = useMemo((): AreaPoint[] => {
    return Object.values(areas).map((area) => ({
      x: area.centroid.x,
      y: area.centroid.y,
      id: area.id,
      count: area.count,
      category: area.category as MarketCategory,
      topic_id: area.topic_id,
      label: area.label || "",
    }));
  }, [areas]);

  // Group areas by category
  const areasByCategory = useMemo(() => {
    const grouped: Record<MarketCategory, AreaInfo[]> = {
      major: [],
      growing: [],
      sparse: [],
      avoid: [],
    };

    Object.values(areas).forEach((area) => {
      const cat = area.category as MarketCategory;
      if (cat && grouped[cat]) {
        grouped[cat].push(area);
      }
    });

    // Sort by count (highest first)
    Object.keys(grouped).forEach((cat) => {
      grouped[cat as MarketCategory].sort((a, b) => b.count - a.count);
    });

    return grouped;
  }, [areas]);

  // Initialize visible areas: only first 3 of Growing and Niche are visible by default
  useEffect(() => {
    const initialVisible: Record<number, boolean> = {};

    // Set all areas to hidden first
    Object.values(areas).forEach((area) => {
      initialVisible[area.id] = false;
    });

    // Show first 3 of Growing
    areasByCategory.growing.slice(0, 3).forEach((area) => {
      initialVisible[area.id] = true;
    });

    // Show first 3 of Niche (sparse)
    areasByCategory.sparse.slice(0, 3).forEach((area) => {
      initialVisible[area.id] = true;
    });

    setVisibleAreas(initialVisible);
  }, [areas, areasByCategory]);

  // Calculate scales and contours
  const { xScale, yScale, contours, pathGenerator } = useMemo(() => {
    // Use area points for scales/contours when in areas mode
    const dataPoints = viewMode === "areas" ? areaPoints : points;

    if (dataPoints.length === 0) {
      return { xScale: null, yScale: null, contours: [], pathGenerator: null };
    }

    const padding = 50;
    const xExtent = [
      Math.min(...dataPoints.map((p) => p.x)),
      Math.max(...dataPoints.map((p) => p.x)),
    ];
    const yExtent = [
      Math.min(...dataPoints.map((p) => p.y)),
      Math.max(...dataPoints.map((p) => p.y)),
    ];

    const xPadding = (xExtent[1] - xExtent[0]) * 0.1;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.1;

    const xScale = scaleLinear()
      .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
      .range([padding, dimensions.width - padding]);

    const yScale = scaleLinear()
      .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
      .range([dimensions.height - padding, padding]);

    // Contour density based on view mode
    const contourGenerator = contourDensity<{ x: number; y: number }>()
      .x((d) => xScale(d.x))
      .y((d) => yScale(d.y))
      .size([dimensions.width, dimensions.height])
      .bandwidth(viewMode === "areas" ? 20 : 8)
      .thresholds(viewMode === "areas" ? 20 : 35);

    const contours = contourGenerator(dataPoints);
    const pathGenerator = geoPath();

    return { xScale, yScale, contours, pathGenerator };
  }, [points, areaPoints, viewMode, dimensions]);

  const densityExtent = useMemo(() => {
    if (contours.length === 0) return [0, 1];
    const values = contours.map((c: { value: number }) => c.value);
    return [Math.min(...values), Math.max(...values)];
  }, [contours]);

  // Get areas to show labels for (only visible areas + highlighted)
  const labelsToShow = useMemo(() => {
    const labels: AreaInfo[] = [];

    // Always include highlighted area if it's visible
    if (highlightedArea !== null && areas[String(highlightedArea)]) {
      const area = areas[String(highlightedArea)];
      const isCategoryVisible = visibleCategories[area.category as string];
      const isAreaVisible = visibleAreas[highlightedArea] !== false;
      if (isCategoryVisible && isAreaVisible) {
        labels.push(area);
      }
    }

    // Add visible areas from each category
    (["growing", "sparse", "major", "avoid"] as MarketCategory[]).forEach(
      (cat) => {
        if (visibleCategories[cat]) {
          areasByCategory[cat].forEach((area) => {
            // Only show if area is individually visible
            if (
              visibleAreas[area.id] &&
              !labels.some((l) => l.id === area.id)
            ) {
              labels.push(area);
            }
          });
        }
      },
    );

    return labels;
  }, [
    areasByCategory,
    visibleCategories,
    visibleAreas,
    highlightedArea,
    areas,
  ]);

  // Get selected players data for map and timeline
  const selectedPlayersData = useMemo(() => {
    return players.filter((p) => selectedPlayers.includes(p.name));
  }, [players, selectedPlayers]);

  // ============ HANDLERS ============
  const handleToggleCategoryVisibility = (cat: string) => {
    setVisibleCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  const handleToggleAreaVisibility = (areaId: number) => {
    const newVisibility = !visibleAreas[areaId];
    setVisibleAreas((prev) => ({ ...prev, [areaId]: newVisibility }));

    // If turning on an area, also make sure its category is visible
    if (newVisibility) {
      const area = areas[String(areaId)];
      if (area && !visibleCategories[area.category as string]) {
        setVisibleCategories((prev) => ({
          ...prev,
          [area.category as string]: true,
        }));
      }
    }
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.2, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.2, 0.5));

  // Handle label drag on map
  const handleDragLabel = (
    areaId: number,
    position: { x: number; y: number },
  ) => {
    setDraggedPositions((prev) => ({ ...prev, [areaId]: position }));
  };

  // Handle click on map label to expand in sidebar
  const handleExpandArea = (areaId: number) => {
    setExpandedAreaId(areaId);

    // Also ensure area and category are visible
    const area = areas[String(areaId)];
    if (area) {
      if (!visibleCategories[area.category as string]) {
        setVisibleCategories((prev) => ({
          ...prev,
          [area.category as string]: true,
        }));
      }
      if (!visibleAreas[areaId]) {
        setVisibleAreas((prev) => ({ ...prev, [areaId]: true }));
      }
    }
  };

  // Clear expanded area (called by sidebar after handling)
  const handleClearExpandedArea = () => {
    setExpandedAreaId(null);
  };

  // ============ PLAYER HANDLERS ============
  const handleTogglePlayer = (playerName: string) => {
    setSelectedPlayers((prev) => {
      if (prev.includes(playerName)) {
        return prev.filter((p) => p !== playerName);
      } else {
        return [...prev, playerName];
      }
    });
  };

  const handleShowTimeline = (playerName: string) => {
    // Make sure player is selected
    if (!selectedPlayers.includes(playerName)) {
      setSelectedPlayers((prev) => [...prev, playerName]);
    }
    setShowTimeline(true);
    setTimelineCollapsed(false);
  };

  // Toggle players visibility: show top 3 or hide all
  const handleTogglePlayersVisibility = () => {
    if (selectedPlayers.length > 0) {
      // Hide all currently selected players
      setSelectedPlayers([]);
    } else {
      // Show top 3 players
      const top3 = players.slice(0, 3).map((p) => p.name);
      setSelectedPlayers(top3);
    }
  };

  const handleSelectYear = (year: number) => {
    setSelectedYear(year);
  };

  const handleCloseTimeline = () => {
    setShowTimeline(false);
  };

  // ============ SETTINGS PANEL CLICK-OUTSIDE ============
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  // ============ REGENERATE HANDLER ============
  const handleRegenerate = async () => {
    if (!uploadedFile || regenerating) return;
    setRegenerating(true);
    setRegenMessage("Starting...");
    setShowSettings(false);

    const controller = new AbortController();
    regenAbortRef.current = controller;

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile);
      formData.append("grid_size", String(pipelineParams.grid_size));
      formData.append("min_cluster_size", String(pipelineParams.min_cluster_size));
      formData.append("min_samples", String(pipelineParams.min_samples));
      formData.append("top_players", String(pipelineParams.top_players));

      const response = await fetch(`${DEMO_API_BASE}/api/demo/upload`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response stream");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = JSON.parse(line.slice(6));

          if (data.error) {
            setRegenMessage(`Error: ${data.error}`);
            setRegenerating(false);
            return;
          }

          setRegenMessage(data.message || "");

          if (data.step === "done" && data.resultId) {
            setRegenMessage("Loading results...");
            const resultRes = await fetch(
              `${DEMO_API_BASE}/api/demo/result/${data.resultId}`,
            );
            const resultData = (await resultRes.json()) as SpatialData;

            // Swap in new data
            setPatents(resultData.patents);
            setAreas(resultData.areas);
            setTopics(resultData.topics);
            setStats(resultData.stats);
            setMethod(resultData.method);
            if (resultData.method) {
              setPipelineParams((prev) => ({
                ...prev,
                grid_size: resultData.method.grid_size ?? prev.grid_size,
                min_cluster_size:
                  (resultData.method.cluster_params
                    ?.min_cluster_size as number) ?? prev.min_cluster_size,
                min_samples:
                  (resultData.method.cluster_params?.min_samples as number) ??
                  prev.min_samples,
              }));
            }
            setRegenerating(false);
            return;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRegenMessage(`Error: ${(err as Error).message}`);
      }
    }
    setRegenerating(false);
  };

  // ============ LABEL EDITING HANDLER ============
  const handleEditLabel = (areaId: number, newLabel: string) => {
    setEditedLabels((prev) => ({ ...prev, [areaId]: newLabel }));
  };

  const handleEditShortLabel = (areaId: number, newShortLabel: string) => {
    setEditedShortLabels((prev) => ({ ...prev, [areaId]: newShortLabel }));
  };

  // ============ HIGHLIGHTS HANDLER ============
  const handleHighlightsChange = useCallback((isActive: boolean) => {
    setShowHighlights(isActive);
  }, []);

  // ============ RENDER ============
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Loading spatial clustering...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-1 p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-600">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm">Back to Dataset</span>
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            Patent Analysis Map
          </h1>
        </div>

        {/* Toggle Controls */}
        <div className="flex items-center gap-4">
          {/* Year Slider - only show when players selected and not in highlights mode */}
          {selectedPlayers.length > 0 && !showHighlights && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Year:</span>
              <input
                type="range"
                min={yearRange[0]}
                max={yearRange[1]}
                value={selectedYear || yearRange[1]}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="w-32 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700 w-12">
                {selectedYear || yearRange[1]}
              </span>
            </div>
          )}

          {/* View Mode Toggle - hide when in highlights mode */}
          {!showHighlights && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">View:</span>
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  onClick={() => setViewMode("patents")}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    viewMode === "patents"
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}>
                  Patents
                </button>
                <button
                  onClick={() => setViewMode("areas")}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    viewMode === "areas"
                      ? "bg-blue-500 text-white"
                      : "bg-white text-gray-600 hover:bg-gray-50"
                  }`}>
                  Areas
                </button>
              </div>
            </div>
          )}

          {/* Pipeline Settings */}
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                showSettings
                  ? "bg-blue-50 border-blue-300 text-blue-700"
                  : "bg-white text-gray-600 hover:border-gray-400"
              }`}>
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </button>

            {showSettings && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border p-4 z-50">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">
                  Pipeline Settings
                </h3>

                {/* Grid Size */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs font-medium text-gray-700">
                      Grid Size
                    </label>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="hidden group-hover:block absolute left-5 top-0 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
                        Smaller = more areas. Larger = fewer, broader areas.
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    max="5.0"
                    value={pipelineParams.grid_size}
                    onChange={(e) =>
                      setPipelineParams((prev) => ({
                        ...prev,
                        grid_size: parseFloat(e.target.value) || prev.grid_size,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Min Cluster Size */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs font-medium text-gray-700">
                      Min Cluster Size
                    </label>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="hidden group-hover:block absolute left-5 top-0 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
                        Min patents to form a topic. Larger = fewer, bigger
                        topics.
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="100"
                    value={pipelineParams.min_cluster_size}
                    onChange={(e) =>
                      setPipelineParams((prev) => ({
                        ...prev,
                        min_cluster_size:
                          parseInt(e.target.value) || prev.min_cluster_size,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Min Samples */}
                <div className="mb-3">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs font-medium text-gray-700">
                      Min Samples
                    </label>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="hidden group-hover:block absolute left-5 top-0 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
                        Noise strictness. Larger = more patents marked as noise.
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    max="50"
                    value={pipelineParams.min_samples}
                    onChange={(e) =>
                      setPipelineParams((prev) => ({
                        ...prev,
                        min_samples:
                          parseInt(e.target.value) || prev.min_samples,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Top Players */}
                <div className="mb-4">
                  <div className="flex items-center gap-1 mb-1">
                    <label className="text-xs font-medium text-gray-700">
                      Top Players
                    </label>
                    <div className="group relative">
                      <HelpCircle className="w-3.5 h-3.5 text-gray-400 cursor-help" />
                      <div className="hidden group-hover:block absolute left-5 top-0 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-50">
                        Number of top companies to show.
                      </div>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="1"
                    min="5"
                    max="50"
                    value={pipelineParams.top_players}
                    onChange={(e) =>
                      setPipelineParams((prev) => ({
                        ...prev,
                        top_players:
                          parseInt(e.target.value) || prev.top_players,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Divider + Regenerate */}
                <div className="border-t pt-3">
                  <button
                    onClick={handleRegenerate}
                    disabled={!uploadedFile || regenerating}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    <RefreshCw
                      className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`}
                    />
                    {regenerating ? "Regenerating..." : "Regenerate Map"}
                  </button>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    Clustering and layout will be recalculated. This may take
                    2-3 minutes.
                  </p>
                  {!uploadedFile && (
                    <p className="text-xs text-amber-500 mt-1 text-center">
                      Only available for uploaded datasets.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="text-sm text-gray-600">
            {stats && (
              <span>
                {stats.total_topics} topics / {stats.total_areas} areas /{" "}
                {stats.total_patents.toLocaleString()} patents
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Regeneration progress overlay */}
      {regenerating && (
        <div className="absolute bottom-6 right-6 z-50 bg-white rounded-xl shadow-lg border p-4 w-72">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                Regenerating map...
              </p>
              <p className="text-xs text-gray-500 truncate">{regenMessage}</p>
            </div>
            <button
              onClick={() => {
                regenAbortRef.current?.abort();
                setRegenerating(false);
              }}
              className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sidebar + Map/Highlights row */}
        <div className="flex-1 flex overflow-hidden">
          <AnalysisSidebar
            areasByCategory={areasByCategory}
            topics={topics}
            areas={areas}
            visibleCategories={visibleCategories}
            visibleAreas={visibleAreas}
            highlightedArea={highlightedArea}
            expandedAreaId={expandedAreaId}
            onToggleCategoryVisibility={handleToggleCategoryVisibility}
            onToggleAreaVisibility={handleToggleAreaVisibility}
            onHighlightArea={setHighlightedArea}
            onClearExpandedArea={handleClearExpandedArea}
            onExpandArea={handleExpandArea}
            // Player props
            players={players}
            selectedPlayers={selectedPlayers}
            onTogglePlayer={handleTogglePlayer}
            onShowTimeline={handleShowTimeline}
            onTogglePlayersVisibility={handleTogglePlayersVisibility}
            // Label editing props
            editedLabels={editedLabels}
            editedShortLabels={editedShortLabels}
            onEditLabel={handleEditLabel}
            onEditShortLabel={handleEditShortLabel}
            // Report props
            onOpenReport={() => setShowReportModal(true)}
            // Highlights props
            onHighlightsChange={handleHighlightsChange}
          />

          {/* Map/Highlights container with ChatBot floating on top */}
          <div className="flex-1 relative overflow-hidden">
            {showHighlights ? (
              <HighlightsPanel
                query="battery, aviation, aerospace"
                yearRange={yearRange}
                totalPatents={patents.length}
                method={method}
                patents={patents}
                players={players}
                topics={topics}
                areasByCategory={areasByCategory}
              />
            ) : (
              <div ref={mapRef} className="flex-1 flex h-full">
                <AnalysisMap
                  points={points}
                  areaPoints={areaPoints}
                  viewMode={viewMode}
                  labelsToShow={labelsToShow}
                  visibleCategories={visibleCategories}
                  visibleAreas={visibleAreas}
                  highlightedArea={highlightedArea}
                  dimensions={dimensions}
                  zoom={zoom}
                  xScale={xScale}
                  yScale={yScale}
                  contours={contours}
                  pathGenerator={pathGenerator}
                  densityExtent={densityExtent}
                  draggedPositions={draggedPositions}
                  onZoomIn={handleZoomIn}
                  onZoomOut={handleZoomOut}
                  onHighlightArea={setHighlightedArea}
                  onToggleAreaVisibility={handleToggleAreaVisibility}
                  onExpandArea={handleExpandArea}
                  onDragLabel={handleDragLabel}
                  // Player props
                  selectedPlayers={selectedPlayersData}
                  selectedYear={selectedYear}
                  // Label editing props
                  editedLabels={editedLabels}
                  editedShortLabels={editedShortLabels}
                  onEditLabel={handleEditLabel}
                  onEditShortLabel={handleEditShortLabel}
                />
              </div>
            )}

            {/* ChatBot floats on top */}
            <ChatBot
              patents={patents}
              areas={areas}
              players={players}
              areasByCategory={areasByCategory}
            />
          </div>
        </div>

        {/* Timeline Panel - at bottom, only when not in highlights mode */}
        {!showHighlights && showTimeline && selectedPlayers.length > 0 && (
          <PlayerTimeline
            players={players}
            selectedPlayers={selectedPlayers}
            selectedYear={selectedYear}
            yearRange={yearRange}
            onSelectYear={handleSelectYear}
            onClose={handleCloseTimeline}
            isCollapsed={timelineCollapsed}
            onToggleCollapse={() => setTimelineCollapsed(!timelineCollapsed)}
          />
        )}
      </div>

      {/* Report Generator Modal */}
      <ReportGenerator
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        query="battery, aviation, aerospace"
        yearRange={yearRange}
        totalPatents={patents.length}
        areasByCategory={areasByCategory}
        topics={topics}
        players={players}
        areas={areas}
        mapRef={mapRef}
        // NEW props for label export:
        labelsToShow={labelsToShow}
        draggedPositions={draggedPositions}
        editedLabels={editedLabels}
        editedShortLabels={editedShortLabels}
        dimensions={dimensions}
        visibleCategories={visibleCategories}
        visibleAreas={visibleAreas}
      />
    </div>
  );
}