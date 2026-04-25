import AnalysisView from '../components/internal/AnalysisView';

export default function InternalView() {
  return (
    <div className="flex flex-col w-full overflow-hidden" style={{ height: 'calc(100vh - 49px)' }}>
      <AnalysisView key="internal" data={null} mode="internal" />
    </div>
  );
}
