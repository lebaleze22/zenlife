import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import { Boxes, CheckSquare, Edit3, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { createToBuyItem, createTodo, deleteToBuyItem, deleteTodo, listCategories, listToBuyItems, listTodos, updateToBuyItem, updateTodo, type CategoryDto, type PlanningPriority, type ToBuyStatus, type TodoStatus, type ToBuyItemDto, type TodoItemDto } from '../data/api/planning';
import { listProjects } from '../data/api/projects';

interface ProjectOption {
  id: number;
  name: string;
}

const PLANNING_CATEGORY_SUGGESTIONS = [
  'Groceries',
  'Housing',
  'Utilities',
  'Internet',
  'Phone',
  'Transportation',
  'Fuel',
  'Healthcare',
  'Insurance',
  'Education',
  'Books',
  'Home Office',
  'Electronics',
  'Software',
  'Subscriptions',
  'Clothing',
  'Family',
  'Gifts',
  'Travel',
  'Leisure',
  'Sports',
  'Maintenance',
  'Emergency',
  'Other',
];

const PlanningSection: React.FC = () => {
  const pageSize = 10;
  const { language, theme } = useApp();
  const t = translations[language];

  const [tab, setTab] = useState<'tobuy' | 'todo'>('tobuy');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [toBuyItems, setToBuyItems] = useState<ToBuyItemDto[]>([]);
  const [todoItems, setTodoItems] = useState<TodoItemDto[]>([]);
  const [editingToBuyId, setEditingToBuyId] = useState<number | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null);
  const [toBuyEditForm, setToBuyEditForm] = useState({
    project: '',
    name: '',
    category: '',
    estimated_cost: '',
    status: 'IDEA' as ToBuyStatus,
  });
  const [todoEditForm, setTodoEditForm] = useState({
    project: '',
    title: '',
    status: 'NOT_STARTED' as TodoStatus,
    due_date: '',
  });
  const [toBuyFilters, setToBuyFilters] = useState({
    q: '',
    project: 'ALL',
    status: 'ALL' as 'ALL' | ToBuyStatus,
    category: 'ALL',
    from: '',
    to: '',
  });
  const [todoFilters, setTodoFilters] = useState({
    q: '',
    project: 'ALL',
    status: 'ALL' as 'ALL' | TodoStatus,
    from: '',
    to: '',
  });
  const [toBuyPage, setToBuyPage] = useState(1);
  const [todoPage, setTodoPage] = useState(1);

  const [toBuyForm, setToBuyForm] = useState({
    project: '',
    name: '',
    category: '',
    priority: 'MEDIUM' as PlanningPriority,
    status: 'IDEA' as ToBuyStatus,
    estimated_cost: '',
    target_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const [todoForm, setTodoForm] = useState({
    project: '',
    title: '',
    description: '',
    priority: 'MEDIUM' as PlanningPriority,
    status: 'NOT_STARTED' as TodoStatus,
    due_date: new Date().toISOString().split('T')[0],
  });

  const hasToken = !!localStorage.getItem('zenlife_access_token');
  const categoryOptions = useMemo(() => {
    const fromBackend = categories.map((c) => c.name).filter(Boolean);
    return Array.from(new Set([...PLANNING_CATEGORY_SUGGESTIONS, ...fromBackend]));
  }, [categories]);
  const filteredToBuyItems = useMemo(() => {
    return toBuyItems.filter((item) => {
      const q = toBuyFilters.q.trim().toLowerCase();
      if (q) {
        const hay = `${item.name} ${item.category || ''} ${item.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (toBuyFilters.project !== 'ALL' && String(item.project || '') !== toBuyFilters.project) return false;
      if (toBuyFilters.status !== 'ALL' && item.status !== toBuyFilters.status) return false;
      if (toBuyFilters.category !== 'ALL' && (item.category || '') !== toBuyFilters.category) return false;
      if (toBuyFilters.from && (!item.target_date || item.target_date < toBuyFilters.from)) return false;
      if (toBuyFilters.to && (!item.target_date || item.target_date > toBuyFilters.to)) return false;
      return true;
    });
  }, [toBuyItems, toBuyFilters]);
  const filteredTodoItems = useMemo(() => {
    return todoItems.filter((item) => {
      const q = todoFilters.q.trim().toLowerCase();
      if (q) {
        const hay = `${item.title} ${item.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (todoFilters.project !== 'ALL' && String(item.project || '') !== todoFilters.project) return false;
      if (todoFilters.status !== 'ALL' && item.status !== todoFilters.status) return false;
      if (todoFilters.from && (!item.due_date || item.due_date < todoFilters.from)) return false;
      if (todoFilters.to && (!item.due_date || item.due_date > todoFilters.to)) return false;
      return true;
    });
  }, [todoItems, todoFilters]);
  const toBuyTotalPages = Math.max(1, Math.ceil(filteredToBuyItems.length / pageSize));
  const todoTotalPages = Math.max(1, Math.ceil(filteredTodoItems.length / pageSize));
  const pagedToBuyItems = useMemo(() => {
    const start = (toBuyPage - 1) * pageSize;
    return filteredToBuyItems.slice(start, start + pageSize);
  }, [filteredToBuyItems, toBuyPage]);
  const pagedTodoItems = useMemo(() => {
    const start = (todoPage - 1) * pageSize;
    return filteredTodoItems.slice(start, start + pageSize);
  }, [filteredTodoItems, todoPage]);

  const loadData = async () => {
    if (!hasToken) {
      setStatusMsg('Connect backend from Settings first.');
      return;
    }

    try {
      setBusy(true);
      const [p, tb, td, cats] = await Promise.all([listProjects(), listToBuyItems(), listTodos(), listCategories()]);
      setProjects(p.results.map((x) => ({ id: x.id, name: x.name })));
      setCategories(cats.results.filter((x) => x.type === 'EXPENSE'));
      setToBuyItems(tb.results);
      setTodoItems(td.results);
      setStatusMsg(null);
    } catch (error) {
      setStatusMsg(`Load failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);
  useEffect(() => {
    setToBuyPage(1);
  }, [toBuyFilters]);
  useEffect(() => {
    setTodoPage(1);
  }, [todoFilters]);
  useEffect(() => {
    if (toBuyPage > toBuyTotalPages) setToBuyPage(toBuyTotalPages);
  }, [toBuyPage, toBuyTotalPages]);
  useEffect(() => {
    if (todoPage > todoTotalPages) setTodoPage(todoTotalPages);
  }, [todoPage, todoTotalPages]);

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return '-';
    return projects.find((p) => p.id === projectId)?.name || `#${projectId}`;
  };

  const handleCreateToBuy = async () => {
    if (!toBuyForm.name.trim()) return;
    try {
      setBusy(true);
      const normalizedEstimatedCost = toBuyForm.estimated_cost.trim().replace(',', '.');
      const payload = {
        project: toBuyForm.project ? Number(toBuyForm.project) : null,
        name: toBuyForm.name,
        category: toBuyForm.category,
        priority: toBuyForm.priority,
        status: toBuyForm.status,
        quantity: 1,
        estimated_cost: normalizedEstimatedCost || undefined,
        target_date: toBuyForm.target_date,
        notes: toBuyForm.notes,
      };
      await createToBuyItem(payload);
      setToBuyForm((p) => ({ ...p, name: '', category: '', estimated_cost: '', notes: '' }));
      await loadData();
      setStatusMsg('ToBuy item created.');
    } catch (error) {
      setStatusMsg(`Create ToBuy failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTodo = async () => {
    if (!todoForm.title.trim()) return;
    try {
      setBusy(true);
      await createTodo({
        project: todoForm.project ? Number(todoForm.project) : null,
        title: todoForm.title,
        description: todoForm.description,
        priority: todoForm.priority,
        status: todoForm.status,
        due_date: todoForm.due_date,
      });
      setTodoForm((p) => ({ ...p, title: '', description: '' }));
      await loadData();
      setStatusMsg('Todo item created.');
    } catch (error) {
      setStatusMsg(`Create Todo failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const startEditToBuy = (item: ToBuyItemDto) => {
    setEditingToBuyId(item.id);
    setToBuyEditForm({
      project: item.project ? String(item.project) : '',
      name: item.name,
      category: item.category || '',
      estimated_cost: item.estimated_cost || '',
      status: item.status,
    });
  };

  const startEditTodo = (item: TodoItemDto) => {
    setEditingTodoId(item.id);
    setTodoEditForm({
      project: item.project ? String(item.project) : '',
      title: item.title,
      status: item.status,
      due_date: item.due_date || '',
    });
  };

  const saveToBuyEdit = async () => {
    if (!editingToBuyId) return;
    if (!toBuyEditForm.name.trim()) {
      setStatusMsg('ToBuy name is required.');
      return;
    }
    try {
      setBusy(true);
      await updateToBuyItem(editingToBuyId, {
        project: toBuyEditForm.project ? Number(toBuyEditForm.project) : null,
        name: toBuyEditForm.name,
        category: toBuyEditForm.category,
        estimated_cost: toBuyEditForm.estimated_cost.trim().replace(',', '.') || undefined,
        status: toBuyEditForm.status,
      });
      setEditingToBuyId(null);
      await loadData();
      setStatusMsg('ToBuy item updated.');
    } catch (error) {
      setStatusMsg(`Update ToBuy failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const saveTodoEdit = async () => {
    if (!editingTodoId) return;
    if (!todoEditForm.title.trim()) {
      setStatusMsg('Todo title is required.');
      return;
    }
    try {
      setBusy(true);
      await updateTodo(editingTodoId, {
        project: todoEditForm.project ? Number(todoEditForm.project) : null,
        title: todoEditForm.title,
        status: todoEditForm.status,
        due_date: todoEditForm.due_date || undefined,
      });
      setEditingTodoId(null);
      await loadData();
      setStatusMsg('Todo item updated.');
    } catch (error) {
      setStatusMsg(`Update Todo failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteToBuy = async (id: number) => {
    if (!window.confirm('Delete this ToBuy item?')) return;
    try {
      setBusy(true);
      await deleteToBuyItem(id);
      if (editingToBuyId === id) setEditingToBuyId(null);
      await loadData();
      setStatusMsg('ToBuy item deleted.');
    } catch (error) {
      setStatusMsg(`Delete ToBuy failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTodo = async (id: number) => {
    if (!window.confirm('Delete this Todo item?')) return;
    try {
      setBusy(true);
      await deleteTodo(id);
      if (editingTodoId === id) setEditingTodoId(null);
      await loadData();
      setStatusMsg('Todo item deleted.');
    } catch (error) {
      setStatusMsg(`Delete Todo failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">{t.planning}</h2>
          <p className="text-gray-500">Manage ToBuy and Todo with real backend persistence.</p>
        </div>
        <button onClick={loadData} disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60">
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex gap-3">
        <button onClick={() => setTab('tobuy')} className={`px-4 py-2 rounded-xl font-semibold ${tab === 'tobuy' ? 'bg-violet-600 text-white' : theme === 'dark' ? 'bg-slate-800' : 'bg-white border border-gray-100'}`}>
          <span className="inline-flex items-center gap-2"><Boxes size={16} /> ToBuy</span>
        </button>
        <button onClick={() => setTab('todo')} className={`px-4 py-2 rounded-xl font-semibold ${tab === 'todo' ? 'bg-cyan-600 text-white' : theme === 'dark' ? 'bg-slate-800' : 'bg-white border border-gray-100'}`}>
          <span className="inline-flex items-center gap-2"><CheckSquare size={16} /> Todos</span>
        </button>
      </div>

      {tab === 'tobuy' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-lg font-bold">Create ToBuy Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={toBuyForm.project} onChange={(e) => setToBuyForm((p) => ({ ...p, project: e.target.value }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={toBuyForm.name} onChange={(e) => setToBuyForm((p) => ({ ...p, name: e.target.value }))} placeholder="name" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
            <select value={toBuyForm.category} onChange={(e) => setToBuyForm((p) => ({ ...p, category: e.target.value }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="">No category</option>
              {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select value={toBuyForm.priority} onChange={(e) => setToBuyForm((p) => ({ ...p, priority: e.target.value as PlanningPriority }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option>
            </select>
            <select value={toBuyForm.status} onChange={(e) => setToBuyForm((p) => ({ ...p, status: e.target.value as ToBuyStatus }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="IDEA">IDEA</option><option value="RESEARCHING">RESEARCHING</option><option value="PLANNED">PLANNED</option><option value="ORDERED">ORDERED</option>
            </select>
            <input value={toBuyForm.estimated_cost} onChange={(e) => setToBuyForm((p) => ({ ...p, estimated_cost: e.target.value }))} placeholder="estimated cost" type="text" inputMode="decimal" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
            <input value={toBuyForm.target_date} onChange={(e) => setToBuyForm((p) => ({ ...p, target_date: e.target.value }))} type="date" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
            <input value={toBuyForm.notes} onChange={(e) => setToBuyForm((p) => ({ ...p, notes: e.target.value }))} placeholder="notes" className={`px-3 py-2 rounded-lg border md:col-span-2 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
          </div>
          <button onClick={handleCreateToBuy} disabled={busy || !hasToken} className="px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">Create ToBuy</button>

          <div className={`p-3 rounded-xl border grid grid-cols-1 md:grid-cols-6 gap-2 ${theme === 'dark' ? 'bg-slate-900/30 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
            <input
              value={toBuyFilters.q}
              onChange={(e) => setToBuyFilters((p) => ({ ...p, q: e.target.value }))}
              placeholder="Search name/category/notes"
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            />
            <select
              value={toBuyFilters.project}
              onChange={(e) => setToBuyFilters((p) => ({ ...p, project: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              <option value="ALL">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={toBuyFilters.status}
              onChange={(e) => setToBuyFilters((p) => ({ ...p, status: e.target.value as 'ALL' | ToBuyStatus }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              <option value="ALL">All status</option>
              <option value="IDEA">IDEA</option>
              <option value="RESEARCHING">RESEARCHING</option>
              <option value="PLANNED">PLANNED</option>
              <option value="ORDERED">ORDERED</option>
              <option value="DELIVERED">DELIVERED</option>
              <option value="INSTALLED">INSTALLED</option>
              <option value="RETURNED">RETURNED</option>
            </select>
            <select
              value={toBuyFilters.category}
              onChange={(e) => setToBuyFilters((p) => ({ ...p, category: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              <option value="ALL">All categories</option>
              {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <input
              type="date"
              value={toBuyFilters.from}
              onChange={(e) => setToBuyFilters((p) => ({ ...p, from: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={toBuyFilters.to}
                onChange={(e) => setToBuyFilters((p) => ({ ...p, to: e.target.value }))}
                className={`px-3 py-2 rounded-lg border text-sm w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
              />
              <button
                onClick={() => setToBuyFilters({ q: '', project: 'ALL', status: 'ALL', category: 'ALL', from: '', to: '' })}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <div className="text-xs text-gray-500 mb-2">
              Showing {pagedToBuyItems.length} / {filteredToBuyItems.length} filtered (total {toBuyItems.length})
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2">ID</th><th>Name</th><th>Category</th><th>Estimated</th><th>Status</th><th>Project</th><th>Target</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedToBuyItems.map((x) => (
                  <tr key={x.id} className="border-t border-gray-100 dark:border-slate-700">
                    <td className="py-2">{x.id}</td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <input
                          value={toBuyEditForm.name}
                          onChange={(e) => setToBuyEditForm((p) => ({ ...p, name: e.target.value }))}
                          className={`px-2 py-1 rounded border w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        />
                      ) : x.name}
                    </td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <select
                          value={toBuyEditForm.category}
                          onChange={(e) => setToBuyEditForm((p) => ({ ...p, category: e.target.value }))}
                          className={`px-2 py-1 rounded border w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        >
                          <option value="">No category</option>
                          {categoryOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      ) : (x.category || '-')}
                    </td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <input
                          value={toBuyEditForm.estimated_cost}
                          onChange={(e) => setToBuyEditForm((p) => ({ ...p, estimated_cost: e.target.value }))}
                          type="text"
                          inputMode="decimal"
                          className={`px-2 py-1 rounded border w-28 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        />
                      ) : (x.estimated_cost ? `${x.estimated_cost} FCFA` : '-')}
                    </td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <select
                          value={toBuyEditForm.status}
                          onChange={(e) => setToBuyEditForm((p) => ({ ...p, status: e.target.value as ToBuyStatus }))}
                          className={`px-2 py-1 rounded border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        >
                          <option value="IDEA">IDEA</option>
                          <option value="RESEARCHING">RESEARCHING</option>
                          <option value="PLANNED">PLANNED</option>
                          <option value="ORDERED">ORDERED</option>
                          <option value="DELIVERED">DELIVERED</option>
                          <option value="INSTALLED">INSTALLED</option>
                          <option value="RETURNED">RETURNED</option>
                        </select>
                      ) : x.status}
                    </td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <select
                          value={toBuyEditForm.project}
                          onChange={(e) => setToBuyEditForm((p) => ({ ...p, project: e.target.value }))}
                          className={`px-2 py-1 rounded border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        >
                          <option value="">No project</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : getProjectName(x.project)}
                    </td>
                    <td>{x.target_date ?? '-'}</td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <div className="flex gap-2">
                          <button onClick={saveToBuyEdit} disabled={busy} className="p-1 rounded bg-emerald-600 text-white"><Save size={14} /></button>
                          <button onClick={() => setEditingToBuyId(null)} disabled={busy} className="p-1 rounded bg-gray-500 text-white"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => startEditToBuy(x)} disabled={busy} className="p-1 rounded bg-violet-600 text-white"><Edit3 size={14} /></button>
                          <button onClick={() => handleDeleteToBuy(x.id)} disabled={busy} className="p-1 rounded bg-red-600 text-white"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <span>Page {toBuyPage}/{toBuyTotalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setToBuyPage((p) => Math.max(1, p - 1))}
                  disabled={toBuyPage <= 1}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setToBuyPage((p) => Math.min(toBuyTotalPages, p + 1))}
                  disabled={toBuyPage >= toBuyTotalPages}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'todo' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-lg font-bold">Create Todo Item</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={todoForm.project} onChange={(e) => setTodoForm((p) => ({ ...p, project: e.target.value }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input value={todoForm.title} onChange={(e) => setTodoForm((p) => ({ ...p, title: e.target.value }))} placeholder="title" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
            <input value={todoForm.description} onChange={(e) => setTodoForm((p) => ({ ...p, description: e.target.value }))} placeholder="description" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
            <select value={todoForm.priority} onChange={(e) => setTodoForm((p) => ({ ...p, priority: e.target.value as PlanningPriority }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option>
            </select>
            <select value={todoForm.status} onChange={(e) => setTodoForm((p) => ({ ...p, status: e.target.value as TodoStatus }))} className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}>
              <option value="NOT_STARTED">NOT_STARTED</option><option value="IN_PROGRESS">IN_PROGRESS</option><option value="DONE">DONE</option><option value="BLOCKED">BLOCKED</option>
            </select>
            <input value={todoForm.due_date} onChange={(e) => setTodoForm((p) => ({ ...p, due_date: e.target.value }))} type="date" className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`} />
          </div>
          <button onClick={handleCreateTodo} disabled={busy || !hasToken} className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-60">Create Todo</button>

          <div className={`p-3 rounded-xl border grid grid-cols-1 md:grid-cols-5 gap-2 ${theme === 'dark' ? 'bg-slate-900/30 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
            <input
              value={todoFilters.q}
              onChange={(e) => setTodoFilters((p) => ({ ...p, q: e.target.value }))}
              placeholder="Search title/description"
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            />
            <select
              value={todoFilters.project}
              onChange={(e) => setTodoFilters((p) => ({ ...p, project: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              <option value="ALL">All projects</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={todoFilters.status}
              onChange={(e) => setTodoFilters((p) => ({ ...p, status: e.target.value as 'ALL' | TodoStatus }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              <option value="ALL">All status</option>
              <option value="NOT_STARTED">NOT_STARTED</option>
              <option value="IN_PROGRESS">IN_PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
            <input
              type="date"
              value={todoFilters.from}
              onChange={(e) => setTodoFilters((p) => ({ ...p, from: e.target.value }))}
              className={`px-3 py-2 rounded-lg border text-sm ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={todoFilters.to}
                onChange={(e) => setTodoFilters((p) => ({ ...p, to: e.target.value }))}
                className={`px-3 py-2 rounded-lg border text-sm w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
              />
              <button
                onClick={() => setTodoFilters({ q: '', project: 'ALL', status: 'ALL', from: '', to: '' })}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <div className="text-xs text-gray-500 mb-2">
              Showing {pagedTodoItems.length} / {filteredTodoItems.length} filtered (total {todoItems.length})
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2">ID</th><th>Title</th><th>Status</th><th>Project</th><th>Due</th><th>Actions</th></tr></thead>
              <tbody>
                {pagedTodoItems.map((x) => (
                  <tr key={x.id} className="border-t border-gray-100 dark:border-slate-700">
                    <td className="py-2">{x.id}</td>
                    <td>
                      {editingTodoId === x.id ? (
                        <input
                          value={todoEditForm.title}
                          onChange={(e) => setTodoEditForm((p) => ({ ...p, title: e.target.value }))}
                          className={`px-2 py-1 rounded border w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        />
                      ) : x.title}
                    </td>
                    <td>
                      {editingTodoId === x.id ? (
                        <select
                          value={todoEditForm.status}
                          onChange={(e) => setTodoEditForm((p) => ({ ...p, status: e.target.value as TodoStatus }))}
                          className={`px-2 py-1 rounded border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        >
                          <option value="NOT_STARTED">NOT_STARTED</option>
                          <option value="IN_PROGRESS">IN_PROGRESS</option>
                          <option value="DONE">DONE</option>
                          <option value="BLOCKED">BLOCKED</option>
                        </select>
                      ) : x.status}
                    </td>
                    <td>
                      {editingTodoId === x.id ? (
                        <select
                          value={todoEditForm.project}
                          onChange={(e) => setTodoEditForm((p) => ({ ...p, project: e.target.value }))}
                          className={`px-2 py-1 rounded border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        >
                          <option value="">No project</option>
                          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      ) : getProjectName(x.project)}
                    </td>
                    <td>
                      {editingTodoId === x.id ? (
                        <input
                          value={todoEditForm.due_date}
                          onChange={(e) => setTodoEditForm((p) => ({ ...p, due_date: e.target.value }))}
                          type="date"
                          className={`px-2 py-1 rounded border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                        />
                      ) : (x.due_date ?? '-')}
                    </td>
                    <td>
                      {editingTodoId === x.id ? (
                        <div className="flex gap-2">
                          <button onClick={saveTodoEdit} disabled={busy} className="p-1 rounded bg-emerald-600 text-white"><Save size={14} /></button>
                          <button onClick={() => setEditingTodoId(null)} disabled={busy} className="p-1 rounded bg-gray-500 text-white"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => startEditTodo(x)} disabled={busy} className="p-1 rounded bg-cyan-600 text-white"><Edit3 size={14} /></button>
                          <button onClick={() => handleDeleteTodo(x.id)} disabled={busy} className="p-1 rounded bg-red-600 text-white"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
              <span>Page {todoPage}/{todoTotalPages}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setTodoPage((p) => Math.max(1, p - 1))}
                  disabled={todoPage <= 1}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  onClick={() => setTodoPage((p) => Math.min(todoTotalPages, p + 1))}
                  disabled={todoPage >= todoTotalPages}
                  className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`text-sm p-3 rounded-xl ${statusMsg.toLowerCase().includes('failed') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export default PlanningSection;
