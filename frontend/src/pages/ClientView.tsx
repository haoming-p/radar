import { ArrowLeft } from 'lucide-react';

interface ClientViewProps {
  onBack: () => void;
}

export default function ClientView({ onBack }: ClientViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <button
        onClick={onBack}
        className="absolute top-6 left-6 flex items-center text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={18} className="mr-1" />
        <span className="text-sm">Back to Home</span>
      </button>

      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[#0d3356] mb-2">客户视角</h2>
        <p className="text-gray-500">Coming Soon</p>
      </div>
    </div>
  );
}
