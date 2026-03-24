import { useState, useRef, useEffect } from 'react';
import { User, ChevronDown } from 'lucide-react';
import HomePage from './pages/HomePage';
import InternalView from './pages/InternalView';
import ClientView from './pages/ClientView';
import V11View from './pages/V11View';

export type ViewType = 'home' | 'internal' | 'client' | 'v11';

const VIEW_LABELS: Record<ViewType, string> = {
  home: 'Select User',
  internal: 'Internal View',
  client: 'Customer View',
  v11: '1.1 View',
};

function App() {
  const [activeView, setActiveView] = useState<ViewType>('home');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const renderContent = () => {
    switch (activeView) {
      case 'internal':
        return <InternalView onBack={() => setActiveView('home')} />;
      case 'client':
        return <ClientView onBack={() => setActiveView('home')} />;
      case 'v11':
        return <V11View onBack={() => setActiveView('home')} />;
      default:
        return <HomePage onNavigate={setActiveView} />;
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        {/* Logo */}
        <button
          onClick={() => setActiveView('home')}
          className="flex items-center"
        >
          <img src="/logo.png" alt="VALUENEX" className="h-8" />
        </button>

        {/* Account area with dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
          >
            <User size={16} />
            <span>{VIEW_LABELS[activeView]}</span>
            <ChevronDown size={14} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
              {(['internal', 'client', 'v11'] as ViewType[]).map((view) => (
                <button
                  key={view}
                  onClick={() => {
                    setActiveView(view);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                    activeView === view ? 'text-[#0d3356] font-medium' : 'text-gray-700'
                  }`}
                >
                  {VIEW_LABELS[view]}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
