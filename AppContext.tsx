
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState, Goal, Project, BudgetItem, Language, Theme } from './types';

interface AppContextType extends AppState {
  setGoals: React.Dispatch<React.SetStateAction<Goal[]>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setBudget: React.Dispatch<React.SetStateAction<BudgetItem[]>>;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  exportData: () => void;
  importData: (data: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [goals, setGoals] = useState<Goal[]>(() => {
    const saved = localStorage.getItem('zenlife_goals');
    return saved ? JSON.parse(saved) : [];
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('zenlife_projects');
    return saved ? JSON.parse(saved) : [];
  });

  const [budget, setBudget] = useState<BudgetItem[]>(() => {
    const saved = localStorage.getItem('zenlife_budget');
    return saved ? JSON.parse(saved) : [];
  });

  const [language, setLanguageState] = useState<Language>(() => {
    return (localStorage.getItem('zenlife_lang') as Language) || 'en';
  });

  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('zenlife_theme') as Theme) || 'light';
  });

  useEffect(() => {
    localStorage.setItem('zenlife_goals', JSON.stringify(goals));
  }, [goals]);

  useEffect(() => {
    localStorage.setItem('zenlife_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('zenlife_budget', JSON.stringify(budget));
  }, [budget]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('zenlife_lang', lang);
  };

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem('zenlife_theme', t);
  };

  const exportData = useCallback(() => {
    const data = { goals, projects, budget };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zenlife_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }, [goals, projects, budget]);

  const importData = (dataStr: string) => {
    try {
      const data = JSON.parse(dataStr);
      if (data.goals) setGoals(data.goals);
      if (data.projects) setProjects(data.projects);
      if (data.budget) setBudget(data.budget);
    } catch (e) {
      alert("Invalid backup file");
    }
  };

  return (
    <AppContext.Provider value={{
      goals, projects, budget, language, theme,
      setGoals, setProjects, setBudget, setLanguage, setTheme,
      exportData, importData
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
