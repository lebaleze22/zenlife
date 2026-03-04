
import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Target, 
  Briefcase, 
  Wallet, 
  ListChecks,
  Settings, 
  LogOut, 
  Menu, 
  X,
  Languages,
  Sun,
  Moon
} from 'lucide-react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
  activeSection: string;
  setActiveSection: (section: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeSection, setActiveSection }) => {
  const { language, setLanguage, theme, setTheme } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const t = translations[language];

  const navigation = [
    { id: 'dashboard', name: t.dashboard, icon: LayoutDashboard },
    { id: 'goals', name: t.goals, icon: Target },
    { id: 'projects', name: t.projects, icon: Briefcase },
    { id: 'budget', name: t.budget, icon: Wallet },
    { id: 'planning', name: t.planning, icon: ListChecks },
    { id: 'settings', name: t.settings, icon: Settings },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'fr' : 'en');
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Sidebar Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 w-64 ${theme === 'dark' ? 'bg-slate-800' : 'bg-white'} border-r border-gray-200 shadow-xl transition-transform duration-300 z-30 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-6 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-blue-600 flex items-center gap-2">
              <span className="p-2 bg-blue-100 rounded-lg text-blue-600">Zen</span>
              <span>Life</span>
            </h1>
            <button className="lg:hidden" onClick={() => setIsSidebarOpen(false)}>
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeSection === item.id
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : `${theme === 'dark' ? 'hover:bg-slate-700 text-gray-300' : 'hover:bg-gray-100 text-gray-600'}`
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 border-t border-gray-100">
             <div className="flex items-center gap-2 justify-between">
                <button 
                  onClick={toggleLanguage}
                  className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                >
                  <Languages size={20} />
                </button>
                <button 
                  onClick={toggleTheme}
                  className={`p-2 rounded-lg transition-colors ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}
                >
                  {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                </button>
                <button className={`p-2 rounded-lg text-red-500 transition-colors ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
                  <LogOut size={20} />
                </button>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`lg:ml-64 min-h-screen transition-all duration-300`}>
        {/* Navbar */}
        <header className={`sticky top-0 z-10 flex items-center justify-between px-6 py-4 ${theme === 'dark' ? 'bg-slate-900/80' : 'bg-gray-50/80'} backdrop-blur-md border-b border-gray-100 lg:hidden`}>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-gray-200 rounded-lg">
            <Menu size={24} />
          </button>
          <span className="text-xl font-bold text-blue-600">ZenLife</span>
          <div className="w-10"></div>
        </header>

        <div className="p-6 lg:p-10 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
