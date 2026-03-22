import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff } from "lucide-react";
import AreaItem from "./AreaItem";

type MarketCategory = "growing" | "sparse" | "major" | "avoid";

interface AreaInfo {
  id: number;
  label: string;
  count: number;
  trend: number;
  category: string;
  centroid: { x: number; y: number };
}

interface OpportunitiesSectionProps {
  areasByCategory: Record<MarketCategory, AreaInfo[]>;
  visibleCategories: Record<string, boolean>;
  visibleAreas: Record<number, boolean>;
  highlightedArea: number | null;
  expandedAreaId: number | null;
  onToggleCategoryVisibility: (category: string) => void;
  onToggleAreaVisibility: (areaId: number) => void;
  onHighlightArea: (id: number | null) => void;
  onClearExpandedArea: () => void;
  // Label editing props
  editedLabels: Record<number, string>;
  editedShortLabels: Record<number, string>;
  onEditLabel: (areaId: number, newLabel: string) => void;
  onEditShortLabel: (areaId: number, newShortLabel: string) => void;
}

const CATEGORY_CONFIG: Record<MarketCategory, { color: string; label: string; description: string }> = {
  growing: {
    color: "#166534",
    label: "Growing",
    description: "Emerging opportunity — rising trend",
  },
  sparse: {
    color: "#F97316",
    label: "Niche",
    description: "Untapped market — low count, stable trend",
  },
  major: {
    color: "#991B1B",
    label: "Established",
    description: "Crowded market — high count, stable trend",
  },
  avoid: {
    color: "#1F2937",
    label: "Avoid",
    description: "Declining market — falling trend",
  },
};

// Order: Growing, Niche (sparse), Established (major), Avoid
const CATEGORY_ORDER: MarketCategory[] = ["growing", "sparse", "major", "avoid"];

export default function OpportunitiesSection({
  areasByCategory,
  visibleCategories,
  visibleAreas,
  highlightedArea,
  expandedAreaId,
  onToggleCategoryVisibility,
  onToggleAreaVisibility,
  onHighlightArea,
  onClearExpandedArea,
  // Label editing props
  editedLabels,
  editedShortLabels,
  onEditLabel,
  onEditShortLabel,
}: OpportunitiesSectionProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    growing: true,
    sparse: true,
    major: false,
    avoid: false,
  });

  // Track whether to show all areas or just 3
  const [showAllAreas, setShowAllAreas] = useState<Record<string, boolean>>({
    growing: false,
    sparse: false,
    major: false,
    avoid: false,
  });

  // Refs for scrolling to areas
  const areaRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Handle expandedAreaId from map click
  useEffect(() => {
    if (expandedAreaId !== null) {
      // Find which category this area is in
      for (const category of CATEGORY_ORDER) {
        const areas = areasByCategory[category] || [];
        const areaIndex = areas.findIndex(a => a.id === expandedAreaId);
        if (areaIndex !== -1) {
          // Expand the category
          setExpandedCategories(prev => ({ ...prev, [category]: true }));
          
          // If area is beyond first 3, show all
          if (areaIndex >= 3) {
            setShowAllAreas(prev => ({ ...prev, [category]: true }));
          }
          
          // Scroll to the area after a short delay (to allow expansion)
          setTimeout(() => {
            areaRefs.current[expandedAreaId]?.scrollIntoView({ 
              behavior: "smooth", 
              block: "center" 
            });
          }, 100);
          
          break;
        }
      }
      
      // Clear the expanded area ID after handling
      onClearExpandedArea();
    }
  }, [expandedAreaId, areasByCategory, onClearExpandedArea]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const toggleShowAll = (category: string) => {
    setShowAllAreas(prev => ({ ...prev, [category]: !prev[category] }));
  };

  return (
    <div className="space-y-2">
      {/* Category groups */}
      {CATEGORY_ORDER.map((category) => {
        const config = CATEGORY_CONFIG[category];
        const areas = areasByCategory[category] || [];
        const isExpanded = expandedCategories[category];
        const isCategoryVisible = visibleCategories[category];
        const isShowingAll = showAllAreas[category];

        // Show only 3 by default, or all if expanded
        const displayAreas = isShowingAll ? areas : areas.slice(0, 3);

        return (
          <div
            key={category}
            className={`rounded-lg border ${
              isExpanded ? "border-gray-200 bg-white" : "border-transparent"
            }`}
          >
            {/* Category header */}
            <div
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
                ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50"}
              `}
              onClick={() => toggleCategory(category)}
            >
              {/* Expand icon */}
              <span className="text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>

              {/* Category dot + label */}
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: config.color }}
              />
              <span className="font-medium" style={{ color: config.color }}>
                {config.label}
              </span>
              <span className="text-gray-400">({areas.length})</span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Category visibility toggle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCategoryVisibility(category);
                }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                title={isCategoryVisible ? "Hide all" : "Show all"}
              >
                {isCategoryVisible ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Areas list */}
            {isExpanded && areas.length > 0 && (
              <div className="px-2 pb-2 space-y-1">
                {displayAreas.map((area) => (
                  <div 
                    key={area.id}
                    ref={(el) => (areaRefs.current[area.id] = el)}
                  >
                    <AreaItem
                      area={area}
                      isHighlighted={highlightedArea === area.id}
                      isVisible={visibleAreas[area.id] !== false && isCategoryVisible}
                      forceExpanded={expandedAreaId === area.id}
                      onHover={onHighlightArea}
                      onToggleVisibility={onToggleAreaVisibility}
                      // Label editing props
                      editedLabel={editedLabels[area.id]}
                      editedShortLabel={editedShortLabels[area.id]}
                      onEditLabel={onEditLabel}
                      onEditShortLabel={onEditShortLabel}
                    />
                  </div>
                ))}

                {/* Show all / Collapse button */}
                {areas.length > 3 && (
                  <button
                    onClick={() => toggleShowAll(category)}
                    className="w-full mt-1 py-1.5 text-sm text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    {isShowingAll ? "Collapse" : `Show all ${areas.length}`}
                  </button>
                )}
              </div>
            )}

            {/* Empty state */}
            {isExpanded && areas.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400">
                No areas in this category
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}