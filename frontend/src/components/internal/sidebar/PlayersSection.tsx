import { useState } from "react";
import { Eye, EyeOff, TrendingUp } from "lucide-react";

// Yearly data with top areas
export interface YearlyPlayerData {
  year: number;
  count: number;
  center: { x: number; y: number };
  topAreas: { areaId: number; count: number; label: string }[];
}

// Player data structure
export interface PlayerInfo {
  name: string;
  totalPatents: number;
  color: string;
  // Center of gravity (weighted average position)
  center: { x: number; y: number };
  // Distribution radius (standard deviation of positions)
  radius: number;
  // Patents by year for timeline (with per-year top areas)
  yearlyData: YearlyPlayerData[];
  // Overall top areas this player is active in
  topAreas: { areaId: number; count: number; label: string }[];
}

interface PlayersSectionProps {
  players: PlayerInfo[];
  selectedPlayers: string[];
  onTogglePlayer: (playerName: string) => void;
  onShowTimeline: (playerName: string) => void;
  maxDisplay?: number;
}

// Predefined colors for players
export const PLAYER_COLORS = [
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#F97316", // orange
  "#14B8A6", // teal
  "#EAB308", // yellow
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#F43F5E", // rose
];

export default function PlayersSection({
  players,
  selectedPlayers,
  onTogglePlayer,
  onShowTimeline,
  maxDisplay = 10,
}: PlayersSectionProps) {
  const [showAll, setShowAll] = useState(false);

  const displayedPlayers = showAll ? players : players.slice(0, maxDisplay);
  const hasMore = players.length > maxDisplay;

  return (
    <div className="space-y-1">
      {/* Player list */}
      {displayedPlayers.map((player, index) => {
        const isSelected = selectedPlayers.includes(player.name);
        const color = player.color || PLAYER_COLORS[index % PLAYER_COLORS.length];

        return (
          <div
            key={player.name}
            className={`group rounded-lg border transition-all ${
              isSelected
                ? "border-gray-300 bg-gray-50"
                : "border-transparent hover:bg-gray-50"
            }`}
          >
            {/* Main row */}
            <div className="flex items-center gap-2 px-3 py-2">
              {/* Color dot + checkbox */}
              <button
                onClick={() => onTogglePlayer(player.name)}
                className="flex items-center gap-2 flex-1 min-w-0"
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color, opacity: isSelected ? 1 : 0.4 }}
                />
                <span
                  className={`text-sm truncate ${
                    isSelected ? "font-medium text-gray-900" : "text-gray-600"
                  }`}
                >
                  {player.name}
                </span>
              </button>

              {/* Patent count */}
              <span className="text-xs text-gray-400 flex-shrink-0">
                {player.totalPatents}
              </span>

              {/* Show/hide on map */}
              <button
                onClick={() => onTogglePlayer(player.name)}
                className={`p-1 rounded transition-colors ${
                  isSelected
                    ? "text-gray-600 hover:text-gray-900"
                    : "text-gray-300 hover:text-gray-500"
                }`}
                title={isSelected ? "Hide on map" : "Show on map"}
              >
                {isSelected ? (
                  <Eye className="w-4 h-4" />
                ) : (
                  <EyeOff className="w-4 h-4" />
                )}
              </button>

              {/* Show timeline */}
              <button
                onClick={() => onShowTimeline(player.name)}
                className="p-1 rounded text-gray-300 hover:text-blue-500 transition-colors"
                title="Show evolution timeline"
              >
                <TrendingUp className="w-4 h-4" />
              </button>
            </div>

            {/* Expanded info when selected */}
            {isSelected && player.topAreas.length > 0 && (
              <div className="px-3 pb-2 pt-0">
                <div className="text-xs text-gray-500 pl-5">
                  Top areas:{" "}
                  {player.topAreas
                    .slice(0, 3)
                    .map((a) => a.label.split(",")[0])
                    .join(", ")}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Show all button */}
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full text-center py-2 text-sm text-blue-500 hover:text-blue-600 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${players.length}`}
        </button>
      )}

      {/* Empty state */}
      {players.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-4">
          No player data available
        </div>
      )}
    </div>
  );
}