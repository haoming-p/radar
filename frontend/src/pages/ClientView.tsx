interface ClientViewProps {
  onBack: () => void;
}

export default function ClientView({ onBack: _onBack }: ClientViewProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-white">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-[#0d3356] mb-2">Customer View</h2>
        <p className="text-gray-500">Coming Soon</p>
      </div>
    </div>
  );
}
