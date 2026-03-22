import { useState, useEffect, useRef } from "react";
import { Eye, Move, Pencil } from "lucide-react";

interface DraggableLabelProps {
  area: {
    id: number;
    label: string;
    count: number;
    trend?: number;
    category: string;
  };
  config: {
    color: string;
    bgColor: string;
    label: string;
  };
  position: { x: number; y: number };
  isHighlighted: boolean;
  isDragging: boolean;
  dimensions: { width: number; height: number };
  onHover: (id: number | null) => void;
  onToggleVisibility: (id: number) => void;
  onExpandInSidebar: (id: number) => void;
  onDragStart: (e: React.MouseEvent, id: number) => void;
  // Label editing props
  editedLabel?: string;           // Full keywords
  editedShortLabel?: string;      // 缩略词
  onEditLabel?: (areaId: number, newLabel: string) => void;
  onEditShortLabel?: (areaId: number, newShortLabel: string) => void;
}

export default function DraggableLabel({
  area,
  config,
  position,
  isHighlighted,
  isDragging,
  dimensions,
  onHover,
  onToggleVisibility,
  onExpandInSidebar,
  onDragStart,
  // Label editing props
  editedLabel,
  editedShortLabel,
  onEditLabel,
  onEditShortLabel,
}: DraggableLabelProps) {
  const [editingField, setEditingField] = useState<"short" | "keywords" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [wrappedLines, setWrappedLines] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);

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
  
  // Label to show in header (always show short label on map)
  const headerLabel = shortLabel;

  // Compute wrapped lines for export (only for custom short labels that may wrap)
  useEffect(() => {
    if (!spanRef.current || !hasCustomShortLabel) {
      setWrappedLines([]);
      return;
    }

    const timer = setTimeout(() => {
      const span = spanRef.current;
      if (!span || !span.firstChild) {
        setWrappedLines([]);
        return;
      }

      const text = span.textContent || '';
      if (!text) {
        setWrappedLines([]);
        return;
      }

      try {
        const range = document.createRange();
        const lines: string[] = [];
        let lineStart = 0;
        let lastTop = -Infinity;

        for (let i = 0; i < text.length; i++) {
          range.setStart(span.firstChild, i);
          range.setEnd(span.firstChild, Math.min(i + 1, text.length));
          const rect = range.getBoundingClientRect();

          if (rect.top > lastTop + 5) {
            if (lineStart < i && lastTop !== -Infinity) {
              lines.push(text.substring(lineStart, i).trim());
              lineStart = i;
            }
          }
          lastTop = rect.top;
        }

        if (lineStart < text.length) {
          lines.push(text.substring(lineStart).trim());
        }

        setWrappedLines(lines.filter(l => l.length > 0));
      } catch (e) {
        console.error('Error computing wrapped lines:', e);
        setWrappedLines([]);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [headerLabel, hasCustomShortLabel]);
  
  const trendPercent = area.trend ? Math.round((area.trend - 1) * 100) : 0;
  const trendDisplay = trendPercent >= 0 ? `↑${trendPercent}%` : `↓${Math.abs(trendPercent)}%`;

  // Convert position to percentage
  const leftPercent = (position.x / dimensions.width) * 100;
  const topPercent = (position.y / dimensions.height) * 100;

  const handleClick = () => {
    if (!isDragging && !editingField) {
      onExpandInSidebar(area.id);
    }
  };

  const handleEyeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleVisibility(area.id);
  };

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDragStart(e, area.id);
  };

  // Edit short label (缩略词)
  const handleEditShortClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(shortLabel);
    setEditingField("short");
  };

  // Edit full keywords
  const handleEditKeywordsClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(fullKeywords);
    setEditingField("keywords");
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
    e.stopPropagation();
    // Ctrl/Cmd + Enter to save (allow regular Enter for newlines)
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleEditSave();
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  const isEditing = editingField !== null;

  return (
    <div
      className="absolute pointer-events-auto"
      data-area-id={area.id}
      data-has-custom-short-label={hasCustomShortLabel}
      data-wrapped-lines={wrappedLines.length > 0 ? wrappedLines.join('|') : undefined}
      style={{
        left: `${leftPercent}%`,
        top: `${topPercent}%`,
        transform: "translate(-50%, 0)",
        zIndex: isHighlighted || isDragging || isEditing ? 10 : 1,
      }}
      onMouseEnter={() => !isDragging && onHover(area.id)}
      onMouseLeave={() => !isDragging && !isEditing && onHover(null)}
    >
      {/* Label card */}
      <div
        className="group rounded-lg shadow-sm border transition-all cursor-pointer bg-white"
        style={{
          borderColor: config.color,
          borderWidth: isHighlighted || isEditing ? 2 : 1,
          width: isEditing ? "260px" : (hasCustomShortLabel ? "auto" : "170px"),
          maxWidth: hasCustomShortLabel ? "300px" : undefined,
        }}
        onClick={handleClick}
      >
        {/* Editing mode - expanded textarea */}
        {isEditing ? (
          <div className="p-2">
            <div className="text-[10px] text-gray-500 mb-1 font-medium">
              {editingField === "short" ? "Edit Display Label" : "Edit Keywords"}
            </div>
            <textarea
              ref={textareaRef}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={handleEditSave}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              rows={4}
              className="w-full px-2 py-1.5 text-xs border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none leading-relaxed"
              placeholder={editingField === "short" ? "Display label..." : "Keywords (comma separated)..."}
            />
            <div className="flex items-center justify-end mt-1.5">
              <div className="flex gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditCancel(); }}
                  className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditSave(); }}
                  className="px-2 py-0.5 text-[10px] text-white bg-blue-500 hover:bg-blue-600 rounded"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Header row - normal view */}
            <div className="flex items-center gap-1 px-2 py-1.5">
              <span
                ref={spanRef}
                className={`text-xs font-medium flex-1 ${hasCustomShortLabel ? '' : 'truncate'}`}
                style={{ color: config.color }}
                title={fullKeywords}
              >
                {headerLabel}
              </span>

              {/* Edit short label icon - show on hover */}
              {onEditShortLabel && (
                <button
                  onClick={handleEditShortClick}
                  className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Edit display label"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}

              {/* Eye icon */}
              <button
                onClick={handleEyeClick}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 flex-shrink-0"
                title="Hide area"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>

              {/* Drag handle */}
              <button
                onMouseDown={handleDragMouseDown}
                className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-move flex-shrink-0"
                title="Drag to move"
              >
                <Move className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expanded info on hover (when not editing) */}
            {isHighlighted && !isDragging && (
              <div className="px-2 py-1.5 border-t border-gray-100 bg-gray-50 rounded-b-lg">
                {/* Area ID */}
                <div className="text-[10px] text-gray-400 mb-1">
                  Area {area.id}
                </div>
                {/* Full keywords */}
                <div className="flex items-start gap-1 mb-1">
                  <span className="text-xs text-gray-600 leading-relaxed break-words flex-1">
                    {fullKeywords}
                  </span>
                  {/* Edit keywords icon */}
                  {onEditLabel && (
                    <button
                      onClick={handleEditKeywordsClick}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-500 flex-shrink-0"
                      title="Edit keywords"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-gray-400">
                  {area.count} patents · {trendDisplay}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}