import StepAnalysisSpatial from '../components/internal/map/StepAnalysisSpatial';

// --- 1.1 data imports (delete this file + testData/ folder when no longer needed) ---
import spatialUmapHdbscan from '../testData/spatial_umap_hdbscan.json';
import spatialTsneHdbscan from '../testData/spatial_tsne_hdbscan.json';
import { useState } from 'react';

type V11DataSource = 'umap_hdbscan' | 'tsne_hdbscan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const V11_SOURCES: Record<V11DataSource, { data: any; label: string }> = {
  umap_hdbscan: { data: spatialUmapHdbscan, label: 'UMAP + HDBSCAN' },
  tsne_hdbscan: { data: spatialTsneHdbscan, label: 't-SNE + HDBSCAN' },
};

interface V11ViewProps {
  onBack: () => void;
}

export default function V11View({ onBack }: V11ViewProps) {
  const [dataSource, setDataSource] = useState<V11DataSource>('umap_hdbscan');

  return (
    <div className="flex-1 w-full flex flex-col" style={{ height: 'calc(100vh - 49px)' }}>
      {/* Thin toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-100 border-b flex-shrink-0">
        <span className="text-xs text-gray-500 font-medium">1.1 View</span>

        <div className="flex items-center gap-2 ml-auto">
          {Object.entries(V11_SOURCES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setDataSource(key as V11DataSource)}
              className={`text-xs px-3 py-1 rounded ${
                dataSource === key
                  ? 'bg-[#0d3356] text-white'
                  : 'bg-white text-gray-600 border hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <StepAnalysisSpatial
          onBack={onBack}
          liveData={V11_SOURCES[dataSource].data}
        />
      </div>
    </div>
  );
}
