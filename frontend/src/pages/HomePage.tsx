import { ViewType } from '../App';

interface HomePageProps {
  onNavigate: (view: ViewType) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-[#0d3356] to-[#1a4a7a]">
      {/* Logo / Title */}
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-white tracking-wide">
          VALUENEX Radar
        </h1>
        <p className="text-white/60 mt-2 text-sm">Patent Analysis Platform</p>
      </div>

      {/* Buttons */}
      <div className="flex flex-col gap-4 w-72">
        <button
          onClick={() => onNavigate('internal')}
          className="px-6 py-4 bg-white text-[#0d3356] rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors shadow-lg"
        >
          内部视角
          <span className="block text-sm font-normal text-gray-500 mt-1">Internal View</span>
        </button>

        <button
          onClick={() => onNavigate('client')}
          className="px-6 py-4 bg-white/10 text-white border border-white/30 rounded-lg font-semibold text-lg hover:bg-white/20 transition-colors"
        >
          客户视角
          <span className="block text-sm font-normal text-white/60 mt-1">Customer View</span>
        </button>

        <button
          onClick={() => onNavigate('test')}
          className="px-6 py-4 bg-white/5 text-white/70 border border-white/15 rounded-lg font-medium text-sm hover:bg-white/10 transition-colors"
        >
          Test
          <span className="block text-xs font-normal text-white/40 mt-1">View with sample data</span>
        </button>
      </div>
    </div>
  );
}
