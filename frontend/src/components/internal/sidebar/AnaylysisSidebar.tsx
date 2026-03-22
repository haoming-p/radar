import { useState, useRef, useEffect, ReactNode } from "react";
import { ChevronDown, ChevronRight, HelpCircle, X, FileText, Search, Eye, EyeOff } from "lucide-react";
import TopicsSection from "./TopicsSection";
import OpportunitiesSection from "./OpportunitiesSection";
import PlayersSection, { PlayerInfo } from "./PlayersSection";
import HighlightsSection from "./HighlightsSection";

// ============ TYPES ============
type MarketCategory = "major" | "growing" | "sparse" | "avoid";
type SectionId = "opportunities" | "topics" | "players" | "highlights" | "report";

interface AreaInfo {
  id: number;
  label: string;
  count: number;
  trend: number;
  category: string;
  centroid: { x: number; y: number };
}

interface TopicInfo {
  id: number;
  label: string;
  totalPatents: number;
  areaCount: number;
  areas: {
    area_id: number;
    count: number;
    category: string;
    trend: number;
    centroid: { x: number; y: number };
    label: string;
  }[];
}

interface AnalysisSidebarProps {
  areasByCategory: Record<MarketCategory, AreaInfo[]>;
  topics: Record<string, TopicInfo>;
  areas: Record<string, AreaInfo>;
  visibleCategories: Record<string, boolean>;
  visibleAreas: Record<number, boolean>;
  highlightedArea: number | null;
  expandedAreaId: number | null;
  onToggleCategoryVisibility: (category: string) => void;
  onToggleAreaVisibility: (areaId: number) => void;
  onHighlightArea: (id: number | null) => void;
  onClearExpandedArea: () => void;
  onExpandArea: (areaId: number) => void;  // NEW: scroll to + expand area in sidebar
  // Player props
  players: PlayerInfo[];
  selectedPlayers: string[];
  onTogglePlayer: (playerName: string) => void;
  onShowTimeline: (playerName: string) => void;
  onTogglePlayersVisibility: () => void;  // NEW: toggle top 3 players on/off
  // Label editing props
  editedLabels: Record<number, string>;
  editedShortLabels: Record<number, string>;
  onEditLabel: (areaId: number, newLabel: string) => void;
  onEditShortLabel: (areaId: number, newShortLabel: string) => void;
  // Report props
  onOpenReport: () => void;
  // Highlights props
  onHighlightsChange: (isActive: boolean) => void;
}

// ============ SECTION ACCORDION (inline) ============
interface SectionAccordionProps {
  title: string;
  count?: number;
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  comingSoon?: boolean;
  helpContent?: ReactNode;
  actionButton?: ReactNode;  // NEW: optional action button (e.g., eye icon)
  children: ReactNode;
}

