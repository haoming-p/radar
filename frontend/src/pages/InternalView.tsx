import AnalysisView from '../components/internal/AnalysisView';

interface InternalViewProps {
  onBack: () => void;
}

export default function InternalView({ onBack }: InternalViewProps) {
  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: 'calc(100vh - 49px)' }}>
      <AnalysisView key="internal" onBack={onBack} data={null} mode="internal" />
    </div>
  );
}
