import { useState, useCallback, useMemo, useEffect } from "react";
import RadarMap, { PatentPoint, ClusterInfo, AreaInfo, HotAreaInfo, DimMethod, ViewSource, InteractionContext, ExploreResult, CurrentsData, SavedLayer } from "./map/RadarMap";
import OverviewSidebar from "./sidebar/OverviewSidebar";
import { PlayerInfo } from "./sidebar/PlayersSection";
import PlayerTimeline from "./timeline/PlayerTimeline";
import ChatBot from "./chat/ChatBot";
import { processPlayerData, parseCSV } from "../../scripts/PlayerDataUtils";
import { LandscapeData, MapSelection, MapAction, SuggestedHotArea, regenerateZones } from "../../scripts/chatUtils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpatialData = any;

// Reference data is fetched at runtime from /data/* (served by Vite's public/ folder)
// rather than imported as modules — keeps the JS bundle small and avoids OOM at build.
const RADAR10_JSON_URL = "/data/radar10-272364.json";
const RAW_CSV_URL = "/data/raw-272364.csv";


interface AnalysisViewProps {
  data: SpatialData;
  mode?: "internal" | "client";
}

export default function AnalysisView({ data, mode = "internal" }: AnalysisViewProps) {
  const lsPrefix = mode === "client" ? "radar-client-" : "radar-";
  const [highlightedArea, setHighlightedArea] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [highlightedHotArea, setHighlightedHotArea] = useState<number | null>(null);
  const [selectedHotArea, setSelectedHotArea] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [dimensions] = useState({ width: 900, height: 700 });
  const [dimMethod, setDimMethod] = useState<DimMethod>("tsne");
  const [viewSource] = useState<ViewSource>("radar10");
  const [sectionContext, setSectionContext] = useState<InteractionContext>("hotAreas");

  // Explore mode state
  const [exploreClickPx, setExploreClickPx] = useState<{ x: number; y: number } | null>(null);
  const [exploreLevelOffset, setExploreLevelOffset] = useState(0);
  const [exploreResult, setExploreResult] = useState<ExploreResult | null>(null);
  const [exploreMode, setExploreMode] = useState<"contour" | "draw">("contour");
  const [exploreSummary, setExploreSummary] = useState<string | null>(null);
  const [exploreName, setExploreName] = useState<string | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [drawPolygon, setDrawPolygon] = useState<{ x: number; y: number }[] | null>(null);

  // Custom areas from zone regeneration (client mode)
  const [customAreas, setCustomAreas] = useState<Record<string, AreaInfo> | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Saved layers state (persisted to localStorage)
  const [savedLayers, setSavedLayers] = useState<SavedLayer[]>(() => {
    try {
      const saved = localStorage.getItem(`${lsPrefix}saved-layers`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    localStorage.setItem(`${lsPrefix}saved-layers`, JSON.stringify(savedLayers));
  }, [savedLayers, lsPrefix]);

  const handleSaveLayer = useCallback((layer: Omit<SavedLayer, "id" | "visible">) => {
    setSavedLayers((prev) => {
      // Check if already saved
      const existing = prev.find((l) => l.section === layer.section && String(l.itemId) === String(layer.itemId));
      if (existing) return prev; // already saved
      return [...prev, { ...layer, id: `${layer.section}-${layer.itemId}-${Date.now()}`, visible: true }];
    });
  }, []);

  const handleRemoveLayer = useCallback((layerId: string) => {
    setSavedLayers((prev) => prev.filter((l) => l.id !== layerId));
  }, []);

  const handleToggleLayerVisibility = useCallback((layerId: string) => {
    setSavedLayers((prev) => prev.map((l) => l.id === layerId ? { ...l, visible: !l.visible } : l));
  }, []);

  const isLayerSaved = useCallback((section: string, itemId: number | string) => {
    return savedLayers.some((l) => l.section === section && String(l.itemId) === String(itemId));
  }, [savedLayers]);

  // Currents state
  const [activeConvergenceId, setActiveConvergenceId] = useState<number | null>(null);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);

  // Player state
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [yearRange, setYearRange] = useState<[number, number]>([2015, 2024]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null); // null until yearRange is loaded, then defaults to max year
  const [showTimeline, setShowTimeline] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // Parse pipeline data
  const pipelinePatents: PatentPoint[] = data?.patents || [];
  const pipelineClusters: Record<string, ClusterInfo> = data?.clusters || {};
  const areas: Record<string, AreaInfo> = data?.areas || {};
  const method = data?.method || {};

  // Reference data fetched at runtime (see RADAR10_JSON_URL / RAW_CSV_URL)
  const [radar10Data, setRadar10Data] = useState<any | null>(null);
  const [rawCsvText, setRawCsvText] = useState<string | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [jsonRes, csvRes] = await Promise.all([
          fetch(RADAR10_JSON_URL),
          fetch(RAW_CSV_URL),
        ]);
        if (!jsonRes.ok) throw new Error(`Failed to load ${RADAR10_JSON_URL}: ${jsonRes.status}`);
        if (!csvRes.ok) throw new Error(`Failed to load ${RAW_CSV_URL}: ${csvRes.status}`);
        const json = await jsonRes.json();
        const csv = await csvRes.text();
        if (cancelled) return;
        setRadar10Data(json);
        setRawCsvText(csv);
      } catch (e) {
        if (!cancelled) setDataError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Parse radar 1.0 data (static, uses single centroid field)
  const radar10Clusters = useMemo(() => {
    if (!radar10Data) return {} as Record<string, ClusterInfo>;
    const clusters: Record<string, ClusterInfo> = {};
    for (const [id, cl] of Object.entries(radar10Data.clusters as Record<string, any>)) {
      clusters[id] = {
        ...cl,
        centroid_umap: cl.centroid,
        centroid_tsne: cl.centroid,
      };
    }
    return clusters;
  }, [radar10Data]);

  const radar10Patents = useMemo(() => {
    if (!radar10Data) return [] as PatentPoint[];
    return (radar10Data.patents as any[]).map((p) => ({
      ...p,
      x_umap: p.x,
      y_umap: p.y,
      x_tsne: p.x,
      y_tsne: p.y,
    }));
  }, [radar10Data]);

  const radar10Areas = useMemo(() => {
    if (!radar10Data) return {} as Record<string, AreaInfo>;
    const raw = (radar10Data as any).areas || {};
    const result: Record<string, AreaInfo> = {};
    for (const [id, area] of Object.entries(raw as Record<string, any>)) {
      result[id] = area;
    }
    return result;
  }, [radar10Data]);

  const radar10HotAreas = useMemo(() => {
    if (!radar10Data) return {} as Record<string, HotAreaInfo>;
    const raw = (radar10Data as any).hot_areas || {};
    const result: Record<string, HotAreaInfo> = {};
    for (const [id, area] of Object.entries(raw as Record<string, any>)) {
      result[id] = area;
    }
    return result;
  }, [radar10Data]);

  const radar10Currents = useMemo((): CurrentsData | undefined => {
    if (!radar10Data) return undefined;
    const raw = (radar10Data as any).currents;
    if (!raw) return undefined;
    return raw as CurrentsData;
  }, [radar10Data]);

  // Compute player data from raw CSV + radar10 spatial data
  useEffect(() => {
    if (!radar10Data || !rawCsvText) return;
    const rawPatents = parseCSV(rawCsvText);
    const spatialPatents = (radar10Data.patents as any[]).map((p: any) => ({
      index: p.index as number,
      x: p.x as number,
      y: p.y as number,
      area_id: p.area_id as number,
      topic_id: p.cluster_id as number,
    }));
    const areaLabels: Record<string, { id: number; label: string }> = {};
    for (const [id, area] of Object.entries((radar10Data as any).areas || {})) {
      areaLabels[id] = { id: (area as any).id, label: (area as any).label };
    }
    const result = processPlayerData(rawPatents, spatialPatents, areaLabels, 20);
    setPlayers(result.players);
    setYearRange(result.yearRange);
    setSelectedYear(result.yearRange[1]); // Default to latest year
  }, [radar10Data, rawCsvText]);

  // Select active data based on view source
  const activePatents = viewSource === "radar10" ? radar10Patents : pipelinePatents;
  const activeClusters = viewSource === "radar10" ? radar10Clusters : pipelineClusters;
  const activeAreas = viewSource === "radar10" ? (customAreas ?? radar10Areas) : areas;
  const emptyHotAreas = useMemo(() => ({} as Record<string, HotAreaInfo>), []);
  const baseHotAreas = viewSource === "radar10" ? radar10HotAreas : emptyHotAreas;

  // AI-discovered custom hot areas
  const [customHotAreas, setCustomHotAreas] = useState<Record<string, HotAreaInfo>>({});

  const activeHotAreas = useMemo(() => ({
    ...baseHotAreas,
    ...customHotAreas,
  }), [baseHotAreas, customHotAreas]);

  // Pending AI-suggested hot areas (waiting for user to click "Add to map")
  const [pendingSuggestions, setPendingSuggestions] = useState<SuggestedHotArea[]>([]);

  const handleAddSuggestedHotArea = useCallback((suggestion: SuggestedHotArea) => {
    const newId = 1000 + Object.keys(customHotAreas).length;
    // Compute centroid from cluster positions
    const clusterPositions = suggestion.clusterIds
      .map((cid) => activeClusters[String(cid)])
      .filter(Boolean)
      .map((c) => c.centroid_umap);
    if (clusterPositions.length === 0) return;
    const centroid = {
      x: clusterPositions.reduce((s, p) => s + p.x, 0) / clusterPositions.length,
      y: clusterPositions.reduce((s, p) => s + p.y, 0) / clusterPositions.length,
    };
    // Count patents
    const patentCount = activePatents.filter((p) => suggestion.clusterIds.includes(p.cluster_id)).length;

    const newHotArea: HotAreaInfo = {
      id: newId,
      label: suggestion.name,
      summary: suggestion.description,
      keywords: suggestion.keywords,
      centroid,
      cluster_ids: suggestion.clusterIds,
      cluster_count: suggestion.clusterIds.length,
      patent_count: patentCount,
      trend: 0,
      boundary: [],
    };
    setCustomHotAreas((prev) => ({ ...prev, [String(newId)]: newHotArea }));
    setSectionContext("hotAreas");
    setSelectedHotArea(newId);
  }, [customHotAreas, activeClusters, activePatents]);

  const handleRemoveCustomHotArea = useCallback((id: number) => {
    setCustomHotAreas((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      return next;
    });
    if (selectedHotArea === id) setSelectedHotArea(null);
  }, [selectedHotArea]);

  // Active area within each section: null means overview (show all)
  const activeAreaId = selectedArea;
  const activeHotAreaId = selectedHotArea;

  // Section context is the base mode (no hover override)
  const interactionContext: InteractionContext = sectionContext;

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.2, 5)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.2, 0.5)), []);
  const handleZoomReset = useCallback(() => setZoom(1), []);

  const handleSelectArea = useCallback((id: number) => {
    setSelectedArea((prev) => (prev === id ? null : id));
    setSectionContext("keyAreas");
  }, []);

  const handleSelectHotArea = useCallback((id: number) => {
    setSelectedHotArea((prev) => (prev === id ? null : id));
    setSectionContext("hotAreas");
  }, []);

  const handleExploreClick = useCallback((point: { x: number; y: number }) => {
    setExploreClickPx(point);
    setExploreLevelOffset(0);
  }, []);

  const handleExploreExpand = useCallback(() => {
    setExploreLevelOffset((prev) => prev + 1);
  }, []);

  const handleExploreContract = useCallback(() => {
    setExploreLevelOffset((prev) => Math.max(0, prev - 1));
  }, []);

  // Player handlers
  const handleTogglePlayer = useCallback((playerName: string) => {
    setSelectedPlayers((prev) => {
      const wasSelected = prev.includes(playerName);
      const next = wasSelected ? prev.filter((n) => n !== playerName) : [...prev, playerName];
      // Selecting a player opens the timeline; deselecting all closes it
      if (!wasSelected) {
        setShowTimeline(true);
        setTimelineCollapsed(false);
      } else if (next.length === 0) {
        setShowTimeline(false);
      }
      return next;
    });
  }, []);

  // Trend icon: toggle timeline visibility for this player
  const handleShowTimeline = useCallback((playerName: string) => {
    const isSelected = selectedPlayers.includes(playerName);
    if (isSelected && showTimeline) {
      // Already selected and timeline open — close timeline
      setShowTimeline(false);
    } else {
      // Open timeline and ensure player is selected
      setShowTimeline(true);
      setTimelineCollapsed(false);
      setSelectedPlayers((prev) =>
        prev.includes(playerName) ? prev : [...prev, playerName]
      );
    }
  }, [selectedPlayers, showTimeline]);

  const selectedPlayersData = useMemo(
    () => players.filter((p) => selectedPlayers.includes(p.name)),
    [players, selectedPlayers]
  );

  // Clear explore state when leaving explore mode
  const handleSectionContextChange = useCallback((ctx: InteractionContext) => {
    setSectionContext(ctx);
    // Clear all selections so the tab shows overview mode
    setSelectedArea(null);
    setSelectedHotArea(null);
    setActiveConvergenceId(null);
    setActiveSignalId(null);
    if (ctx !== "explore") {
      setExploreClickPx(null);
      setExploreLevelOffset(0);
      setExploreResult(null);
    }
  }, []);

  // ── Chat: landscape background knowledge ──
  const landscapeData = useMemo((): LandscapeData => ({
    totalPatents: activePatents.length,
    totalClusters: Object.keys(activeClusters).length,
    zones: Object.values(activeAreas).map((a) => ({
      id: a.id,
      label: a.label,
      keywords: a.keywords,
      summary: a.summary,
      clusterCount: a.cluster_count,
      patentCount: a.patent_count,
      trend: a.trend,
    })),
    hotAreas: Object.values(activeHotAreas).map((h) => ({
      id: h.id,
      label: h.label,
      keywords: h.keywords,
      summary: h.summary,
      clusterCount: h.cluster_count,
      patentCount: h.patent_count,
    })),
    players: players.map((p) => ({
      name: p.name,
      totalPatents: p.totalPatents,
      topAreas: p.topAreas.slice(0, 3).map((a) => ({ label: a.label })),
    })),
    clusters: Object.values(activeClusters).map((c) => {
      const zone = Object.values(activeAreas).find((a) => a.cluster_ids?.includes(c.id));
      return {
        id: c.id,
        label: c.label,
        count: c.count,
        keywords: (c.keywords || c.compound_keywords || []).join(", "),
        zoneId: zone?.id,
      };
    }),
  }), [activePatents, activeClusters, activeAreas, activeHotAreas, players]);

  // ── Chat: current map selection context ──
  const chatMapSelection = useMemo((): MapSelection => {
    const sel: MapSelection = { tab: sectionContext };

    if (sectionContext === "keyAreas" && activeAreaId != null) {
      const area = activeAreas[String(activeAreaId)];
      if (area) {
        sel.activeZone = {
          id: area.id, label: area.label, keywords: area.keywords,
          summary: area.summary, clusterCount: area.cluster_count,
          patentCount: area.patent_count, trend: area.trend,
        };
      }
    }

    if (sectionContext === "hotAreas" && activeHotAreaId != null) {
      const ha = activeHotAreas[String(activeHotAreaId)];
      if (ha) {
        sel.activeHotArea = {
          id: ha.id, label: ha.label, keywords: ha.keywords,
          summary: ha.summary, clusterCount: ha.cluster_count,
          patentCount: ha.patent_count,
        };
      }
    }

    if (sectionContext === "explore" && exploreResult) {
      sel.exploreSelection = {
        clusterCount: exploreResult.clusterCount,
        patentCount: exploreResult.patentCount,
        topKeywords: exploreResult.topKeywords,
        clusterDetails: exploreResult.enclosedClusterIds.slice(0, 20).map((cid) => {
          const cl = activeClusters[String(cid)];
          return cl ? { id: cl.id, label: cl.label, count: cl.count } : { id: cid, label: "", count: 0 };
        }),
      };
    }

    if (sectionContext === "players" && selectedPlayers.length > 0) {
      sel.selectedPlayers = selectedPlayersData.map((p) => ({
        name: p.name, totalPatents: p.totalPatents,
        topAreas: p.topAreas.slice(0, 3).map((a) => ({ label: a.label })),
      }));
      sel.selectedYear = selectedYear;
    }

    return sel;
  }, [sectionContext, activeAreaId, activeAreas, activeHotAreaId, activeHotAreas,
      exploreResult, activeClusters, selectedPlayers, selectedPlayersData, selectedYear]);

  // ── Chat: pending context from AI buttons + map action handler ──
  const [pendingChatContext, setPendingChatContext] = useState<{
    text: string;
    selection: MapSelection;
    section?: "keyAreas" | "hotAreas" | "currents" | "explore";
    areaData?: { label: string; patents: number; clusters: number; keywords?: string; summary?: string };
  } | null>(null);
  const [highlightChat, setHighlightChat] = useState(false);

  const handleAskAI = useCallback((contextText: string, section?: string, areaData?: { label: string; patents: number; clusters: number; keywords?: string; summary?: string }) => {
    if (section === "explore") {
      setIsSummarizing(true);
    }
    setPendingChatContext({
      text: contextText,
      selection: chatMapSelection,
      section: section as "keyAreas" | "hotAreas" | "currents" | "explore" | undefined,
      areaData,
    });
  }, [chatMapSelection]);

  // Zone regeneration handler
  const handleRegenerateZones = useCallback(async (targetAreas: number) => {
    setIsRegenerating(true);
    try {
      const result = await regenerateZones(targetAreas);
      // Convert to AreaInfo format
      const newAreas: Record<string, AreaInfo> = {};
      for (const [id, area] of Object.entries(result.areas)) {
        newAreas[id] = area as AreaInfo;
      }
      setCustomAreas(newAreas);
      setSelectedArea(null);
      setSectionContext("keyAreas");
    } catch (e) {
      console.error("Zone regeneration failed:", e);
    } finally {
      setIsRegenerating(false);
    }
  }, []);

  const handleMapAction = useCallback((action: MapAction) => {
    if (action.type === "updateZones" && action.targetAreas) {
      handleRegenerateZones(action.targetAreas);
    } else if (action.type === "highlightZone" && action.zoneId != null) {
      setSelectedArea(action.zoneId);
      setSectionContext("keyAreas");
    } else if (action.type === "highlightHotArea" && action.hotAreaId != null) {
      setSelectedHotArea(action.hotAreaId);
      setSectionContext("hotAreas");
    } else if (action.type === "highlightPlayer" && action.playerName) {
      setSelectedPlayers((prev) =>
        prev.includes(action.playerName!) ? prev : [...prev, action.playerName!]
      );
      setSectionContext("players");
      setShowTimeline(true);
    } else if (action.type === "suggestHotAreas" && action.areas) {
      setPendingSuggestions(action.areas);
    }
  }, [handleRegenerateZones]);

  // Params display for current dim method
  const currentParams = dimMethod === "umap"
    ? method.umap_params || { spread: 3.0, min_dist: 1.0 }
    : method.tsne_params || { perplexity: 30 };

  const paramsText = dimMethod === "umap"
    ? `spread: ${currentParams.spread}, min_dist: ${currentParams.min_dist}`
    : `perplexity: ${currentParams.perplexity}`;
  void paramsText; // currently unused; preserved from original code

  // Loading / error gate: wait for runtime-fetched reference data before rendering the UI
  if (dataError) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-sm text-red-600 gap-2">
        <div>Failed to load reference data.</div>
        <div className="text-xs text-gray-500">{dataError}</div>
      </div>
    );
  }
  if (!radar10Data || !rawCsvText) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        Loading patent data…
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b flex-shrink-0 flex-wrap">
        <div className="text-xs text-gray-600">
          {activePatents.length} patents · {Object.keys(activeClusters).length} clusters · {Object.keys(activeAreas).length} areas
        </div>

        {/* View source + dim toggles — hidden (both modes use radar10 directly) */}

        {/* Regenerating indicator */}
        {isRegenerating && (
          <>
            <div className="text-xs text-gray-400">|</div>
            <div className="text-xs text-amber-600 flex items-center gap-1">
              <span className="animate-spin">&#9696;</span> Regenerating zones...
            </div>
          </>
        )}

        {/* Year slider — show when players are selected */}
        {sectionContext === "players" && selectedPlayers.length > 0 && (
          <>
            <div className="text-xs text-gray-400">|</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Year:</span>
              <input
                type="range"
                min={yearRange[0]}
                max={yearRange[1]}
                value={selectedYear ?? yearRange[1]}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="w-32 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0d3356]"
              />
              <span className="text-xs font-medium text-gray-700 w-10">
                {selectedYear ?? yearRange[1]}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Main content: sidebar + map */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col bg-white border-r border-gray-200">
          <OverviewSidebar
            areas={activeAreas}
            activeAreaId={interactionContext === "hotAreas" ? null : activeAreaId}
            onSelectArea={handleSelectArea}
            hotAreas={activeHotAreas}
            activeHotAreaId={interactionContext === "keyAreas" ? null : activeHotAreaId}
            onSelectHotArea={handleSelectHotArea}
            sectionContext={sectionContext}
            onSectionContextChange={handleSectionContextChange}
            exploreResult={exploreResult}
            onExploreExpand={handleExploreExpand}
            onExploreContract={handleExploreContract}
            players={players}
            selectedPlayers={selectedPlayers}
            onTogglePlayer={handleTogglePlayer}
            onShowTimeline={handleShowTimeline}
            patents={activePatents}
            currentsData={viewSource === "radar10" ? radar10Currents : undefined}
            activeConvergenceId={activeConvergenceId}
            activeSignalId={activeSignalId}
            onSelectConvergence={(id) => { setActiveConvergenceId(id); setActiveSignalId(null); setSectionContext("currents"); }}
            onSelectSignal={(id) => { setActiveSignalId(id); setActiveConvergenceId(null); setSectionContext("currents"); }}
            onAskAI={handleAskAI}
            onHighlightChat={setHighlightChat}
            exploreMode={exploreMode}
            onExploreModeChange={(mode) => {
              setExploreMode(mode);
              setExploreResult(null);
              setExploreSummary(null);
              setExploreName(null);
              setExploreClickPx(null);
              setDrawPolygon(null);
            }}
            exploreSummary={exploreSummary}
            exploreName={exploreName}
            isSummarizing={isSummarizing}
            savedLayers={savedLayers}
            onSaveLayer={handleSaveLayer}
            onRemoveLayer={handleRemoveLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            isLayerSaved={isLayerSaved}
            exploreResult2={exploreResult}
            customHotAreaIds={new Set(Object.keys(customHotAreas).map(Number))}
            onRemoveCustomHotArea={handleRemoveCustomHotArea}
          />
        </div>

        {/* Map + Timeline overlay */}
        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          <div className="flex-1 min-h-0">
            <RadarMap
              patents={activePatents}
              clusters={activeClusters}
              areas={activeAreas}
              hotAreas={activeHotAreas}
              dimMethod={viewSource === "radar10" ? "umap" : dimMethod}
              viewSource={viewSource}
              interactionContext={interactionContext}
              highlightedArea={highlightedArea}
              selectedArea={selectedArea}
              highlightedHotArea={highlightedHotArea}
              selectedHotArea={selectedHotArea}
              onHighlightArea={setHighlightedArea}
              onSelectArea={handleSelectArea}
              onHighlightHotArea={setHighlightedHotArea}
              onSelectHotArea={handleSelectHotArea}
              currentsData={viewSource === "radar10" ? radar10Currents : undefined}
              activeConvergenceId={activeConvergenceId}
              activeSignalId={activeSignalId}
              selectedPlayers={selectedPlayersData}
              selectedYear={selectedYear}
              exploreClickPx={exploreClickPx}
              exploreLevelOffset={exploreLevelOffset}
              onExploreClick={handleExploreClick}
              onExploreResult={(result) => { setExploreResult(result); setExploreSummary(null); setExploreName(null); }}
              exploreLabel={exploreName && exploreResult ? { name: exploreName, clusters: exploreResult.clusterCount, patents: exploreResult.patentCount } : null}
              savedLayers={savedLayers}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((v) => !v)}
              dimensions={dimensions}
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
            />
          </div>

          {/* Player Evolution Timeline — overlays bottom of map */}
          {showTimeline && (
            <div className="absolute bottom-0 left-0 right-0 z-20">
              <PlayerTimeline
                players={players}
                selectedPlayers={selectedPlayers}
                selectedYear={selectedYear}
                yearRange={yearRange}
                onSelectYear={setSelectedYear}
                onClose={() => setShowTimeline(false)}
                isCollapsed={timelineCollapsed}
                onToggleCollapse={() => setTimelineCollapsed((v) => !v)}
              />
            </div>
          )}

          {/* AI Chatbot — floating overlay */}
          <ChatBot
            players={players}
            landscape={landscapeData}
            mapSelection={chatMapSelection}
            onMapAction={handleMapAction}
            pendingContext={pendingChatContext}
            onPendingContextHandled={() => setPendingChatContext(null)}
            highlightChat={highlightChat}
            onExploreSummary={(name, summary) => {
              setExploreName(name);
              setExploreSummary(summary);
              setIsSummarizing(false);
            }}
            pendingSuggestions={pendingSuggestions}
            onAddSuggestion={(s) => {
              handleAddSuggestedHotArea(s);
              setPendingSuggestions((prev) => prev.filter((p) => p !== s));
            }}
            onDismissSuggestions={() => setPendingSuggestions([])}
            mode={mode}
          />
        </div>
      </div>
    </div>
  );
}
