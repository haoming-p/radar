import { BarChart3 } from "lucide-react";

export default function HighlightsSection() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-gray-600">
        <BarChart3 className="w-4 h-4" />
        <span className="text-sm">
          Overview charts and statistics for this dataset.
        </span>
      </div>
    </div>
  );
}