function SectionAccordion({
  title,
  count,
  isExpanded,
  onToggle,
  disabled = false,
  comingSoon = false,
  helpContent,
  actionButton,
  children,
}: SectionAccordionProps) {
  const [showHelp, setShowHelp] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);

  // Close help when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setShowHelp(false);
      }
    };
    if (showHelp) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showHelp]);

  const handleClick = () => {
    if (!disabled && !comingSoon) {
      onToggle();
    }
  };

  const handleHelpClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowHelp(!showHelp);
  };

  return (
    <div className="border-b border-gray-200 last:border-b-0">
      {/* Header */}
      <div className="relative">
        <button
          onClick={handleClick}
          disabled={disabled || comingSoon}
          className={`
            w-full flex items-center gap-2 px-4 py-3 text-left
            transition-colors
            ${disabled || comingSoon 
              ? "cursor-not-allowed opacity-50" 
              : "hover:bg-gray-50 cursor-pointer"
            }
          `}
        >
          {/* Expand icon */}
          <span className="text-gray-400">
            {isExpanded ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
          </span>

          {/* Title */}
          <span className="font-medium text-gray-900 flex-1">
            {title}
            {count !== undefined && (
              <span className="text-gray-400 font-normal ml-2">({count})</span>
            )}
          </span>

          {/* Action button (e.g., eye icon for Players) */}
          {actionButton}

          {/* Help icon */}
          {helpContent && (
            <span
              onClick={handleHelpClick}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </span>
          )}

          {/* Coming soon badge */}
          {comingSoon && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
              coming soon
            </span>
          )}
        </button>

        {/* Help popup */}
        {showHelp && helpContent && (
          <div
            ref={helpRef}
            className="absolute z-30 left-4 right-4 top-full mt-1 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-sm"
          >
            <button
              onClick={() => setShowHelp(false)}
              className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
            {helpContent}
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && !disabled && !comingSoon && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ============ HELP CONTENT ============
const OpportunitiesHelp = () => (
  <div className="pr-4">
    <div className="space-y-3 text-gray-600">
      <div>
        <span className="font-medium text-gray-900">Market categories</span> are based on patent count and trend:
        <ul className="mt-1 ml-4 space-y-0.5">
          <li><span className="text-green-600 font-medium">Growing</span>: Emerging opportunity — rising trend (↑30%+)</li>
          <li><span className="text-orange-500 font-medium">Niche</span>: Untapped market — low count, stable trend</li>
          <li><span className="text-red-800 font-medium">Established</span>: Crowded market — high count, stable trend</li>
          <li><span className="text-gray-800 font-medium">Avoid</span>: Declining market — falling trend (↓30%+)</li>
        </ul>
      </div>
      <div>
        <span className="font-medium text-gray-900">Market trend</span> compares patent activity in the last 3 years (2023-2025) vs historical years (2015-2022).
      </div>
    </div>
  </div>
);

const TopicsHelp = () => (
  <div className="pr-4">
    <div className="space-y-2 text-gray-600">
      <p>
        <span className="font-medium text-gray-900">Topics</span> are semantic clusters of patents grouped by similar technology themes.
      </p>
      <p>
        Each topic contains multiple <span className="font-medium">areas</span> (geographic regions on the map) that share the same technical focus.
      </p>
    </div>
  </div>
);

const PlayersHelp = () => (
  <div className="pr-4">
    <div className="space-y-2 text-gray-600">
      <p>
        <span className="font-medium text-gray-900">Players</span> shows the top patent applicants and their activity across different areas.
      </p>
      <p>
        Analyze competitor positioning and identify key players in each market segment.
      </p>
    </div>
  </div>
);

const HighlightsHelp = () => (
  <div className="pr-4">
    <div className="space-y-2 text-gray-600">
      <p>
        <span className="font-medium text-gray-900">Highlights</span> provides an overview of the dataset with charts and statistics.
      </p>
      <p>
        View trends over time, player activity, and market distribution at a glance.
      </p>
    </div>
  </div>
);

const ReportHelp = () => (
  <div className="pr-4">
    <div className="space-y-2 text-gray-600">
      <p>
        <span className="font-medium text-gray-900">Generate Report</span> creates a downloadable PDF report.
      </p>
      <p>
        Export your analysis including opportunities, topics, and player insights.
      </p>
    </div>
  </div>
);

// ============ SECTIONS CONFIG ============
const SECTIONS: { id: SectionId; label: string; comingSoon?: boolean }[] = [
  { id: "opportunities", label: "Opportunities" },
  { id: "topics", label: "Topics" },
  { id: "players", label: "Players" },
  { id: "highlights", label: "Highlights" },
  { id: "report", label: "Generate Report" },
];

// ============ MAIN COMPONENT ============
export default function AnalysisSidebar({
  areasByCategory,
  topics,
  areas,
  visibleCategories,
  visibleAreas,
  highlightedArea,
  expandedAreaId,
  onToggleCategoryVisibility,
  onToggleAreaVisibility,
  onHighlightArea,
  onClearExpandedArea,
  onExpandArea,
  // Player props
  players,
  selectedPlayers,
  onTogglePlayer,
  onShowTimeline,
  onTogglePlayersVisibility,
  // Label editing props
  editedLabels,
  editedShortLabels,
  onEditLabel,
  onEditShortLabel,
  // Report props
  onOpenReport,
  // Highlights props
  onHighlightsChange,
}: AnalysisSidebarProps) {
  // Track which section is currently active (for dropdown label)
  const [activeSection, setActiveSection] = useState<SectionId>("opportunities");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Record<SectionId, boolean>>({
    opportunities: true,
    topics: false,
    players: false,
    highlights: false,
    report: false,
  });

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Section refs for scrolling
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    opportunities: null,
    topics: null,
    players: null,
    highlights: null,
    report: null,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Notify parent when highlights state changes
  useEffect(() => {
    onHighlightsChange(activeSection === "highlights");
  }, [activeSection, onHighlightsChange]);

  const toggleSection = (sectionId: SectionId) => {
    const isExpanding = !expandedSections[sectionId];
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    
    // Update active section when expanding
    if (isExpanding) {
      setActiveSection(sectionId);
    }
  };

  const jumpToSection = (sectionId: SectionId) => {
    // Update active section
    setActiveSection(sectionId);
    
    // Expand the section
    setExpandedSections(prev => ({ ...prev, [sectionId]: true }));
    
    // Scroll to section
    setTimeout(() => {
      sectionRefs.current[sectionId]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    
    setDropdownOpen(false);
  };

  // Get active section label for dropdown
  const activeSectionLabel = SECTIONS.find(s => s.id === activeSection)?.label || "Opportunities";

  // Count totals
  const totalTopics = Object.keys(topics).filter(k => Number(k) !== -1).length;

  // Search results - filter areas by keyword
  const searchResults = searchQuery.trim() 
    ? Object.values(areas).filter(area => {
        const label = editedLabels[area.id] || area.label || "";
        return label.toLowerCase().includes(searchQuery.toLowerCase());
      }).slice(0, 10) // Limit to 10 results
    : [];

  // Handle search result click
  const handleSearchResultClick = (area: AreaInfo) => {
    // Clear search
    setSearchQuery("");
    
    // Switch to opportunities section
    setActiveSection("opportunities");
    setExpandedSections(prev => ({ ...prev, opportunities: true }));
    
    // Make sure the area's category is visible
    if (!visibleCategories[area.category]) {
      onToggleCategoryVisibility(area.category);
    }
    
    // Make sure the area itself is visible
    if (!visibleAreas[area.id]) {
      onToggleAreaVisibility(area.id);
    }
    
    // Highlight on map + scroll to and expand in sidebar
    onHighlightArea(area.id);
    onExpandArea(area.id);
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full">
      {/* Dropdown header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-sm font-medium text-gray-700">{activeSectionLabel}</span>
            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* Dropdown menu */}
          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  onClick={() => !section.comingSoon && jumpToSection(section.id)}
                  disabled={section.comingSoon}
                  className={`
                    w-full px-3 py-2 text-left text-sm flex items-center justify-between
                    ${section.comingSoon 
                      ? "text-gray-400 cursor-not-allowed" 
                      : section.id === activeSection
                        ? "text-blue-600 bg-blue-50"
                        : "text-gray-700 hover:bg-gray-50"
                    }
                  `}
                >
                  <span>{section.label}</span>
                  {section.comingSoon && (
                    <span className="text-xs text-gray-400">coming soon</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search areas..."
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
            {searchResults.map((area) => {
              // Get display name and color for category
              const categoryDisplay: Record<string, { name: string; color: string }> = {
                growing: { name: "Growing", color: "#166534" },
                sparse: { name: "Niche", color: "#F97316" },
                major: { name: "Established", color: "#991B1B" },
                avoid: { name: "Avoid", color: "#1F2937" },
              };
              const catInfo = categoryDisplay[area.category] || { name: area.category, color: "#6B7280" };
              
              return (
                <button
                  key={area.id}
                  onClick={() => handleSearchResultClick(area)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900 truncate">
                    {editedLabels[area.id] || area.label}
                  </div>
                  <div className="text-xs text-gray-500">
                    Area {area.id} · {area.count} patents · <span style={{ color: catInfo.color }}>{catInfo.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* No results */}
        {searchQuery.trim() && searchResults.length === 0 && (
          <div className="mt-2 px-3 py-2 text-sm text-gray-500 bg-gray-50 rounded-lg">
            No areas found for "{searchQuery}"
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Opportunities Section */}
        <div ref={(el) => (sectionRefs.current.opportunities = el)}>
          <SectionAccordion
            title="Opportunities"
            isExpanded={expandedSections.opportunities}
            onToggle={() => toggleSection("opportunities")}
            helpContent={<OpportunitiesHelp />}
          >
            <OpportunitiesSection
              areasByCategory={areasByCategory}
              visibleCategories={visibleCategories}
              visibleAreas={visibleAreas}
              highlightedArea={highlightedArea}
              expandedAreaId={expandedAreaId}
              onToggleCategoryVisibility={onToggleCategoryVisibility}
              onToggleAreaVisibility={onToggleAreaVisibility}
              onHighlightArea={onHighlightArea}
              onClearExpandedArea={onClearExpandedArea}
              // Label editing props
              editedLabels={editedLabels}
              editedShortLabels={editedShortLabels}
              onEditLabel={onEditLabel}
              onEditShortLabel={onEditShortLabel}
            />
          </SectionAccordion>
        </div>

        {/* Topics Section */}
        <div ref={(el) => (sectionRefs.current.topics = el)}>
          <SectionAccordion
            title="Topics"
            count={totalTopics}
            isExpanded={expandedSections.topics}
            onToggle={() => toggleSection("topics")}
            helpContent={<TopicsHelp />}
          >
            <TopicsSection
              topics={topics}
              areas={areas}
              visibleAreas={visibleAreas}
              highlightedArea={highlightedArea}
              onToggleAreaVisibility={onToggleAreaVisibility}
              onHighlightArea={onHighlightArea}
              // Label editing props
              editedLabels={editedLabels}
              editedShortLabels={editedShortLabels}
              onEditLabel={onEditLabel}
              onEditShortLabel={onEditShortLabel}
            />
          </SectionAccordion>
        </div>

        {/* Players Section */}
        <div ref={(el) => (sectionRefs.current.players = el)}>
          <SectionAccordion
            title="Players"
            count={players.length}
            isExpanded={expandedSections.players}
            onToggle={() => toggleSection("players")}
            helpContent={<PlayersHelp />}
            actionButton={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlayersVisibility();
                }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                title={selectedPlayers.length > 0 ? "Hide all players" : "Show top 3 players"}
              >
                {selectedPlayers.length > 0 ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            }
          >
            <PlayersSection
              players={players}
              selectedPlayers={selectedPlayers}
              onTogglePlayer={onTogglePlayer}
              onShowTimeline={onShowTimeline}
            />
          </SectionAccordion>
        </div>

        {/* Highlights Section */}
        <div ref={(el) => (sectionRefs.current.highlights = el)}>
          <SectionAccordion
            title="Highlights"
            isExpanded={expandedSections.highlights}
            onToggle={() => toggleSection("highlights")}
            helpContent={<HighlightsHelp />}
          >
            <HighlightsSection />
          </SectionAccordion>
        </div>

        {/* Generate Report Section */}
        <div ref={(el) => (sectionRefs.current.report = el)}>
          <SectionAccordion
            title="Generate Report"
            isExpanded={expandedSections.report}
            onToggle={() => toggleSection("report")}
            helpContent={<ReportHelp />}
          >
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Export your analysis as a PNG image or generate a comprehensive PDF report.
              </p>
              <button
                onClick={onOpenReport}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">Generate Report</span>
              </button>
            </div>
          </SectionAccordion>
        </div>
      </div>
    </div>
  );
}