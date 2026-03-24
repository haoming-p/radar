import { ViewType } from '../App';

interface HomePageProps {
  onNavigate: (view: ViewType) => void;
}

export default function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="flex-1 flex flex-col items-center pt-[15vh] bg-white">
      {/* Buttons in a row */}
      <div className="flex gap-6">
        <button
          onClick={() => onNavigate('internal')}
          className="px-8 py-4 bg-white text-[#0d3356] border border-gray-300 rounded-lg font-medium text-base hover:bg-gray-50 hover:border-[#0d3356] transition-colors min-w-[180px]"
        >
          Internal View
        </button>

        <button
          onClick={() => onNavigate('client')}
          className="px-8 py-4 bg-white text-[#0d3356] border border-gray-300 rounded-lg font-medium text-base hover:bg-gray-50 hover:border-[#0d3356] transition-colors min-w-[180px]"
        >
          Customer View
        </button>

        <button
          onClick={() => onNavigate('v11')}
          className="px-8 py-4 bg-white text-[#0d3356] border border-gray-300 rounded-lg font-medium text-base hover:bg-gray-50 hover:border-[#0d3356] transition-colors min-w-[180px]"
        >
          Radar 1.1 View
        </button>
      </div>
    </div>
  );
}
