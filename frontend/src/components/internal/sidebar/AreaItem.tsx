import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Pencil } from "lucide-react";

interface AreaItemProps {
  area: {
    id: number;
    label: string;
    count: number;
    trend: number;
    category: string;
  };
  isHighlighted: boolean;
  isVisible: boolean;
  forceExpanded?: boolean;
  showVisibilityToggle?: boolean;
  onHover: (id: number | null) => void;
  onToggleVisibility?: (id: number) => void;
  // Label editing props
  editedLabel?: string;           // Full keywords
  editedShortLabel?: string;      // 缩略词
  onEditLabel?: (areaId: number, newLabel: string) => void;
  onEditShortLabel?: (areaId: number, newShortLabel: string) => void;
}

export default function AreaItem({
  area,
  isHighlighted,
  isVisible,
  forceExpanded,
  showVisibilityToggle = true,
  onHover,
  onToggleVisibility,
  // Label editing props
  editedLabel,
  editedShortLabel,
  onEditLabel,
  onEditShortLabel,
}: AreaItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingField, setEditingField] = useState<"short" | "keywords" | null>(null);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // When forceExpanded becomes true, expand the item
  useEffect(() => {
    if (forceExpanded) {
      setIsExpanded(true);
    }
  }, [forceExpanded]);

  // Focus textarea when editing starts
  useEffect(() => {
    if (editingField && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingField]);

  // Full keywords (edited or original)
  const fullKeywords = editedLabel ?? area.label ?? "unlabeled";
  
  // Short label: custom if set, otherwise full keywords (CSS will truncate if no custom)
  const shortLabel = editedShortLabel ?? fullKeywords;
  
  // Whether user has set a custom short label
  const hasCustomShortLabel = !!editedShortLabel;
  
  // Label to show in header
  const headerLabel = shortLabel;

  // Format trend as percentage
  const trendPercent = Math.round((area.trend - 1) * 100);
  const trendDisplay = trendPercent >= 0 ? `↑${trendPercent}%` : `↓${Math.abs(trendPercent)}%`;

  const handleClick = () => {
    if (!editingField) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleVisibilityClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleVisibility?.(area.id);
  };

  // Edit short label (缩略词)
  const handleEditShortClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(shortLabel);
    setEditingField("short");
    setIsExpanded(true); // Expand to show edit area
  };

  // Edit full keywords
  const handleEditKeywordsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(fullKeywords);
    setEditingField("keywords");
    setIsExpanded(true);
  };

  const handleEditSave = () => {
    if (editValue.trim()) {
      if (editingField === "short" && editValue !== shortLabel) {
        onEditShortLabel?.(area.id, editValue.trim());
      } else if (editingField === "keywords" && editValue !== fullKeywords) {
        onEditLabel?.(area.id, editValue.trim());
      }
    }
    setEditingField(null);
  };

  const handleEditCancel = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to save (allow regular Enter for newlines)
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  return (
    <div
      className={`
        group rounded-lg transition-colors cursor-pointer
        ${isHighlighted ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-50"}
        ${!isVisible ? "opacity-50" : ""}
      `}
      onMouseEnter={() => onHover(area.id)}
      onMouseLeave={() => onHover(null)}
      onClick={handleClick}
    >
      {/* Collapsed row - 2 lines */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Left side: Expand icon + Content */}
        <div className="flex-1 min-w-0">
          {/* First line: Short label / header */}
          <div className="flex items-center gap-1">
            <span className="text-gray-400 flex-shrink-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
            
            <span 
              className={`font-medium text-gray-900 ${hasCustomShortLabel ? '' : 'truncate'}`}
              title={fullKeywords}
            >
              {headerLabel}
            </span>
            
            {/* Edit short label button - show on hover */}
            {!editingField && onEditShortLabel && (
              <button
                onClick={handleEditShortClick}
                className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit display label"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Second line: Area ID · patents · trend */}
          <div className="text-xs text-gray-400 ml-5">
            Area {area.id} · {area.count} patents · {trendDisplay}
          </div>
        </div>

        {/* Right side: Eye icon (vertically centered) */}
        {showVisibilityToggle && (
          <button
            onClick={handleVisibilityClick}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            {isVisible ? (
              <Eye className="w-4 h-4" />
            ) : (
              <EyeOff className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 ml-5 border-t border-gray-100 mt-1 pt-2">
          {/* Editing mode - expanded textarea */}
          {editingField ? (
            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1.5 font-medium">
                {editingField === "short" ? "Edit Display Label" : "Edit Keywords"}
              </div>
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                rows={4}
                className="w-full px-2 py-1.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
                placeholder={editingField === "short" ? "Display label..." : "Keywords (comma separated)..."}
              />
              <div className="flex items-center justify-end mt-1.5">
                <div className="flex gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditCancel(); }}
                    className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditSave(); }}
                    className="px-2 py-0.5 text-xs text-white bg-blue-500 hover:bg-blue-600 rounded"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Full keywords with edit button */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">Keywords</span>
                  {onEditLabel && (
                    <button
                      onClick={handleEditKeywordsClick}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-500"
                      title="Edit keywords"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-sm text-gray-700 leading-relaxed">
                  {fullKeywords}
                </div>
              </div>

              {/* Patents link - placeholder */}
              <span className="text-xs text-blue-500 cursor-not-allowed opacity-60">
                View {area.count} patents →
                <span className="text-xs text-gray-400 ml-1">(coming soon)</span>
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}