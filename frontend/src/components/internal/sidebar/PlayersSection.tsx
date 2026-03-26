import { useState } from "react";
import { Eye, EyeOff, TrendingUp, Plus, Check } from "lucide-react";

// Individual patent position
export interface PlayerPatent {
  x: number;
  y: number;
  year: number;
  index: number;
}

// Yearly data with top areas
export interface YearlyPlayerData {
  year: number;
  count: number;
  center: { x: number; y: number };
  radius: number;
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
  // Individual patent positions for rendering dots on map
  patents: PlayerPatent[];
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
  onSavePlayer?: (playerName: string) => void;
  isPlayerSaved?: (playerName: string) => boolean;
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
  onSavePlayer,
  isPlayerSaved,
  maxDisplay = 10,
}: PlayersSectionProps) {
  const [showAll, setShowAll] = useState(false);

  const displayedPlayers = showAll ? players : players.slice(0, maxDisplay);
  const hasMore = players.length > maxDisplay;

  return (
    <div>
      {/* Player list */}
      {displayedPlayers.map((player, index) => {
        const isSelected = selectedPlayers.includes(player.name);
        const color = player.color || PLAYER_COLORS[index % PLAYER_COLORS.length];

        return (
          <div
            key={player.name}
            className={`border-b border-gray-100 transition-colors ${
              isSelected ? "border-l-2 border-l-purple-400" : ""
            }`}
          >
            {/* Main row */}
            <div className="flex items-center gap-1.5 px-4 py-1.5 hover:bg-gray-50">
              {/* Color dot + name */}
              <button
                onClick={() => onTogglePlayer(player.name)}
                className="flex items-center gap-1.5 flex-1 min-w-0"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color, opacity: isSelected ? 1 : 0.4 }}
                />
                <span
                  className={`text-xs truncate ${
                    isSelected ? "font-medium text-purple-700" : "text-[#0d3356]"
                  }`}
                >
                  {player.name}
                </span>
              </button>

              {/* Patent count */}
              <span className="text-[10px] text-gray-400 flex-shrink-0">
                {player.totalPatents}
              </span>

              {/* Show/hide on map */}
              <button
                onClick={() => onTogglePlayer(player.name)}
                className={`p-0.5 rounded transition-colors ${
                  isSelected
                    ? "text-gray-500 hover:text-gray-700"
                    : "text-gray-300 hover:text-gray-500"
                }`}
                title={isSelected ? "Hide on map" : "Show on map"}
              >
                {isSelected ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Toggle timeline */}
              <button
                onClick={() => onShowTimeline(player.name)}
                className={`p-0.5 rounded transition-colors ${
                  isSelected
                    ? "text-gray-500 hover:text-blue-500"
                    : "text-gray-300 hover:text-blue-500"
                }`}
                title="Toggle evolution timeline"
              >
                <TrendingUp className="w-3.5 h-3.5" />
              </button>

              {/* Save to layers */}
              {onSavePlayer && (
                <button
                  onClick={() => onSavePlayer(player.name)}
                  className={`p-0.5 rounded transition-colors ${
                    isPlayerSaved?.(player.name) ? "text-emerald-500" : "text-gray-300 hover:text-gray-500"
                  }`}
                  title={isPlayerSaved?.(player.name) ? "Saved to layers" : "Save to layers"}
                >
                  {isPlayerSaved?.(player.name) ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Expanded info when selected */}
            {isSelected && player.topAreas.length > 0 && (
              <div className="px-4 pb-1.5 pl-9">
                <div className="text-[10px] text-gray-500">
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
          className="w-full text-center py-1.5 text-[11px] text-blue-500 hover:text-blue-600 transition-colors"
        >
          {showAll ? "Show less" : `Show all ${players.length}`}
        </button>
      )}

      {/* Empty state */}
      {players.length === 0 && (
        <div className="text-xs text-gray-400 text-center py-3">
          No player data available
        </div>
      )}
    </div>
  );
}