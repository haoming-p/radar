import { useState } from 'react';
import HomePage from './pages/HomePage';
import InternalView from './pages/InternalView';
import ClientView from './pages/ClientView';
import TestView from './pages/TestView';

export type ViewType = 'home' | 'internal' | 'client' | 'test';

function App() {
  const [activeView, setActiveView] = useState<ViewType>('home');

  switch (activeView) {
    case 'internal':
      return <InternalView onBack={() => setActiveView('home')} />;
    case 'client':
      return <ClientView onBack={() => setActiveView('home')} />;
    case 'test':
      return <TestView onBack={() => setActiveView('home')} />;
    default:
      return <HomePage onNavigate={setActiveView} />;
  }
}

export default App;
