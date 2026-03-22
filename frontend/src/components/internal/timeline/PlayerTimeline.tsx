import { useState, useMemo } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { PlayerInfo, YearlyPlayerData } from "../sidebar/PlayersSection";

interface PlayerTimelineProps {
  players: PlayerInfo[];
  selectedPlayers: string[];
  selectedYear: number | null;
  yearRange: [number, number]; // [minYear, maxYear]
  onSelectYear: (year: number) => void;
  onClose: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

// Extract first keyword from area label (e.g., "aircraft, fuel, engine" → "aircraft")
function getFirstKeyword(label: string): string {
  if (!label) return "";
  const first = label.split(",")[0].trim();
  // Truncate if too long
  return first.length > 10 ? first.slice(0, 9) + "…" : first;
}

// Get top keyword for a year's data
function getTopKeyword(yearData: YearlyPlayerData | undefined): string {
  if (!yearData || yearData.topAreas.length === 0) return "";
  return getFirstKeyword(yearData.topAreas[0].label);
}

// Get all keywords for hover tooltip
function getAllKeywords(yearData: YearlyPlayerData | undefined): string {
  if (!yearData || yearData.topAreas.length === 0) return "No data";
  return yearData.topAreas
    .slice(0, 3)
    .map((a) => getFirstKeyword(a.label))
    .join(", ");
}

export default function PlayerTimeline({
  players,
  selectedPlayers,
  selectedYear,
  yearRange,
  onSelectYear,
  onClose,
  isCollapsed,
  onToggleCollapse,
}: PlayerTimelineProps) {
  const [hoveredCell, setHoveredCell] = useState<{ player: string; year: number } | null>(null);
  
  const [minYear, maxYear] = yearRange;
  const years = useMemo(() => {
    const result: number[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      result.push(y);
    }
    return result;
  }, [minYear, maxYear]);

  // Get selected player data
  const selectedPlayerData = useMemo(() => {
    return players.filter((p) => selectedPlayers.includes(p.name));
  }, [players, selectedPlayers]);

  // Find max count for scaling bars
  const maxCount = useMemo(() => {
    let max = 0;
    selectedPlayerData.forEach((player) => {
      player.yearlyData.forEach((d) => {
        if (d.count > max) max = d.count;
      });
    });
    return max || 1;
  }, [selectedPlayerData]);

  if (selectedPlayerData.length === 0) {
    return null;
  }

  return (
    <div className="bg-white border-t shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleCollapse}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            {isCollapsed ? (
              <ChevronUp className="w-4 h-4 text-gray-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <span className="text-sm font-medium text-gray-700">
            Player Evolution Timeline
          </span>
          <span className="text-xs text-gray-400">
            ({selectedPlayerData.length} selected)
          </span>
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Timeline content */}
      {!isCollapsed && (
        <div className="p-4 overflow-x-auto">
          {/* Year axis header */}
          <div className="flex items-end mb-1">
            {/* Player name column spacer */}
            <div className="w-32 flex-shrink-0" />
            
            {/* Year headers */}
            <div className="flex-1 flex">
              {years.map((year) => (
                <button
                  key={year}
                  onClick={() => onSelectYear(year)}
                  className={`flex-1 min-w-[60px] text-xs text-center py-1 border-b-2 transition-colors ${
                    selectedYear === year
                      ? "border-blue-500 text-blue-600 font-medium"
                      : "border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
            
            {/* Total column header */}
            <div className="w-14 flex-shrink-0 text-xs text-gray-400 text-right pr-1">
              Total
            </div>
          </div>

          {/* Player rows */}
          <div className="space-y-1">
            {selectedPlayerData.map((player) => (
              <div key={player.name} className="flex items-start">
                {/* Player name */}
                <div className="w-32 flex-shrink-0 flex items-center gap-2 pt-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: player.color }}
                  />
                  <span className="text-sm text-gray-700 truncate" title={player.name}>
                    {player.name.length > 12 ? player.name.slice(0, 11) + "…" : player.name}
                  </span>
                </div>

                {/* Year cells */}
                <div className="flex-1 flex">
                  {years.map((year) => {
                    const yearData = player.yearlyData.find((d) => d.year === year);
                    const count = yearData?.count || 0;
                    const barHeight = count > 0 ? (count / maxCount) * 24 : 0; // max 24px
                    const isSelected = selectedYear === year;
                    const isHovered = hoveredCell?.player === player.name && hoveredCell?.year === year;
                    const topKeyword = getTopKeyword(yearData);

                    return (
                      <div
                        key={year}
                        className={`flex-1 min-w-[60px] flex flex-col items-center cursor-pointer transition-colors rounded px-1 py-1 relative ${
                          isSelected ? "bg-blue-50" : isHovered ? "bg-gray-50" : ""
                        }`}
                        onClick={() => onSelectYear(year)}
                        onMouseEnter={() => setHoveredCell({ player: player.name, year })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        {/* Bar */}
                        <div className="h-6 flex items-end justify-center w-full">
                          {count > 0 && (
                            <div
                              className="w-8 rounded-t transition-all"
                              style={{
                                height: `${Math.max(barHeight, 4)}px`,
                                backgroundColor: player.color,
                                opacity: isSelected ? 1 : 0.7,
                              }}
                            />
                          )}
                        </div>
                        
                        {/* Count */}
                        <div className={`text-xs mt-0.5 ${count > 0 ? "text-gray-600" : "text-gray-300"}`}>
                          {count > 0 ? count : "-"}
                        </div>
                        
                        {/* Top keyword */}
                        <div 
                          className={`text-[10px] truncate w-full text-center ${
                            count > 0 ? "text-gray-500" : "text-gray-300"
                          }`}
                          style={{ maxWidth: "58px" }}
                        >
                          {topKeyword || "-"}
                        </div>

                        {/* Hover tooltip with more keywords */}
                        {isHovered && count > 0 && yearData && yearData.topAreas.length > 1 && (
                          <div className="absolute z-10 top-full mt-1 bg-gray-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap shadow-lg">
                            {yearData.topAreas.slice(0, 3).map((area, i) => (
                              <div key={i}>{getFirstKeyword(area.label)} ({area.count})</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Total count */}
                <div className="w-14 flex-shrink-0 text-right text-sm font-medium text-gray-600 pt-2 pr-1">
                  {player.totalPatents}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-gray-400">
            <span>Hover to see more keywords</span>
            <span>Click year to see map position</span>
          </div>
        </div>
      )}
    </div>
  );
}