import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import AreaItem from "./AreaItem";

interface TopicArea {
  area_id: number;
  count: number;
  category: string;
  trend: number;
  centroid: { x: number; y: number };
  label: string;
}

interface TopicInfo {
  id: number;
  label: string;
  totalPatents: number;
  areaCount: number;
  areas: TopicArea[];
}

interface AreaInfo {
  id: number;
  label: string;
  count: number;
  trend: number;
  category: string;
}

interface TopicsSectionProps {
  topics: Record<string, TopicInfo>;
  areas: Record<string, AreaInfo>;
  visibleAreas: Record<number, boolean>;
  highlightedArea: number | null;
  onToggleAreaVisibility: (areaId: number) => void;
  onHighlightArea: (id: number | null) => void;
  editedLabels: Record<number, string>;
  editedShortLabels: Record<number, string>;
  onEditLabel: (areaId: number, newLabel: string) => void;
  onEditShortLabel: (areaId: number, newShortLabel: string) => void;
}

export default function TopicsSection({
  topics,
  areas,
  visibleAreas,
  highlightedArea,
  onToggleAreaVisibility,
  onHighlightArea,
  editedLabels,
  editedShortLabels,
  onEditLabel,
  onEditShortLabel,
}: TopicsSectionProps) {
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [showAllAreas, setShowAllAreas] = useState<Record<string, boolean>>({});

  // Sort topics by total patents (descending)
  const sortedTopics = Object.values(topics)
    .filter(t => t.id !== -1) // Skip noise topic
    .sort((a, b) => b.totalPatents - a.totalPatents);

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const toggleShowAll = (topicId: string) => {
    setShowAllAreas(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  // Get short label (first 2 keywords)
  const getShortLabel = (label: string) => {
    const keywords = label.split(", ");
    return keywords.length > 2 
      ? `${keywords.slice(0, 2).join(", ")}...` 
      : label;
  };

  return (
    <div className="space-y-1">
      {sortedTopics.map((topic) => {
        const isExpanded = expandedTopics[topic.id];
        const showAll = showAllAreas[topic.id];
        const displayAreas = showAll ? topic.areas : topic.areas.slice(0, 5);
        const hiddenCount = topic.areas.length - 5;

        return (
          <div
            key={topic.id}
            className={`rounded-lg border ${
              isExpanded ? "border-gray-200 bg-white" : "border-transparent"
            }`}
          >
            {/* Topic header */}
            <div
              className={`
                flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer
                ${isExpanded ? "bg-gray-50" : "hover:bg-gray-50"}
              `}
              onClick={() => toggleTopic(String(topic.id))}
            >
              {/* Expand icon */}
              <span className="text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </span>

              {/* Topic label */}
              <span className="font-medium text-gray-900 truncate flex-1">
                {getShortLabel(topic.label)}
              </span>

              {/* Stats */}
              <span className="text-sm text-gray-400 whitespace-nowrap">
                {topic.totalPatents} · {topic.areaCount} areas
              </span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-3 pb-3">
                {/* Full topic keywords */}
                <div className="mb-3 px-2 py-2 bg-gray-50 rounded text-sm text-gray-600">
                  <div className="text-xs text-gray-400 mb-1">Topic Keywords</div>
                  {topic.label}
                </div>

                {/* Areas list */}
                <div className="space-y-1">
                  {displayAreas.map((topicArea) => {
                    const areaInfo = areas[String(topicArea.area_id)];
                    if (!areaInfo) return null;

                    return (
                      <AreaItem
                        key={topicArea.area_id}
                        area={{
                          id: topicArea.area_id,
                          label: topicArea.label || areaInfo.label || "",
                          count: topicArea.count,
                          trend: topicArea.trend,
                          category: topicArea.category,
                        }}
                        isHighlighted={highlightedArea === topicArea.area_id}
                        isVisible={visibleAreas[topicArea.area_id] !== false}
                        onHover={onHighlightArea}
                        onToggleVisibility={onToggleAreaVisibility}
                        // Label editing props
                        editedLabel={editedLabels[topicArea.area_id]}
                        editedShortLabel={editedShortLabels[topicArea.area_id]}
                        onEditLabel={onEditLabel}
                        onEditShortLabel={onEditShortLabel}
                      />
                    );
                  })}
                </div>

                {/* Show more/less button */}
                {topic.areas.length > 5 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleShowAll(String(topic.id));
                    }}
                    className="mt-2 text-sm text-blue-500 hover:text-blue-600 px-2"
                  >
                    {showAll ? "Show less" : `+${hiddenCount} more`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sortedTopics.length === 0 && (
        <div className="text-sm text-gray-400 px-3 py-4">
          No topics found
        </div>
      )}
    </div>
  );
}