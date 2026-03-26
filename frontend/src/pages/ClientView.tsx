import AnalysisView from '../components/internal/AnalysisView';

interface ClientViewProps {
  onBack: () => void;
}

export default function ClientView({ onBack }: ClientViewProps) {
  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: 'calc(100vh - 49px)' }}>
      <AnalysisView key="client" onBack={onBack} data={null} mode="client" />
    </div>
  );
}
