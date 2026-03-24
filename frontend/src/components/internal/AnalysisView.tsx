import { useState, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import RadarMap, { PatentPoint, ClusterInfo, AreaInfo, DimMethod } from "./map/RadarMap";
import KeyAreasSidebar from "./sidebar/KeyAreasSidebar";

// Radar 1.0 reference data
import radar10Data from "../../testData/radar10-272364.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpatialData = any;
type ViewSource = "pipeline" | "radar10";

interface AnalysisViewProps {
  onBack: () => void;
  data: SpatialData;
}

export default function AnalysisView({ onBack, data }: AnalysisViewProps) {
  const [highlightedArea, setHighlightedArea] = useState<number | null>(null);
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [dimensions] = useState({ width: 900, height: 700 });
  const [dimMethod, setDimMethod] = useState<DimMethod>("tsne");
  const [viewSource, setViewSource] = useState<ViewSource>("pipeline");

  // Parse pipeline data
  const pipelinePatents: PatentPoint[] = data?.patents || [];
  const pipelineClusters: Record<string, ClusterInfo> = data?.clusters || {};
  const areas: Record<string, AreaInfo> = data?.areas || {};
  const method = data?.method || {};

  // Parse radar 1.0 data (static, uses single centroid field)
  const radar10Clusters = useMemo(() => {
    const clusters: Record<string, ClusterInfo> = {};
    for (const [id, cl] of Object.entries(radar10Data.clusters as Record<string, any>)) {
      clusters[id] = {
        ...cl,
        centroid_umap: cl.centroid,
        centroid_tsne: cl.centroid,
      };
    }
    return clusters;
  }, []);

  const radar10Patents = useMemo(() => {
    return (radar10Data.patents as any[]).map((p) => ({
      ...p,
      x_umap: p.x,
      y_umap: p.y,
      x_tsne: p.x,
      y_tsne: p.y,
    }));
  }, []);

  // Select active data based on view source
  const activePatents = viewSource === "radar10" ? radar10Patents : pipelinePatents;
  const activeClusters = viewSource === "radar10" ? radar10Clusters : pipelineClusters;

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.2, 5)), []);
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.2, 0.5)), []);
  const handleZoomReset = useCallback(() => setZoom(1.2), []);

  const handleSelectArea = useCallback((id: number) => {
    setSelectedArea((prev) => (prev === id ? null : id));
  }, []);

  // Params display for current dim method
  const currentParams = dimMethod === "umap"
    ? method.umap_params || { spread: 3.0, min_dist: 1.0 }
    : method.tsne_params || { perplexity: 30 };

  const paramsText = dimMethod === "umap"
    ? `spread: ${currentParams.spread}, min_dist: ${currentParams.min_dist}`
    : `perplexity: ${currentParams.perplexity}`;

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b flex-shrink-0 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="text-xs text-gray-400">|</div>

        <div className="text-xs text-gray-600">
          {activePatents.length} patents · {Object.keys(activeClusters).length} clusters · {Object.keys(areas).length} areas
        </div>

        <div className="text-xs text-gray-400">|</div>

        {/* View source toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">View:</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setViewSource("pipeline")}
              className={`text-xs px-2 py-0.5 rounded ${
                viewSource === "pipeline"
                  ? "bg-[#0d3356] text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              Pipeline
            </button>
            <button
              onClick={() => setViewSource("radar10")}
              className={`text-xs px-2 py-0.5 rounded ${
                viewSource === "radar10"
                  ? "bg-[#0d3356] text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              Radar 1.0
            </button>
          </div>
        </div>

        {/* Dimensionality reduction toggle — only for pipeline view */}
        {viewSource === "pipeline" && (
          <>
            <div className="text-xs text-gray-400">|</div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Dimensionality Reduction:</span>
              <div className="flex items-center gap-1">
                {(["umap", "tsne"] as DimMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDimMethod(m)}
                    className={`text-xs px-2 py-0.5 rounded ${
                      dimMethod === m
                        ? "bg-[#0d3356] text-white"
                        : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {m === "umap" ? "UMAP" : "t-SNE"}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-gray-400">{paramsText}</span>
            </div>
          </>
        )}
      </div>

      {/* Main content: sidebar + map */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-72 flex-shrink-0">
          <KeyAreasSidebar
            areas={areas}
            highlightedArea={highlightedArea}
            selectedArea={selectedArea}
            onHighlightArea={setHighlightedArea}
            onSelectArea={handleSelectArea}
          />
        </div>

        {/* Map */}
        <div className="flex-1">
          <RadarMap
            patents={activePatents}
            clusters={activeClusters}
            areas={viewSource === "radar10" ? {} : areas}
            dimMethod={viewSource === "radar10" ? "umap" : dimMethod}
            highlightedArea={highlightedArea}
            onHighlightArea={setHighlightedArea}
            onSelectArea={handleSelectArea}
            dimensions={dimensions}
            zoom={zoom}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomReset={handleZoomReset}
          />
        </div>
      </div>
    </div>
  );
}
