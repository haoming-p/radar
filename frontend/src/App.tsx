import { User } from 'lucide-react';
import InternalView from './pages/InternalView';
import ReportView from './pages/ReportView';

export type ViewType = 'home' | 'internal' | 'client' | 'v11';

function App() {
  // Route: /report renders standalone report page
  if (window.location.pathname === '/report') {
    return <ReportView />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="VALUENEX" className="h-8" />
          <span className="text-sm text-gray-500">demo - patent analysis</span>
        </div>

        {/* User label */}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <User size={16} />
          <span>Demo User</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col">
        <InternalView />
      </main>
    </div>
  );
}

export default App;
