
import React, { useState } from 'react';
import { AppProvider, useApp } from './AppContext';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import GoalsSection from './components/GoalsSection';
import ProjectsSection from './components/ProjectsSection';
import BudgetSection from './components/BudgetSection';
import PlanningSection from './components/PlanningSection';
import SettingsSection from './components/SettingsSection';

const AppContent: React.FC = () => {
  const [activeSection, setActiveSection] = useState('dashboard');
  const { theme } = useApp();

  React.useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const renderSection = () => {
    switch (activeSection) {
      case 'dashboard': return <Dashboard />;
      case 'goals': return <GoalsSection />;
      case 'projects': return <ProjectsSection />;
      case 'budget': return <BudgetSection />;
      case 'planning': return <PlanningSection />;
      case 'settings': return <SettingsSection />;
      default: return <Dashboard />;
    }
  };

  return (
    <Layout activeSection={activeSection} setActiveSection={setActiveSection}>
      {renderSection()}
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
};

export default App;
