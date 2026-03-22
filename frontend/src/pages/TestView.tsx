import StepAnalysisSpatial from '../components/internal/map/StepAnalysisSpatial';

// --- Test data imports (delete this file + testData/ folder when no longer needed) ---
import spatialUmapHdbscan from '../testData/spatial_umap_hdbscan.json';
import spatialTsneHdbscan from '../testData/spatial_tsne_hdbscan.json';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

type TestDataSource = 'umap_hdbscan' | 'tsne_hdbscan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TEST_SOURCES: Record<TestDataSource, { data: any; label: string }> = {
  umap_hdbscan: { data: spatialUmapHdbscan, label: 'UMAP + HDBSCAN' },
  tsne_hdbscan: { data: spatialTsneHdbscan, label: 't-SNE + HDBSCAN' },
};

interface TestViewProps {
  onBack: () => void;
}

export default function TestView({ onBack }: TestViewProps) {
  const [dataSource, setDataSource] = useState<TestDataSource>('umap_hdbscan');

  return (
    <div className="flex-1 w-full h-screen flex flex-col">
      {/* Thin toolbar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-gray-100 border-b flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} className="mr-1" />
          <span className="text-sm">Home</span>
        </button>

        <span className="text-xs text-gray-400">|</span>
        <span className="text-xs text-gray-500 font-medium">Test Mode</span>

        <div className="flex items-center gap-2 ml-auto">
          {Object.entries(TEST_SOURCES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setDataSource(key as TestDataSource)}
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
          liveData={TEST_SOURCES[dataSource].data}
        />
      </div>
    </div>
  );
}
