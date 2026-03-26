import { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle, CircleDashed, Sparkles, TrendingUp, List, Loader2, Plus, Check, Eye, EyeOff, Trash2, Layers, X } from "lucide-react";
import { AreaInfo, HotAreaInfo, PatentPoint, InteractionContext, ExploreResult, CurrentsData, SavedLayer } from "../map/RadarMap";
import PlayersSection, { PlayerInfo } from "./PlayersSection";

// ── Color variants ──

const VARIANTS = {
  keyArea: {
    activeBorder: "border-l-indigo-400",
    activeText: "text-indigo-700",
  },
  hotArea: {
    activeBorder: "border-l-amber-400",
    activeText: "text-amber-700",
  },
} as const;

type Variant = keyof typeof VARIANTS;

// ── Area item ──

interface AreaItemProps {
  area: AreaInfo;
  isActive: boolean;
  variant: Variant;
  section: "keyAreas" | "hotAreas";
  onClick: () => void;
  onAskAI?: (text: string, section: string, areaData: { label: string; patents: number; clusters: number; keywords?: string; summary?: string }) => void;
  onHighlightChat?: (highlight: boolean) => void;
  onSave?: () => void;
  isSaved?: boolean;
}

function AreaItem({ area, isActive, variant, section, onClick, onAskAI, onHighlightChat, onSave, isSaved }: AreaItemProps) {
  const v = VARIANTS[variant];
  return (
    <div
      className={`border-b border-gray-100 transition-colors ${
        isActive ? `border-l-2 ${v.activeBorder}` : ""
      }`}
    >
      <button
        className="w-full text-left px-4 py-1.5 flex items-start gap-2 hover:bg-gray-50"
        onClick={onClick}
      >
        <span className="mt-0.5 flex-shrink-0 text-gray-400">
          {isActive ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${isActive ? v.activeText : "text-[#0d3356]"}`}>
            {area.label}
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {area.cluster_count} clusters · {area.patent_count} patents
          </div>
        </div>
      </button>

      {isActive && (
        <div className="px-4 pb-2.5 pl-9">
          {area.summary && (
            <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">
              {area.summary}
            </p>
          )}
          {area.keywords && (
            <div>
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Keywords
              </div>
              <div className="flex flex-wrap gap-1">
                {area.keywords.split(", ").slice(0, 10).map((kw, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex items-center gap-3">
            {onAskAI && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const sectionLabel = section === "keyAreas" ? "Territory Zone" : "Hot Map";
                  onAskAI(
                    `${sectionLabel} - "${area.label}" (${area.patent_count} patents, ${area.cluster_count} clusters)`,
                    section,
                    { label: area.label, patents: area.patent_count, clusters: area.cluster_count, keywords: area.keywords, summary: area.summary },
                  );
                }}
                onMouseEnter={() => onHighlightChat?.(true)}
                onMouseLeave={() => onHighlightChat?.(false)}
                className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 transition-colors"
              >
                <Sparkles size={11} />
                Ask AI
              </button>
            )}
            {onSave && (
              <button
                onClick={(e) => { e.stopPropagation(); onSave(); }}
                className={`flex items-center gap-1 text-[10px] transition-colors ${
                  isSaved ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
                }`}
                title={isSaved ? "Saved to layers" : "Save to layers"}
              >
                {isSaved ? <Check size={11} /> : <Plus size={11} />}
                {isSaved ? "Saved" : "Save"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tooltip ──

function InfoButton({ onClick }: { onClick: (e: React.MouseEvent) => void }) {
  return (
    <button onClick={onClick} className="text-gray-400 hover:text-gray-500 ml-1">
      <HelpCircle size={13} />
    </button>
  );
}

function InfoPanel({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <div className="relative z-40">
      <div className="absolute left-0 right-0 mx-0 p-3 bg-white border border-gray-200 rounded-b-lg shadow-md text-[11px] text-gray-600 leading-relaxed">
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="absolute top-2 right-3 text-gray-400 hover:text-gray-600 text-sm leading-none"
        >
          &times;
        </button>
        <div className="pr-4">{text}</div>
      </div>
    </div>
  );
}

// ── Sidebar ──

interface OverviewSidebarProps {
  areas: Record<string, AreaInfo>;
  activeAreaId: number | null;
  onSelectArea: (id: number) => void;
  hotAreas: Record<string, HotAreaInfo>;
  activeHotAreaId: number | null;
  onSelectHotArea: (id: number) => void;
  sectionContext: InteractionContext;
  onSectionContextChange: (ctx: InteractionContext) => void;
  exploreResult: ExploreResult | null;
  onExploreExpand: () => void;
  onExploreContract: () => void;
  // Currents
  patents?: PatentPoint[];
  currentsData?: CurrentsData;
  activeConvergenceId: number | null;
  activeSignalId: number | null;
  onSelectConvergence: (id: number | null) => void;
  onSelectSignal: (id: number | null) => void;
  // Players
  players: PlayerInfo[];
  selectedPlayers: string[];
  onTogglePlayer: (playerName: string) => void;
  onShowTimeline: (playerName: string) => void;
  // AI
  onAskAI?: (contextText: string, section?: string, areaData?: { label: string; patents: number; clusters: number; keywords?: string; summary?: string }) => void;
  onHighlightChat?: (highlight: boolean) => void;
  // Explore mode
  exploreMode?: "contour" | "draw";
  onExploreModeChange?: (mode: "contour" | "draw") => void;
  exploreSummary?: string | null;
  exploreName?: string | null;
  isSummarizing?: boolean;
  // Layers
  savedLayers: SavedLayer[];
  onSaveLayer: (layer: Omit<SavedLayer, "id" | "visible">) => void;
  onRemoveLayer: (layerId: string) => void;
  onToggleLayerVisibility: (layerId: string) => void;
  isLayerSaved: (section: string, itemId: number | string) => boolean;
  exploreResult2?: ExploreResult | null; // for saving explore data
  customHotAreaIds?: Set<number>;
  onRemoveCustomHotArea?: (id: number) => void;
}

export default function OverviewSidebar({
  areas,
  activeAreaId,
  onSelectArea,
  hotAreas,
  activeHotAreaId,
  onSelectHotArea,
  sectionContext,
  onSectionContextChange,
  exploreResult,
  onExploreExpand,
  onExploreContract,
  players,
  selectedPlayers,
  onTogglePlayer,
  onShowTimeline,
  onAskAI,
  onHighlightChat,
  patents = [],
  currentsData,
  activeConvergenceId,
  activeSignalId,
  onSelectConvergence,
  onSelectSignal,
  exploreMode = "contour",
  onExploreModeChange,
  exploreSummary,
  exploreName,
  isSummarizing,
  savedLayers,
  onSaveLayer,
  onRemoveLayer,
  onToggleLayerVisibility,
  isLayerSaved,
  exploreResult2,
  customHotAreaIds = new Set(),
  onRemoveCustomHotArea,
}: OverviewSidebarProps) {
  const [keyAreasOpen, setKeyAreasOpen] = useState(true);
  const [hotAreasOpen, setHotAreasOpen] = useState(false);
  const [currentsOpen, setCurrentsOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [signalPatentsOpen, setSignalPatentsOpen] = useState<number | null>(null);
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);

  // Collapse all sections except the one being opened
  const collapseOthers = (except: string) => {
    if (except !== "keyAreas") setKeyAreasOpen(false);
    if (except !== "hotAreas") setHotAreasOpen(false);
    if (except !== "currents") setCurrentsOpen(false);
    if (except !== "explore") setExploreOpen(false);
    if (except !== "players") setPlayersOpen(false);
    if (except !== "layers") setLayersOpen(false);
  };
  const [infoOpen, setInfoOpen] = useState<"keyAreas" | "hotAreas" | "currents" | "players" | null>(null);

  const sortedAreas = Object.values(areas).sort((a, b) => b.patent_count - a.patent_count);
  const sortedHotAreas = Object.values(hotAreas).sort((a, b) => b.patent_count - a.patent_count);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* ── Territory Zones ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "keyAreas" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "keyAreas") {
            setKeyAreasOpen((v) => !v);
          } else {
            collapseOthers("keyAreas");
            setKeyAreasOpen(true);
            onSectionContextChange("keyAreas");
          }
        }}
      >
        <span className="text-gray-400">
          {keyAreasOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${
              sectionContext === "keyAreas" ? "text-[#0d3356]" : "text-gray-600"
            }`}>
              Territory Zones
            </span>
            <InfoButton onClick={(e) => { e.stopPropagation(); setInfoOpen((v) => v === "keyAreas" ? null : "keyAreas"); }} />
            <span className="text-[10px] text-gray-400 ml-auto">{sortedAreas.length}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Here's the landscape divided into major regions</p>
        </div>
      </button>

      {infoOpen === "keyAreas" && (
        <InfoPanel
          text="Landscape divided into major technology regions by clustering patent groups by proximity. Outliers excluded."
          onClose={() => setInfoOpen(null)}
        />
      )}

      {keyAreasOpen && sortedAreas.map((area) => (
        <AreaItem
          key={`ka-${area.id}`}
          area={area}
          isActive={area.id === activeAreaId}
          variant="keyArea"
          section="keyAreas"
          onClick={() => onSelectArea(area.id)}
          onAskAI={onAskAI}
          onHighlightChat={onHighlightChat}
          onSave={() => onSaveLayer({ section: "keyAreas", itemId: area.id })}
          isSaved={isLayerSaved("keyAreas", area.id)}
        />
      ))}

      {/* ── Currents ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "currents" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "currents") {
            setCurrentsOpen((v) => !v);
          } else {
            collapseOthers("currents");
            setCurrentsOpen(true);
            onSectionContextChange("currents");
          }
        }}
      >
        <span className="text-gray-400">
          {currentsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${
              sectionContext === "currents" ? "text-[#0d3356]" : "text-gray-600"
            }`}>
              Currents
            </span>
            <InfoButton onClick={(e) => { e.stopPropagation(); setInfoOpen((v) => v === "currents" ? null : "currents"); }} />
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Where different zones overlap and what's growing fast</p>
        </div>
      </button>

      {infoOpen === "currents" && (
        <InfoPanel
          text="Overlap zones are places where clusters from different territory zones are spatially close and growing — technologies flowing toward a common destination. Emerging spots are individual fast-growing clusters worth noticing."
          onClose={() => setInfoOpen(null)}
        />
      )}

      {currentsOpen && currentsData && (
        <div>
          {/* Overlap Zones */}
          {currentsData.convergence_regions.length > 0 && (
            <div className="px-4 pt-2 pb-1">
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Convergence Regions
              </div>
            </div>
          )}
          {currentsData.convergence_regions.slice(0, 3).map((cr) => (
            <div
              key={`cr-${cr.id}`}
              className={`border-b border-gray-100 transition-colors ${
                activeConvergenceId === cr.id ? "border-l-2 border-l-red-400" : ""
              }`}
            >
              <button
                className="w-full text-left px-4 py-1.5 flex items-start gap-2 hover:bg-gray-50"
                onClick={() => onSelectConvergence(activeConvergenceId === cr.id ? null : cr.id)}
              >
                <span className="mt-0.5 flex-shrink-0 text-gray-400">
                  {activeConvergenceId === cr.id ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${activeConvergenceId === cr.id ? "text-red-700" : "text-[#0d3356]"}`}>
                    {cr.name}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {cr.cluster_count} clusters · {cr.total_patents} patents · {cr.zone_names.length} zones
                  </div>
                </div>
              </button>

              {activeConvergenceId === cr.id && (
                <div className="px-4 pb-2.5 pl-9">
                  <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">
                    {cr.description}
                  </p>
                  <div className="text-[10px] text-gray-500 mb-1.5">
                    <span className="font-medium">Zones:</span> {cr.zone_names.join(", ")}
                  </div>
                  {cr.why_care && (
                    <p className="text-[10px] text-red-700 leading-relaxed mb-1.5">
                      {cr.why_care}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-3">
                    {onAskAI && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAskAI(
                            `Currents - "${cr.name}" (${cr.total_patents} patents, ${cr.zone_names.length} zones)`,
                            "currents",
                            { label: cr.name, patents: cr.total_patents, clusters: cr.cluster_count, keywords: cr.zone_names.join(", "), summary: cr.description },
                          );
                        }}
                        onMouseEnter={() => onHighlightChat?.(true)}
                        onMouseLeave={() => onHighlightChat?.(false)}
                        className="flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 transition-colors"
                      >
                        <Sparkles size={11} />
                        Ask AI
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onSaveLayer({ section: "convergence", itemId: cr.id }); }}
                      className={`flex items-center gap-1 text-[10px] transition-colors ${
                        isLayerSaved("convergence", cr.id) ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {isLayerSaved("convergence", cr.id) ? <Check size={11} /> : <Plus size={11} />}
                      {isLayerSaved("convergence", cr.id) ? "Saved" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Emerging Spots */}
          {currentsData.signals.length > 0 && (
            <div className="px-4 pt-2 pb-1">
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                Emerging Spots
              </div>
            </div>
          )}
          {currentsData.signals.slice(0, 2).map((sig) => {
            // Compute "since 2022" count
            const clusterPatents = patents.filter((p) => p.cluster_id === sig.cluster_id);
            const recentCount = clusterPatents.filter((p) => p.year != null && p.year >= 2022).length;
            const isPatentListOpen = signalPatentsOpen === sig.id;

            return (
              <div
                key={`sig-${sig.id}`}
                className={`border-b border-gray-100 transition-colors ${
                  activeSignalId === sig.id ? "border-l-2 border-l-orange-400" : ""
                }`}
              >
                <button
                  className="w-full text-left px-4 py-1.5 flex items-start gap-2 hover:bg-gray-50"
                  onClick={() => onSelectSignal(activeSignalId === sig.id ? null : sig.id)}
                >
                  <span className="mt-1 flex-shrink-0">
                    <TrendingUp size={10} className={activeSignalId === sig.id ? "text-orange-500" : "text-gray-400"} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-medium ${activeSignalId === sig.id ? "text-orange-700" : "text-[#0d3356]"}`}>
                      {sig.name}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {sig.cluster_count} patents{recentCount > 0 ? ` (${recentCount} since 2022)` : ""}
                    </div>
                  </div>
                </button>

                {activeSignalId === sig.id && (
                  <div className="px-4 pb-2.5 pl-9">
                    <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">
                      {sig.description}
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setSignalPatentsOpen(isPatentListOpen ? null : sig.id); }}
                        className="flex items-center gap-1 text-[10px] text-orange-600 hover:text-orange-700 transition-colors"
                      >
                        <List size={11} />
                        {isPatentListOpen ? "Hide patent list" : "Show patent list"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSaveLayer({ section: "signal", itemId: sig.id }); }}
                        className={`flex items-center gap-1 text-[10px] transition-colors ${
                          isLayerSaved("signal", sig.id) ? "text-emerald-600" : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {isLayerSaved("signal", sig.id) ? <Check size={11} /> : <Plus size={11} />}
                        {isLayerSaved("signal", sig.id) ? "Saved" : "Save"}
                      </button>
                    </div>
                    {isPatentListOpen && (
                      <div className="mt-1.5 max-h-48 overflow-y-auto">
                        {clusterPatents
                          .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
                          .slice(0, 20)
                          .map((p, i) => (
                            <div key={i} className="flex items-start gap-1.5 py-0.5">
                              <span className="text-[9px] text-gray-400 flex-shrink-0 w-7">{p.year ?? "—"}</span>
                              <span className="text-[9px] text-gray-600 leading-tight">{p.title}</span>
                            </div>
                          ))}
                        {clusterPatents.length > 20 && (
                          <div className="text-[9px] text-gray-400 mt-1">
                            +{clusterPatents.length - 20} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Hot Map ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "hotAreas" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "hotAreas") {
            setHotAreasOpen((v) => !v);
          } else {
            collapseOthers("hotAreas");
            setHotAreasOpen(true);
            onSectionContextChange("hotAreas");
          }
        }}
      >
        <span className="text-gray-400">
          {hotAreasOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${
              sectionContext === "hotAreas" ? "text-[#0d3356]" : "text-gray-600"
            }`}>
              Heatmap
            </span>
            <InfoButton onClick={(e) => { e.stopPropagation(); setInfoOpen((v) => v === "hotAreas" ? null : "hotAreas"); }} />
            <span className="text-[10px] text-gray-400 ml-auto">{sortedHotAreas.length}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Here's where the density is highest</p>
        </div>
      </button>

      {infoOpen === "hotAreas" && (
        <InfoPanel
          text="High-concentration zones detected from the density heatmap — boundaries follow the contour lines you see on the map."
          onClose={() => setInfoOpen(null)}
        />
      )}

      {hotAreasOpen && sortedHotAreas.map((area) => (
        <div key={`ha-wrap-${area.id}`} className="relative">
          <AreaItem
            key={`ha-${area.id}`}
            area={area}
            isActive={area.id === activeHotAreaId}
            variant="hotArea"
            section="hotAreas"
            onClick={() => onSelectHotArea(area.id)}
            onAskAI={onAskAI}
            onHighlightChat={onHighlightChat}
            onSave={() => onSaveLayer({ section: "hotAreas", itemId: area.id })}
            isSaved={isLayerSaved("hotAreas", area.id)}
          />
          {customHotAreaIds.has(area.id) && onRemoveCustomHotArea && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemoveCustomHotArea(area.id); }}
              className="absolute top-1.5 right-2 p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors"
              title="Remove AI-discovered area"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}

      {/* ── Player Trend ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "players" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "players") {
            setPlayersOpen((v) => !v);
          } else {
            collapseOthers("players");
            setPlayersOpen(true);
            onSectionContextChange("players");
          }
        }}
      >
        <span className="text-gray-400">
          {playersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${
              sectionContext === "players" ? "text-[#0d3356]" : "text-gray-600"
            }`}>
              Player Trend
            </span>
            <InfoButton onClick={(e) => { e.stopPropagation(); setInfoOpen((v) => v === "players" ? null : "players"); }} />
            <span className="text-[10px] text-gray-400 ml-auto">{players.length}</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Who's active and where</p>
        </div>
      </button>

      {infoOpen === "players" && (
        <InfoPanel
          text="Shows the top patent applicants ranked by filing count. Select players to see their positioning on the map and evolution over time."
          onClose={() => setInfoOpen(null)}
        />
      )}

      {playersOpen && (
        <div className="border-b border-gray-100">
          <PlayersSection
            players={players}
            selectedPlayers={selectedPlayers}
            onTogglePlayer={onTogglePlayer}
            onShowTimeline={onShowTimeline}
            onSavePlayer={(name) => onSaveLayer({ section: "players", itemId: name })}
            isPlayerSaved={(name) => isLayerSaved("players", name)}
          />
        </div>
      )}

      {/* ── Areas ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "explore" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "explore") {
            setExploreOpen((v) => !v);
          } else {
            collapseOthers("explore");
            setExploreOpen(true);
            onSectionContextChange("explore");
          }
        }}
      >
        <span className="text-gray-400">
          {exploreOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-semibold ${
            sectionContext === "explore" ? "text-[#0d3356]" : "text-gray-600"
          }`}>
            Areas
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">Explore any specific area yourself</p>
        </div>
      </button>

      {exploreOpen && (
        <div className="px-4 py-3 space-y-3">
          {/* Tool indicator */}
          <div className="flex items-center gap-1">
            <div className="p-1.5 rounded-md border border-gray-400 bg-gray-100 text-gray-700">
              <CircleDashed size={14} />
            </div>
          </div>

          {/* Instructions or selection details */}
          {!exploreResult ? (
            <p className="text-xs text-gray-400">
              Click on the heatmap to select a contour area.
            </p>
          ) : (
            <div className="space-y-2.5">
              {/* Stats */}
              <div className="text-xs text-gray-700">
                <span className="font-medium text-gray-900">{exploreResult.clusterCount}</span> clusters
                {" · "}
                <span className="font-medium text-gray-900">{exploreResult.patentCount}</span> patents
              </div>

              {/* AI Summary (persistent) */}
              {exploreSummary && (
                <div className="bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                  {exploreName && (
                    <div className="text-[11px] font-semibold text-gray-800 mb-1">{exploreName}</div>
                  )}
                  <div className="text-[11px] text-gray-600 leading-relaxed">
                    {exploreSummary.replace(/\*\*/g, "")}
                  </div>
                </div>
              )}

              {/* Keywords */}
              {exploreResult.topKeywords.length > 0 && (
                <div>
                  <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Top Keywords
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {exploreResult.topKeywords.map((kw, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {onAskAI && (
                <button
                  onClick={() => {
                    onAskAI(
                      `Analyze selected area: ${exploreResult.clusterCount} clusters, ${exploreResult.patentCount} patents. Keywords: ${exploreResult.topKeywords.slice(0, 5).join(", ")}`,
                      "explore",
                      {
                        label: `${exploreResult.clusterCount} clusters, ${exploreResult.patentCount} patents`,
                        patents: exploreResult.patentCount,
                        clusters: exploreResult.clusterCount,
                        keywords: exploreResult.topKeywords.slice(0, 10).join(", "),
                      }
                    );
                  }}
                  onMouseEnter={() => onHighlightChat?.(true)}
                  onMouseLeave={() => onHighlightChat?.(false)}
                  className={`mt-2 flex items-center gap-1 text-[10px] text-teal-600 hover:text-teal-700 transition-colors ${
                    isSummarizing ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  {isSummarizing ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Sparkles size={11} />
                  )}
                  {exploreSummary ? "Re-summarize this area" : "Summarize this area"}
                </button>
              )}
              {exploreSummary && exploreName && (
                <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-600">
                  <Check size={11} />
                  Saved
                </div>
              )}
            </div>
          )}

          {/* Saved explore areas */}
          {savedLayers.filter((l) => l.section === "explore" && l.exploreData).length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-2">
                Saved Areas
              </div>
              {savedLayers.filter((l) => l.section === "explore" && l.exploreData).map((layer) => (
                <div
                  key={layer.id}
                  className="mb-2 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="text-[11px] font-semibold text-gray-800">
                      {layer.exploreData!.name}
                    </div>
                    <button
                      onClick={() => onRemoveLayer(layer.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                      title="Remove"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    {layer.exploreData!.clusterCount} clusters · {layer.exploreData!.patentCount} patents
                  </div>
                  {layer.exploreData!.summary && (
                    <div className="text-[10px] text-gray-600 leading-relaxed mt-1">
                      {layer.exploreData!.summary.replace(/\*\*/g, "").slice(0, 120)}{layer.exploreData!.summary.length > 120 ? "…" : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Layers ── */}
      <button
        className={`flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 w-full text-left flex-shrink-0 ${
          sectionContext === "layers" ? "bg-gray-100" : ""
        }`}
        onClick={() => {
          if (sectionContext === "layers") {
            setLayersOpen((v) => !v);
          } else {
            collapseOthers("layers");
            setLayersOpen(true);
            onSectionContextChange("layers");
          }
        }}
      >
        <span className="text-gray-400">
          {layersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className={`text-sm font-semibold ${
              sectionContext === "layers" ? "text-[#0d3356]" : "text-gray-600"
            }`}>
              Layers
            </span>
            <Layers size={13} className="text-gray-400 ml-0.5" />
            {savedLayers.length > 0 && (
              <span className="text-[10px] text-gray-400 ml-auto">{savedLayers.length}</span>
            )}
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Saved items from all sections</p>
        </div>
      </button>

      {layersOpen && (
        <div className="border-b border-gray-100">
          {savedLayers.length === 0 ? (
            <div className="px-4 py-3 text-xs text-gray-400 text-center">
              No saved layers yet. Use the + button on any item to save it here.
            </div>
          ) : (
            <LayersContent
              savedLayers={savedLayers}
              areas={areas}
              hotAreas={hotAreas}
              currentsData={currentsData}
              players={players}
              expandedLayerId={expandedLayerId}
              onToggleExpand={(id) => setExpandedLayerId((prev) => prev === id ? null : id)}
              onToggleVisibility={onToggleLayerVisibility}
              onRemove={onRemoveLayer}
            />
          )}
        </div>
      )}

      {/* ── Generate Report ── */}
      <div className="mt-auto flex-shrink-0 border-t border-gray-200">
        <button
          onClick={() => window.open("/report", "_blank")}
          className="flex items-center gap-2 px-4 py-3 w-full text-left hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-[#0d3356]">Generate Report</span>
        </button>
      </div>
    </div>
  );
}

// ── Layers content ──

const LAYER_SECTION_LABELS: Record<string, { label: string; color: string }> = {
  keyAreas: { label: "Territory Zones", color: "text-indigo-600" },
  hotAreas: { label: "Heatmap", color: "text-amber-600" },
  convergence: { label: "Currents — Convergence", color: "text-red-600" },
  signal: { label: "Currents — Signals", color: "text-orange-600" },
  explore: { label: "Areas", color: "text-emerald-600" },
  players: { label: "Players", color: "text-purple-600" },
};

function LayersContent({
  savedLayers,
  areas,
  hotAreas,
  currentsData,
  players,
  expandedLayerId,
  onToggleExpand,
  onToggleVisibility,
  onRemove,
}: {
  savedLayers: SavedLayer[];
  areas: Record<string, AreaInfo>;
  hotAreas: Record<string, HotAreaInfo>;
  currentsData?: CurrentsData;
  players: PlayerInfo[];
  expandedLayerId: string | null;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // Group by section
  const grouped: Record<string, SavedLayer[]> = {};
  for (const layer of savedLayers) {
    const key = layer.section;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(layer);
  }

  const sectionOrder = ["keyAreas", "hotAreas", "convergence", "signal", "explore", "players"];

  return (
    <div>
      {sectionOrder.filter((s) => grouped[s]).map((sectionKey) => {
        const meta = LAYER_SECTION_LABELS[sectionKey];
        const layers = grouped[sectionKey];
        return (
          <div key={sectionKey}>
            <div className="px-4 pt-2 pb-1">
              <div className={`text-[9px] font-medium uppercase tracking-wider ${meta.color}`}>
                {meta.label}
              </div>
            </div>
            {layers.map((layer) => (
              <LayerItem
                key={layer.id}
                layer={layer}
                areas={areas}
                hotAreas={hotAreas}
                currentsData={currentsData}
                players={players}
                isExpanded={expandedLayerId === layer.id}
                onToggleExpand={() => onToggleExpand(layer.id)}
                onToggleVisibility={() => onToggleVisibility(layer.id)}
                onRemove={() => onRemove(layer.id)}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function LayerItem({
  layer,
  areas,
  hotAreas,
  currentsData,
  players,
  isExpanded,
  onToggleExpand,
  onToggleVisibility,
  onRemove,
}: {
  layer: SavedLayer;
  areas: Record<string, AreaInfo>;
  hotAreas: Record<string, HotAreaInfo>;
  currentsData?: CurrentsData;
  players: PlayerInfo[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}) {
  // Resolve display data based on section type
  let title = "";
  let subtitle = "";
  let summary = "";
  let keywords = "";

  if (layer.section === "keyAreas") {
    const area = areas[String(layer.itemId)];
    if (area) {
      title = area.label;
      subtitle = `${area.cluster_count} clusters · ${area.patent_count} patents`;
      summary = area.summary || "";
      keywords = area.keywords || "";
    }
  } else if (layer.section === "hotAreas") {
    const ha = hotAreas[String(layer.itemId)];
    if (ha) {
      title = ha.label;
      subtitle = `${ha.cluster_count} clusters · ${ha.patent_count} patents`;
      summary = ha.summary || "";
      keywords = ha.keywords || "";
    }
  } else if (layer.section === "convergence") {
    const cr = currentsData?.convergence_regions.find((c) => c.id === layer.itemId);
    if (cr) {
      title = cr.name;
      subtitle = `${cr.cluster_count} clusters · ${cr.total_patents} patents · ${cr.zone_names.length} zones`;
      summary = cr.description || "";
      keywords = cr.zone_names.join(", ");
    }
  } else if (layer.section === "signal") {
    const sig = currentsData?.signals.find((s) => s.id === layer.itemId);
    if (sig) {
      title = sig.name;
      subtitle = `${sig.cluster_count} patents`;
      summary = sig.description || "";
      keywords = sig.keywords || "";
    }
  } else if (layer.section === "explore" && layer.exploreData) {
    title = layer.exploreData.name;
    subtitle = `${layer.exploreData.clusterCount} clusters · ${layer.exploreData.patentCount} patents`;
    summary = layer.exploreData.summary;
    keywords = layer.exploreData.topKeywords.join(", ");
  } else if (layer.section === "players") {
    const player = players.find((p) => p.name === layer.itemId);
    if (player) {
      title = player.name;
      subtitle = `${player.totalPatents} patents`;
      summary = player.topAreas.slice(0, 3).map((a) => a.label.split(",")[0]).join(", ");
    }
  }

  if (!title) return null;

  return (
    <div className="border-b border-gray-100">
      <div className="flex items-center gap-1 px-4 py-1.5 hover:bg-gray-50">
        <button onClick={onToggleExpand} className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-gray-400 flex-shrink-0">
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-[#0d3356] truncate">{title}</div>
            <div className="text-[10px] text-gray-500">{subtitle}</div>
          </div>
        </button>
        <button
          onClick={onToggleVisibility}
          className={`p-0.5 rounded transition-colors ${
            layer.visible ? "text-gray-500 hover:text-gray-700" : "text-gray-300 hover:text-gray-500"
          }`}
          title={layer.visible ? "Hide on map" : "Show on map"}
        >
          {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={onRemove}
          className="p-0.5 rounded text-gray-300 hover:text-red-500 transition-colors"
          title="Remove from layers"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {isExpanded && (
        <div className="px-4 pb-2.5 pl-9">
          {summary && (
            <p className="text-[10px] text-gray-600 leading-relaxed mb-1.5">{summary}</p>
          )}
          {keywords && (
            <div>
              <div className="text-[9px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                {layer.section === "convergence" ? "Zones" : layer.section === "players" ? "Top Areas" : "Keywords"}
              </div>
              <div className="flex flex-wrap gap-1">
                {keywords.split(", ").slice(0, 10).map((kw, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
