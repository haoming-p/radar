import { useState } from "react";
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { AreaInfo } from "../map/RadarMap";

interface KeyAreasSidebarProps {
  areas: Record<string, AreaInfo>;
  highlightedArea: number | null;
  selectedArea: number | null;
  onHighlightArea: (id: number | null) => void;
  onSelectArea: (id: number) => void;
}

export default function KeyAreasSidebar({
  areas,
  highlightedArea,
  selectedArea,
  onHighlightArea,
  onSelectArea,
}: KeyAreasSidebarProps) {
  const [expandedAreas, setExpandedAreas] = useState<Record<number, boolean>>({});

  const sortedAreas = Object.values(areas).sort(
    (a, b) => b.patent_count - a.patent_count
  );

  const toggleExpand = (id: number) => {
    setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <MapPin size={14} />
          Key Areas
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {sortedAreas.length} areas detected
        </p>
      </div>

      {/* Area list */}
      <div className="flex-1 overflow-y-auto">
        {sortedAreas.map((area) => {
          const isExpanded = expandedAreas[area.id] || selectedArea === area.id;
          const isHighlighted = highlightedArea === area.id;

          return (
            <div
              key={area.id}
              className={`border-b border-gray-100 transition-colors ${
                isHighlighted ? "bg-blue-50" : ""
              }`}
              onMouseEnter={() => onHighlightArea(area.id)}
              onMouseLeave={() => onHighlightArea(null)}
            >
              {/* Area header */}
              <button
                className="w-full text-left px-4 py-3 flex items-start gap-2 hover:bg-gray-50"
                onClick={() => {
                  toggleExpand(area.id);
                  onSelectArea(area.id);
                }}
              >
                <span className="mt-0.5 flex-shrink-0 text-gray-400">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#0d3356]">
                    {area.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {area.cluster_count} clusters · {area.patent_count} patents
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="px-4 pb-3 pl-10">
                  {/* Summary */}
                  {area.summary && (
                    <p className="text-xs text-gray-600 leading-relaxed mb-2">
                      {area.summary}
                    </p>
                  )}

                  {/* Keywords */}
                  {area.keywords && (
                    <div className="mb-2">
                      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                        Keywords
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {area.keywords.split(", ").slice(0, 10).map((kw, i) => (
                          <span
                            key={i}
                            className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Trend */}
                  <div className="text-[10px] text-gray-400">
                    Trend: {area.trend > 1 ? "Growing" : area.trend < 1 ? "Declining" : "Stable"} ({area.trend}x)
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {sortedAreas.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No areas detected yet.
            <br />
            Upload a CSV and run analysis.
          </div>
        )}
      </div>
    </div>
  );
}
