import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import { Download, Upload, Languages, Moon, Sun, ShieldCheck, Database, PlugZap, ListChecks } from 'lucide-react';
import { login } from '../data/api/auth';
import { createAccount, createLedgerEntry, listAccounts } from '../data/api/ledger';
import { createProject, listProjects } from '../data/api/projects';
import { createToBuyItem, createTodo, listToBuyItems, listTodos } from '../data/api/planning';

const SettingsSection: React.FC = () => {
  const { language, setLanguage, theme, setTheme, exportData, importData } = useApp();
  const t = translations[language];

  const [authForm, setAuthForm] = useState({ username: 's1tester', password: 'StrongPass123!' });
  const [entryForm, setEntryForm] = useState({
    amount: '5000.00',
    date: new Date().toISOString().split('T')[0],
    note: 'front mini test entry',
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE',
  });
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [planningBusy, setPlanningBusy] = useState(false);
  const [planningStatus, setPlanningStatus] = useState<string | null>(null);

  const [toBuyForm, setToBuyForm] = useState({
    name: 'Baby monitor',
    category: 'Electronics',
    estimated_cost: '65000.00',
    target_date: new Date().toISOString().split('T')[0],
    status: 'IDEA' as 'IDEA' | 'RESEARCHING' | 'PLANNED' | 'ORDERED' | 'DELIVERED' | 'INSTALLED' | 'RETURNED',
  });
  const [todoForm, setTodoForm] = useState({
    title: 'Call painter',
    description: 'Get two quotes',
    due_date: new Date().toISOString().split('T')[0],
    status: 'NOT_STARTED' as 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED',
  });

  const [latestToBuy, setLatestToBuy] = useState<string>('');
  const [latestTodo, setLatestTodo] = useState<string>('');

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        importData(content);
      };
      reader.readAsText(file);
    }
  };

  const handleBackendLogin = async () => {
    setTestBusy(true);
    setTestStatus(null);
    try {
      const res = await login(authForm);
      localStorage.setItem('zenlife_access_token', res.access);
      localStorage.setItem('zenlife_refresh_token', res.refresh);
      setTestStatus('Backend login OK. Token saved in localStorage.');
    } catch (error) {
      setTestStatus(`Login failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setTestBusy(false);
    }
  };

  const handleWriteMiniEntry = async () => {
    setTestBusy(true);
    setTestStatus(null);
    try {
      let accounts = await listAccounts();
      let accountId = accounts.results[0]?.id;

      if (!accountId) {
        const created = await createAccount({
          name: 'Main Planning',
          type: 'CASH',
          currency: 'XAF',
          opening_balance: '0.00',
          current_balance: '0.00',
          is_active: true,
        });
        accountId = created.id;
      }

      const createdEntry = await createLedgerEntry({
        account: accountId,
        type: entryForm.type,
        status: 'PLANNED',
        amount: entryForm.amount,
        currency: 'XAF',
        entry_date: entryForm.date,
        note: entryForm.note,
      });

      setTestStatus(`Write OK. Entry #${createdEntry.id} saved in PostgreSQL.`);
    } catch (error) {
      setTestStatus(`Write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setTestBusy(false);
    }
  };

  const ensurePlanningProjectId = async (): Promise<number> => {
    const projects = await listProjects();
    const existing = projects.results.find((p) => p.name === 'Planning Sandbox');
    if (existing) return existing.id;
    const created = await createProject({
      name: 'Planning Sandbox',
      description: 'Auto-created by mini test panel',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      deadline: new Date().toISOString().split('T')[0],
      tasks: [],
    });
    return created.id;
  };

  const handleWriteToBuy = async () => {
    setPlanningBusy(true);
    setPlanningStatus(null);
    try {
      const projectId = await ensurePlanningProjectId();
      const created = await createToBuyItem({
        project: projectId,
        name: toBuyForm.name,
        category: toBuyForm.category,
        estimated_cost: toBuyForm.estimated_cost,
        status: toBuyForm.status,
        target_date: toBuyForm.target_date,
        priority: 'HIGH',
        quantity: 1,
        notes: 'Created from frontend mini test',
      });

      const recent = await listToBuyItems();
      const head = recent.results[0];
      setLatestToBuy(head ? `#${head.id} ${head.name} (${head.status})` : '');
      setPlanningStatus(`ToBuy write OK. Item #${created.id} saved in PostgreSQL.`);
    } catch (error) {
      setPlanningStatus(`ToBuy write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setPlanningBusy(false);
    }
  };

  const handleWriteTodo = async () => {
    setPlanningBusy(true);
    setPlanningStatus(null);
    try {
      const projectId = await ensurePlanningProjectId();
      const created = await createTodo({
        project: projectId,
        title: todoForm.title,
        description: todoForm.description,
        due_date: todoForm.due_date,
        status: todoForm.status,
        priority: 'MEDIUM',
      });

      const recent = await listTodos();
      const head = recent.results[0];
      setLatestTodo(head ? `#${head.id} ${head.title} (${head.status})` : '');
      setPlanningStatus(`Todo write OK. Item #${created.id} saved in PostgreSQL.`);
    } catch (error) {
      setPlanningStatus(`Todo write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setPlanningBusy(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-3xl font-bold mb-2">{t.settings}</h2>
        <p className="text-gray-500">Configure your application preferences.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className={`p-8 rounded-3xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><Languages size={22} className="text-blue-500" /> Preference</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{t.language}</p>
                <p className="text-sm text-gray-400">Choose your interface language</p>
              </div>
              <div className="flex bg-gray-50 dark:bg-slate-700 p-1 rounded-xl">
                <button onClick={() => setLanguage('en')} className={`px-4 py-2 rounded-lg font-bold transition-all ${language === 'en' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}>English</button>
                <button onClick={() => setLanguage('fr')} className={`px-4 py-2 rounded-lg font-bold transition-all ${language === 'fr' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}>Francais</button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">{t.theme}</p>
                <p className="text-sm text-gray-400">Switch between light and dark modes</p>
              </div>
              <div className="flex bg-gray-50 dark:bg-slate-700 p-1 rounded-xl">
                <button onClick={() => setTheme('light')} className={`px-4 py-2 rounded-lg font-bold transition-all ${theme === 'light' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}><Sun size={18} /></button>
                <button onClick={() => setTheme('dark')} className={`px-4 py-2 rounded-lg font-bold transition-all ${theme === 'dark' ? 'bg-white dark:bg-slate-600 shadow-sm text-blue-600' : 'text-gray-400'}`}><Moon size={18} /></button>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-8 rounded-3xl border shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2"><ShieldCheck size={22} className="text-emerald-500" /> Data & Privacy</h3>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">Backup & Sync</p>
                <p className="text-sm text-gray-400">Your data is stored locally in your browser.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={exportData}
                className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 font-bold transition-all"
              >
                <Download size={18} /> {t.exportData}
              </button>
              <label className="flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 font-bold transition-all cursor-pointer">
                <Upload size={18} /> {t.importData}
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className={`p-8 rounded-3xl border shadow-sm space-y-5 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <h3 className="text-xl font-bold flex items-center gap-2"><Database size={22} className="text-indigo-500" /> Mini Test Backend (Front to PostgreSQL)</h3>
        <p className="text-sm text-gray-400">Use this panel to login from the frontend and write one planning entry into DB.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            value={authForm.username}
            onChange={(e) => setAuthForm((p) => ({ ...p, username: e.target.value }))}
            placeholder="username"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="password"
            value={authForm.password}
            onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))}
            placeholder="password"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <button
            onClick={handleBackendLogin}
            disabled={testBusy}
            className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-60"
          >
            Connect Backend
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={entryForm.type}
            onChange={(e) => setEntryForm((p) => ({ ...p, type: e.target.value as 'INCOME' | 'EXPENSE' }))}
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          >
            <option value="EXPENSE">EXPENSE</option>
            <option value="INCOME">INCOME</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={entryForm.amount}
            onChange={(e) => setEntryForm((p) => ({ ...p, amount: e.target.value }))}
            placeholder="amount"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="date"
            value={entryForm.date}
            onChange={(e) => setEntryForm((p) => ({ ...p, date: e.target.value }))}
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="text"
            value={entryForm.note}
            onChange={(e) => setEntryForm((p) => ({ ...p, note: e.target.value }))}
            placeholder="note"
            className={`px-4 py-3 rounded-xl border outline-none md:col-span-2 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
        </div>

        <button
          onClick={handleWriteMiniEntry}
          disabled={testBusy}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-60"
        >
          <PlugZap size={16} /> Write Test Entry To DB
        </button>

        {testStatus && (
          <div className={`text-sm font-medium p-3 rounded-xl ${testStatus.includes('failed') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {testStatus}
          </div>
        )}
      </div>

      <div className={`p-8 rounded-3xl border shadow-sm space-y-5 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
        <h3 className="text-xl font-bold flex items-center gap-2"><ListChecks size={22} className="text-violet-500" /> Mini Test Planning (ToBuy + Todos)</h3>
        <p className="text-sm text-gray-400">Requires backend login above. This writes `to-buy-items` and `todos` into PostgreSQL.</p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            type="text"
            value={toBuyForm.name}
            onChange={(e) => setToBuyForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="to-buy name"
            className={`px-4 py-3 rounded-xl border outline-none md:col-span-2 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="text"
            value={toBuyForm.category}
            onChange={(e) => setToBuyForm((p) => ({ ...p, category: e.target.value }))}
            placeholder="category"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="number"
            step="0.01"
            value={toBuyForm.estimated_cost}
            onChange={(e) => setToBuyForm((p) => ({ ...p, estimated_cost: e.target.value }))}
            placeholder="estimated cost"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <select
            value={toBuyForm.status}
            onChange={(e) => setToBuyForm((p) => ({ ...p, status: e.target.value as typeof toBuyForm.status }))}
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          >
            <option value="IDEA">IDEA</option>
            <option value="RESEARCHING">RESEARCHING</option>
            <option value="PLANNED">PLANNED</option>
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            value={todoForm.title}
            onChange={(e) => setTodoForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="todo title"
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <input
            type="text"
            value={todoForm.description}
            onChange={(e) => setTodoForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="todo description"
            className={`px-4 py-3 rounded-xl border outline-none md:col-span-2 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          />
          <select
            value={todoForm.status}
            onChange={(e) => setTodoForm((p) => ({ ...p, status: e.target.value as typeof todoForm.status }))}
            className={`px-4 py-3 rounded-xl border outline-none ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
          >
            <option value="NOT_STARTED">NOT_STARTED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleWriteToBuy}
            disabled={planningBusy}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600 text-white font-bold hover:bg-violet-700 disabled:opacity-60"
          >
            <PlugZap size={16} /> Write Test ToBuy
          </button>
          <button
            onClick={handleWriteTodo}
            disabled={planningBusy}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-700 disabled:opacity-60"
          >
            <PlugZap size={16} /> Write Test Todo
          </button>
        </div>

        {(latestToBuy || latestTodo) && (
          <div className="text-xs text-gray-500 space-y-1">
            {latestToBuy && <p>Latest ToBuy: {latestToBuy}</p>}
            {latestTodo && <p>Latest Todo: {latestTodo}</p>}
          </div>
        )}

        {planningStatus && (
          <div className={`text-sm font-medium p-3 rounded-xl ${planningStatus.includes('failed') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {planningStatus}
          </div>
        )}
      </div>

      <div className="p-12 text-center opacity-50">
        <p className="text-sm">ZenLife Manager v1.0.0 - Planning and management mode</p>
      </div>
    </div>
  );
};

export default SettingsSection;
