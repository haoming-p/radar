import { Database } from "lucide-react";
import { PlayerInfo } from "../sidebar/PlayersSection";
import PublicationYearChart from "./Publicationyearchart";
import PlayerTrendsChart from "./PlayTrendsChart";
import MarketOpportunitiesChart from "./MarketOpportunitiesChart";

// ============ TYPES ============
type MarketCategory = "major" | "growing" | "sparse" | "avoid";

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
}

interface Patent {
  x: number;
  y: number;
  area_id: number;
  topic_id: number;
  title: string;
  year?: number;
}

interface HighlightsPanelProps {
  // Metadata
  query: string;
  yearRange: [number, number];
  totalPatents: number;
  method: {
    dimensionality: string;
    clustering: string;
    grid_size: number;
  } | null;
  // Data for charts
  patents: Patent[];
  players: PlayerInfo[];
  topics: Record<string, TopicInfo>;
  areasByCategory: Record<MarketCategory, AreaInfo[]>;
}

// ============ MAIN COMPONENT ============
export default function HighlightsPanel({
  query,
  yearRange,
  totalPatents,
  method,
  patents,
  players,
  topics,
  areasByCategory,
}: HighlightsPanelProps) {
  // Count topics (excluding noise)
  const topicCount = Object.keys(topics).filter((k) => Number(k) !== -1).length;
  const areaCount = Object.values(areasByCategory).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-auto p-6">
      <div className="mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Quick Highlights</h2>
        </div>

        {/* Row 1: Analysis Info + Publication Year */}
        <div className="grid grid-cols-2 gap-6">
          {/* Analysis Info Card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-blue-500" />
              <h3 className="font-semibold text-gray-900">Analysis Info</h3>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Analysis requested on</span>
                <span className="text-gray-700">December 25th 2025, 1:41 am +00:00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Data Set</span>
                <span className="text-gray-700">#272364</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="text-gray-700">Concept search @ Abstract and Claims</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Text Query</span>
                <span className="text-gray-700">{query}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Year range</span>
                <span className="text-gray-700">{yearRange[0]} - {yearRange[1]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total in data set</span>
                <span className="text-gray-700">{totalPatents.toLocaleString()} / 351,264</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Assignees</span>
                <span className="text-gray-700">910</span>
              </div>
            </div>
          </div>

          {/* Publication Year Chart */}
          <PublicationYearChart patents={patents} yearRange={yearRange} />
        </div>

        {/* Row 2: Player Trends (full width) */}
        <PlayerTrendsChart players={players} yearRange={yearRange} />

        {/* Row 3: Market Opportunities (full width) */}
        <MarketOpportunitiesChart areasByCategory={areasByCategory} />
      </div>
    </div>
  );
}