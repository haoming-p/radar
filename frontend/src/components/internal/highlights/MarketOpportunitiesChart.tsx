import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ============ TYPES ============
type MarketCategory = "growing" | "sparse" | "major" | "avoid";

interface AreaInfo {
  id: number;
  label: string;
  count: number;
  trend: number;
  category: string;
  centroid: { x: number; y: number };
}

interface MarketOpportunitiesChartProps {
  areasByCategory: Record<MarketCategory, AreaInfo[]>;
}

// ============ CATEGORY CONFIG ============
const CATEGORY_CONFIG: Record<MarketCategory, { color: string; label: string }> = {
  growing: { color: "#166534", label: "Growing" },
  sparse: { color: "#F97316", label: "Niche" },
  major: { color: "#991B1B", label: "Established" },
  avoid: { color: "#1F2937", label: "Avoid" },
};

const CATEGORY_ORDER: MarketCategory[] = ["growing", "sparse", "major", "avoid"];
const COLUMNS = 6;

// ============ AREA CARD ============
interface AreaCardProps {
  area: AreaInfo;
  categoryColor: string;
}

function AreaCard({ area, categoryColor }: AreaCardProps) {
  // Format trend as percentage
  const trendPercent = Math.round((area.trend - 1) * 100);
  const trendDisplay = trendPercent >= 0 ? `↑${trendPercent}%` : `↓${Math.abs(trendPercent)}%`;

  return (
    <div
      className="rounded-lg border-2 bg-white p-3 hover:shadow-md transition-shadow"
      style={{ borderColor: categoryColor }}
    >
      {/* Keywords - full display */}
      <div 
        className="text-sm font-medium text-gray-900 mb-2 leading-relaxed"
        style={{ minHeight: "3rem" }}
      >
        {area.label || "unlabeled"}
      </div>
      
      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{area.count} patents</span>
        <span>{trendDisplay}</span>
      </div>
    </div>
  );
}

// ============ CATEGORY GROUP ============
interface CategoryGroupProps {
  category: MarketCategory;
  areas: AreaInfo[];
  config: { color: string; label: string };
}

function CategoryGroup({ category, areas, config }: CategoryGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Show first row (6 items) by default, or all if expanded
  const displayAreas = isExpanded ? areas : areas.slice(0, COLUMNS);
  const hiddenCount = areas.length - COLUMNS;
  const hasMore = hiddenCount > 0;

  if (areas.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Category header */}
      <div className="flex items-center gap-2">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: config.color }}
        />
        <span className="font-semibold" style={{ color: config.color }}>
          {config.label}
        </span>
        <span className="text-gray-400 text-sm">({areas.length})</span>
        
        {/* Expand/Collapse button */}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="ml-auto flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="w-4 h-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                Show all {areas.length}
              </>
            )}
          </button>
        )}
      </div>

      {/* Cards grid - 6 columns */}
      <div className="grid grid-cols-6 gap-3">
        {displayAreas.map((area) => (
          <AreaCard
            key={area.id}
            area={area}
            categoryColor={config.color}
          />
        ))}
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function MarketOpportunitiesChart({ areasByCategory }: MarketOpportunitiesChartProps) {
  const totalAreas = Object.values(areasByCategory).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">Market Opportunities</h3>
          <span className="text-sm text-gray-400">({totalAreas} areas)</span>
        </div>
      </div>

      {/* Category groups */}
      <div className="space-y-6">
        {CATEGORY_ORDER.map((category) => (
          <CategoryGroup
            key={category}
            category={category}
            areas={areasByCategory[category] || []}
            config={CATEGORY_CONFIG[category]}
          />
        ))}
      </div>
    </div>
  );
}