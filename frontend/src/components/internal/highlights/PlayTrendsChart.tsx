import { useState, useMemo } from "react";
import { TrendingUp, Maximize2, Minimize2 } from "lucide-react";
import { PlayerInfo } from "../sidebar/PlayersSection";

interface PlayerTrendsChartProps {
  players: PlayerInfo[];
  yearRange: [number, number];
}

// Get display label: combine first keyword from each top area
function getDisplayLabel(
  topAreas: { areaId: number; count: number; label: string }[]
): string {
  if (!topAreas || topAreas.length === 0) return "";
  
  // Take first keyword from each of top 5 areas
  const keywords = topAreas.slice(0, 5).map((area) => {
    const firstKeyword = area.label.split(",")[0].trim();
    return firstKeyword;
  });
  
  return keywords.join(", ");
}

// Get full details for tooltip
function getFullDetails(
  topAreas: { areaId: number; count: number; label: string }[]
): { keyword: string; fullLabel: string; count: number }[] {
  if (!topAreas || topAreas.length === 0) return [];
  
  return topAreas.slice(0, 5).map((area) => ({
    keyword: area.label.split(",")[0].trim(),
    fullLabel: area.label,
    count: area.count,
  }));
}

export default function PlayerTrendsChart({
  players,
  yearRange,
}: PlayerTrendsChartProps) {
  const [minYear, maxYear] = yearRange;
  const [hoveredCell, setHoveredCell] = useState<{ player: string; year: number } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Generate year columns
  const years = useMemo(() => {
    const result: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      result.push(y);
    }
    return result;
  }, [minYear, maxYear]);

  // Find max count for scaling bars
  const maxCount = useMemo(() => {
    let max = 0;
    players.forEach((player) => {
      player.yearlyData.forEach((d) => {
        if (d.count > max) max = d.count;
      });
    });
    return max || 1;
  }, [players]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 col-span-2">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-gray-900">Player Trends</h3>
        </div>

        {/* Expand/Collapse controls */}
        <div className="flex items-center gap-2 text-xs">
          {isExpanded ? (
            <button
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-1 px-2 py-1 text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              <Minimize2 className="w-3 h-3" />
              Show top
            </button>
          ) : (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
              Expand
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 overflow-x-auto">
        {/* Year headers */}
        <div className="flex items-end mb-2 sticky top-0 bg-white">
          {/* Player column */}
          <div className="w-40 flex-shrink-0 text-xs text-gray-400 font-medium">
            Player
          </div>

          {/* Year columns */}
          {years.map((year) => (
            <div
              key={year}
              className="flex-1 min-w-[100px] text-xs text-center text-gray-500 font-medium pb-1 border-b border-gray-100"
            >
              {year}
            </div>
          ))}

          {/* Total column */}
          <div className="w-16 flex-shrink-0 text-xs text-gray-400 font-medium text-right pr-2">
            Total
          </div>
        </div>

        {/* Player rows */}
        <div
          className={`space-y-1 overflow-y-auto transition-all ${
            isExpanded ? "max-h-[600px]" : "max-h-80"
          }`}
        >
          {players.map((player) => {
            return (
              <div key={player.name} className="flex items-start">
                {/* Player name */}
                <div className="w-40 flex-shrink-0 flex items-center gap-2 py-2 px-1">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: player.color }}
                  />
                  <span
                    className="text-sm text-gray-700 truncate"
                    title={player.name}
                  >
                    {player.name}
                  </span>
                </div>

                {/* Year cells */}
                {years.map((year) => {
                  const yearData = player.yearlyData.find((d) => d.year === year);
                  const count = yearData?.count || 0;
                  const barHeight = count > 0 ? Math.max((count / maxCount) * 24, 4) : 0;
                  const displayLabel = yearData ? getDisplayLabel(yearData.topAreas) : "";
                  const isHovered =
                    hoveredCell?.player === player.name && hoveredCell?.year === year;
                  const fullDetails = yearData ? getFullDetails(yearData.topAreas) : [];

                  return (
                    <div
                      key={year}
                      className={`flex-1 min-w-[100px] flex flex-col items-center py-1 px-1 relative rounded transition-colors ${
                        isHovered ? "bg-gray-50" : ""
                      }`}
                      onMouseEnter={() => setHoveredCell({ player: player.name, year })}
                      onMouseLeave={() => setHoveredCell(null)}
                    >
                      {/* Bar */}
                      <div className="h-6 flex items-end justify-center w-full">
                        {count > 0 && (
                          <div
                            className="w-10 rounded-t transition-all"
                            style={{
                              height: `${barHeight}px`,
                              backgroundColor: player.color,
                              opacity: 0.7,
                            }}
                          />
                        )}
                      </div>

                      {/* Count */}
                      <div
                        className={`text-xs font-medium mt-0.5 ${
                          count > 0 ? "text-gray-700" : "text-gray-300"
                        }`}
                      >
                        {count > 0 ? count : "-"}
                      </div>

                      {/* Keywords (truncated) */}
                      <div
                        className={`text-[10px] leading-tight text-center mt-0.5 line-clamp-2 ${
                          count > 0 ? "text-gray-500" : "text-gray-300"
                        }`}
                        style={{ maxWidth: "90px" }}
                        title={displayLabel}
                      >
                        {displayLabel || "-"}
                      </div>

                      {/* Hover tooltip */}
                      {isHovered && count > 0 && fullDetails.length > 0 && (
                        <div className="absolute z-20 top-full mt-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg min-w-[280px]">
                          <div className="font-medium mb-1 text-gray-300">
                            {player.name} · {year}
                          </div>
                          {fullDetails.map((detail, i) => (
                            <div key={i} className="flex items-start gap-2 py-0.5">
                              <span className="text-blue-300 flex-shrink-0">{detail.count}</span>
                              <span className="text-gray-100 break-words">
                                {detail.fullLabel}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Total */}
                <div className="w-16 flex-shrink-0 text-right text-sm font-semibold text-gray-700 py-2 pr-2">
                  {player.totalPatents}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}