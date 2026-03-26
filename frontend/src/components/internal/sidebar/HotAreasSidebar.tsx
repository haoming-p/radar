import { ChevronDown, ChevronRight, Flame } from "lucide-react";
import { HotAreaInfo } from "../map/RadarMap";

interface HotAreasSidebarProps {
  hotAreas: Record<string, HotAreaInfo>;
  activeHotAreaId: number | null;
  onHighlightHotArea: (id: number | null) => void;
  onSelectHotArea: (id: number) => void;
}

export default function HotAreasSidebar({
  hotAreas,
  activeHotAreaId,
  onHighlightHotArea,
  onSelectHotArea,
}: HotAreasSidebarProps) {
  const sortedAreas = Object.values(hotAreas).sort(
    (a, b) => b.patent_count - a.patent_count
  );

  return (
    <div className="flex flex-col h-full">
      {/* Sub-header */}
      <div className="px-4 py-2 flex-shrink-0">
        <p className="text-xs text-gray-500">
          <Flame size={11} className="inline-block mr-1 -mt-0.5 text-orange-400" />
          {sortedAreas.length} hot areas detected
        </p>
      </div>

      {/* Area list */}
      <div className="flex-1 overflow-y-auto">
        {sortedAreas.map((area, idx) => {
          const isActive = area.id === activeHotAreaId;

          return (
            <div
              key={area.id}
              className={`border-b border-gray-100 transition-colors ${
                isActive ? "bg-indigo-50 border-l-2 border-l-indigo-400" : ""
              }`}
              onMouseEnter={() => onHighlightHotArea(area.id)}
              onMouseLeave={() => onHighlightHotArea(null)}
            >
              {/* Area header */}
              <button
                className="w-full text-left px-4 py-2.5 flex items-start gap-2 hover:bg-gray-50"
                onClick={() => onSelectHotArea(area.id)}
              >
                <span className="mt-0.5 flex-shrink-0 text-gray-400">
                  {isActive ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${isActive ? "text-indigo-700" : "text-[#0d3356]"}`}>
                    {area.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {area.cluster_count} clusters · {area.patent_count} patents
                  </div>
                </div>
              </button>

              {/* Expanded details */}
              {isActive && (
                <div className="px-4 pb-3 pl-10">
                  {area.summary && (
                    <p className="text-xs text-gray-600 leading-relaxed mb-2">
                      {area.summary}
                    </p>
                  )}

                  {area.keywords && (
                    <div>
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
                </div>
              )}
            </div>
          );
        })}

        {sortedAreas.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No hot areas detected.
          </div>
        )}
      </div>
    </div>
  );
}
