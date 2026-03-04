import React, { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import { Plus, Trash2, Edit3, CheckCircle, Clock } from 'lucide-react';
import { BudgetType, Goal, Priority, Status } from '../types';
import { createGoal, deleteGoal, listGoals, updateGoal, type CreateGoalInput, type GoalDto } from '../data/api/goals';

const mapDtoToGoal = (dto: GoalDto): Goal => ({
  id: String(dto.id),
  title: dto.title,
  description: dto.description || '',
  category: dto.category || 'Personal',
  priority: dto.priority as Priority,
  progress: dto.progress,
  targetAmount: Number(dto.target_amount || 0),
  savedAmount: Number(dto.saved_amount || 0),
  deadline: dto.deadline || '',
  status: dto.status as Status,
  createdAt: new Date(dto.created_at).getTime(),
});

const toPayload = (g: Partial<Goal>): CreateGoalInput => ({
  title: g.title || '',
  description: g.description || '',
  category: g.category || 'Personal',
  priority: (g.priority || Priority.MEDIUM) as CreateGoalInput['priority'],
  progress: g.progress ?? 0,
  target_amount: String(g.targetAmount ?? 0),
  saved_amount: String(g.savedAmount ?? 0),
  deadline: g.deadline || null,
  status: (g.status || Status.NOT_STARTED) as CreateGoalInput['status'],
});

const GoalsSection: React.FC = () => {
  const { goals, setGoals, budget, language, theme } = useApp();
  const t = translations[language];
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Goal>>({
    title: '',
    description: '',
    category: 'Personal',
    priority: Priority.MEDIUM,
    deadline: '',
    progress: 0,
    targetAmount: 0,
    savedAmount: 0,
    status: Status.NOT_STARTED,
  });

  const fetchGoals = async () => {
    const token = localStorage.getItem('zenlife_access_token');
    if (!token) {
      setBackendConnected(false);
      return;
    }
    try {
      setSyncing(true);
      const resp = await listGoals();
      setGoals(resp.results.map(mapDtoToGoal));
      setBackendConnected(true);
      setApiError(null);
    } catch {
      setBackendConnected(false);
      setApiError('API goals unavailable, local mode active.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleSave = async () => {
    if (!formData.title) return;

    const token = localStorage.getItem('zenlife_access_token');
    const payload = toPayload(formData);

    if (token) {
      try {
        setSyncing(true);
        if (editingGoal) {
          await updateGoal(Number(editingGoal.id), payload);
        } else {
          await createGoal(payload);
        }
        await fetchGoals();
        closeModal();
        return;
      } catch {
        setApiError('Goal sync failed, data saved locally.');
      } finally {
        setSyncing(false);
      }
    }

    if (editingGoal) {
      setGoals((prev) => prev.map((g) => (g.id === editingGoal.id ? ({ ...g, ...formData } as Goal) : g)));
    } else {
      const newGoal: Goal = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        title: formData.title!,
        description: formData.description || '',
        category: formData.category || 'Personal',
        priority: formData.priority || Priority.MEDIUM,
        deadline: formData.deadline || new Date().toISOString().split('T')[0],
        progress: formData.progress || 0,
        targetAmount: formData.targetAmount ?? 0,
        savedAmount: formData.savedAmount || 0,
        status: formData.status || Status.NOT_STARTED,
      };
      setGoals((prev) => [newGoal, ...prev]);
    }
    closeModal();
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGoal(null);
    setFormData({
      title: '',
      description: '',
      category: 'Personal',
      priority: Priority.MEDIUM,
      deadline: '',
      progress: 0,
      targetAmount: 0,
      savedAmount: 0,
      status: Status.NOT_STARTED,
    });
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData(goal);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;

    const token = localStorage.getItem('zenlife_access_token');
    if (token) {
      try {
        setSyncing(true);
        await deleteGoal(Number(id));
        await fetchGoals();
        return;
      } catch {
        setApiError('Delete failed on backend, removed locally only.');
      } finally {
        setSyncing(false);
      }
    }

    setGoals((prev) => prev.filter((g) => g.id !== id));
  };

  const toggleComplete = async (goal: Goal) => {
    const nextStatus = goal.status === Status.COMPLETED ? Status.IN_PROGRESS : Status.COMPLETED;
    const nextProgress = goal.status === Status.COMPLETED ? 50 : 100;

    const token = localStorage.getItem('zenlife_access_token');
    if (token) {
      try {
        setSyncing(true);
        await updateGoal(Number(goal.id), {
          status: nextStatus as CreateGoalInput['status'],
          progress: nextProgress,
        });
        await fetchGoals();
        return;
      } catch {
        setApiError('Goal update failed, local fallback used.');
      } finally {
        setSyncing(false);
      }
    }

    setGoals((prev) => prev.map((g) => (g.id === goal.id ? { ...g, status: nextStatus, progress: nextProgress } : g)));
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{t.goals}</h2>
          <p className="text-gray-500">Define and conquer your milestones.</p>
          <p className={`text-xs mt-2 ${backendConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
            {backendConnected ? 'Backend sync active' : 'Local mode'} {syncing ? ' (syncing...)' : ''}
          </p>
          {apiError && <p className="text-xs mt-1 text-rose-500">{apiError}</p>}
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all"
        >
          <Plus size={20} />
          {t.addGoal}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {goals.map((goal) => (
          <div key={goal.id} className={`group p-6 rounded-2xl shadow-sm border transition-all hover:shadow-md ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
            {(() => {
              const savingsHistory = budget
                .filter((b) => b.type === BudgetType.SAVINGS && b.linkedGoalId === goal.id)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              return (
                <>
            <div className="flex justify-between items-start mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                goal.priority === Priority.HIGH || goal.priority === Priority.CRITICAL ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {t[goal.priority.toLowerCase() as keyof typeof t]}
              </span>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => openEdit(goal)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-blue-500">
                  <Edit3 size={16} />
                </button>
                <button onClick={() => handleDelete(goal.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-red-500">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            <h3 className={`text-xl font-bold mb-2 flex items-center gap-2 ${goal.status === Status.COMPLETED ? 'line-through text-gray-400' : ''}`}>
              {goal.title}
              {goal.status === Status.COMPLETED && <CheckCircle size={18} className="text-green-500" />}
            </h3>
            <p className="text-gray-500 text-sm mb-6 line-clamp-2">{goal.description}</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-gray-400">
                  <Clock size={14} />
                  <span>{goal.deadline}</span>
                </div>
                <span className="font-bold">{goal.progress}%</span>
              </div>
              {goal.targetAmount > 0 && (
                <div className="text-xs text-gray-500">
                  Saved: {goal.savedAmount.toLocaleString()} / {goal.targetAmount.toLocaleString()} FCFA
                </div>
              )}
              <div className="h-2 w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${goal.status === Status.COMPLETED ? 'bg-green-500' : 'bg-blue-600'}`}
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => toggleComplete(goal)}
              className={`w-full mt-6 py-2 rounded-xl border transition-all font-medium ${
                goal.status === Status.COMPLETED
                  ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                  : 'border-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {goal.status === Status.COMPLETED ? t.completed : 'Mark Complete'}
            </button>

            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
              <p className="text-xs font-semibold text-gray-500 mb-2">Savings Contributions ({savingsHistory.length})</p>
              {savingsHistory.length === 0 ? (
                <p className="text-xs text-gray-400">No savings entries linked yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                  {savingsHistory.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="text-xs flex items-center justify-between gap-2">
                      <span className="text-gray-500 truncate">{entry.date} {entry.description ? `- ${entry.description}` : ''}</span>
                      <span className="font-semibold text-emerald-600 whitespace-nowrap">+{entry.amount.toLocaleString()} FCFA</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
                </>
              );
            })()}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-white'}`}>
            <h3 className="text-2xl font-bold mb-6">{editingGoal ? t.edit : t.addGoal}</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">{t.title}</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">{t.description}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px] ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.priority}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <option value={Priority.LOW}>{t.low}</option>
                    <option value={Priority.MEDIUM}>{t.medium}</option>
                    <option value={Priority.HIGH}>{t.high}</option>
                    <option value={Priority.CRITICAL}>{t.critical}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.deadline}</label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Target Amount (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.targetAmount ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      targetAmount: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                  className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                />
                <p className="text-[11px] text-gray-400 mt-1">Saved amount updates automatically from linked savings entries.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">{t.progress} (%)</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.progress}
                  onChange={(e) => setFormData({ ...formData, progress: parseInt(e.target.value, 10) })}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={closeModal} className={`flex-1 py-3 rounded-xl font-bold transition-all ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>{t.cancel}</button>
              <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all">{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalsSection;
