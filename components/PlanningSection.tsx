import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import { Boxes, CalendarDays, CheckSquare, Edit3, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { createReservation, createTimeBlock, createToBuyItem, createTodo, deleteTimeBlock, deleteToBuyItem, deleteTodo, listCategories, listReservations, listTimeBlocks, listToBuyItems, listTodos, releaseReservation, updateTimeBlock, updateToBuyItem, updateTodo, type CategoryDto, type PlanningPriority, type TimeBlockDto, type ToBuyReservationDto, type ToBuyStatus, type TodoStatus, type ToBuyItemDto, type TodoItemDto } from '../data/api/planning';
import { listBudgetPeriods, type BudgetPeriodDto } from '../data/api/budgets';
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

const parseIsoDateUtc = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatIsoDateUtc = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfWeekIso = (isoDate: string) => {
  const date = parseIsoDateUtc(isoDate);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return formatIsoDateUtc(date);
};

const addDaysIso = (isoDate: string, days: number) => {
  const date = parseIsoDateUtc(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
};

const toApiDateTime = (isoDate: string, hhmm: string) => {
  const dt = new Date(`${isoDate}T${hhmm}:00`);
  return dt.toISOString();
};

const formatDayLabel = (isoDate: string) =>
  parseIsoDateUtc(isoDate).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const PlanningSection: React.FC = () => {
  const pageSize = 10;
  const { language, theme } = useApp();
  const t = translations[language];

  const [tab, setTab] = useState<'tobuy' | 'todo' | 'timeblocks'>('tobuy');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [toBuyItems, setToBuyItems] = useState<ToBuyItemDto[]>([]);
  const [todoItems, setTodoItems] = useState<TodoItemDto[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlockDto[]>([]);
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriodDto[]>([]);
  const [reservations, setReservations] = useState<ToBuyReservationDto[]>([]);
  const [selectedReservePeriodId, setSelectedReservePeriodId] = useState('');
  const [weekAnchorDate, setWeekAnchorDate] = useState(new Date().toISOString().slice(0, 10));
  const [draggingTimeBlockId, setDraggingTimeBlockId] = useState<number | null>(null);
  const [editingTimeBlockId, setEditingTimeBlockId] = useState<number | null>(null);
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
  const [timeBlockForm, setTimeBlockForm] = useState({
    project: '',
    todo_item: '',
    title: '',
    date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    notes: '',
  });
  const [timeBlockEditForm, setTimeBlockEditForm] = useState({
    project: '',
    todo_item: '',
    title: '',
    date: '',
    start_time: '',
    end_time: '',
    notes: '',
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
  const activeReservationByItemId = useMemo(() => {
    const map = new Map<number, ToBuyReservationDto>();
    reservations.forEach((reservation) => {
      if (reservation.status === 'ACTIVE' && !map.has(reservation.to_buy_item)) {
        map.set(reservation.to_buy_item, reservation);
      }
    });
    return map;
  }, [reservations]);
  const weekStart = useMemo(() => startOfWeekIso(weekAnchorDate), [weekAnchorDate]);
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i)),
    [weekStart]
  );
  const timeBlocksByDay = useMemo(() => {
    const map = new Map<string, TimeBlockDto[]>();
    weekDays.forEach((day) => map.set(day, []));
    timeBlocks.forEach((block) => {
      const day = block.start_at.slice(0, 10);
      if (!map.has(day)) return;
      map.get(day)!.push(block);
    });
    map.forEach((blocks) => {
      blocks.sort((a, b) => a.start_at.localeCompare(b.start_at));
    });
    return map;
  }, [timeBlocks, weekDays]);

  const loadData = async () => {
    if (!hasToken) {
      setStatusMsg('Connect backend from Settings first.');
      return;
    }

    try {
      setBusy(true);
      const weekFrom = `${weekStart}T00:00:00Z`;
      const weekTo = `${addDaysIso(weekStart, 6)}T23:59:59Z`;
      const [p, tb, td, cats, periods, activeReservations, blocks] = await Promise.all([
        listProjects(),
        listToBuyItems(),
        listTodos(),
        listCategories(),
        listBudgetPeriods({ status: 'OPEN' }),
        listReservations({ status: 'ACTIVE' }),
        listTimeBlocks({ from: weekFrom, to: weekTo }),
      ]);
      setProjects(p.results.map((x) => ({ id: x.id, name: x.name })));
      setCategories(cats.results.filter((x) => x.type === 'EXPENSE'));
      setToBuyItems(tb.results);
      setTodoItems(td.results);
      setBudgetPeriods(periods.results);
      setReservations(activeReservations.results);
      setTimeBlocks(blocks.results);
      if (!selectedReservePeriodId && periods.results.length > 0) {
        setSelectedReservePeriodId(String(periods.results[0].id));
      }
      setStatusMsg(null);
    } catch (error) {
      setStatusMsg(`Load failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [weekStart]);
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
  useEffect(() => {
    if (!selectedReservePeriodId && budgetPeriods.length > 0) {
      setSelectedReservePeriodId(String(budgetPeriods[0].id));
    }
  }, [selectedReservePeriodId, budgetPeriods]);

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return '-';
    return projects.find((p) => p.id === projectId)?.name || `#${projectId}`;
  };

  const findConflictingTimeBlock = async (startAt: string, endAt: string, excludeId?: number) => {
    const day = startAt.slice(0, 10);
    const result = await listTimeBlocks({
      from: `${day}T00:00:00Z`,
      to: `${day}T23:59:59Z`,
    });
    const candidateStart = new Date(startAt).getTime();
    const candidateEnd = new Date(endAt).getTime();
    return (
      result.results.find((x) => {
        if (excludeId && x.id === excludeId) return false;
        const existingStart = new Date(x.start_at).getTime();
        const existingEnd = new Date(x.end_at).getTime();
        return candidateStart < existingEnd && existingStart < candidateEnd;
      }) || null
    );
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

  const handleCreateReservation = async (item: ToBuyItemDto) => {
    if (!selectedReservePeriodId) {
      setStatusMsg('Select an open budget period first.');
      return;
    }
    if (activeReservationByItemId.has(item.id)) {
      setStatusMsg('This ToBuy item already has an active reservation.');
      return;
    }

    const initialAmount = item.estimated_cost || '';
    const input = window.prompt(`Reservation amount for "${item.name}"`, initialAmount);
    if (input === null) return;

    const normalized = input.trim().replace(',', '.');
    const numeric = Number(normalized);
    if (!normalized || Number.isNaN(numeric) || numeric <= 0) {
      setStatusMsg('Reservation amount must be a positive number.');
      return;
    }

    try {
      setBusy(true);
      await createReservation({
        to_buy_item: item.id,
        budget_period: Number(selectedReservePeriodId),
        amount: normalized,
        note: `Reserved from Planning UI (${item.name})`,
      });
      await loadData();
      setStatusMsg(`Reserved ${normalized} for "${item.name}".`);
    } catch (error) {
      setStatusMsg(`Reserve failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleReleaseReservation = async (item: ToBuyItemDto) => {
    const reservation = activeReservationByItemId.get(item.id);
    if (!reservation) {
      setStatusMsg('No active reservation found for this item.');
      return;
    }
    if (!window.confirm(`Release reservation (${reservation.amount}) for "${item.name}"?`)) return;

    try {
      setBusy(true);
      await releaseReservation(reservation.id);
      await loadData();
      setStatusMsg(`Reservation released for "${item.name}".`);
    } catch (error) {
      setStatusMsg(`Release failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTimeBlock = async () => {
    if (!timeBlockForm.title.trim()) {
      setStatusMsg('Time block title is required.');
      return;
    }

    const startAt = toApiDateTime(timeBlockForm.date, timeBlockForm.start_time);
    const endAt = toApiDateTime(timeBlockForm.date, timeBlockForm.end_time);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setStatusMsg('End time must be after start time.');
      return;
    }

    try {
      setBusy(true);
      const conflict = await findConflictingTimeBlock(startAt, endAt);
      if (conflict) {
        setStatusMsg(`Conflict: overlaps with "${conflict.title}" (${conflict.start_at.slice(11, 16)}-${conflict.end_at.slice(11, 16)}).`);
        return;
      }
      await createTimeBlock({
        project: timeBlockForm.project ? Number(timeBlockForm.project) : null,
        todo_item: timeBlockForm.todo_item ? Number(timeBlockForm.todo_item) : null,
        title: timeBlockForm.title.trim(),
        start_at: startAt,
        end_at: endAt,
        notes: timeBlockForm.notes.trim() || undefined,
      });
      setTimeBlockForm((p) => ({ ...p, title: '', notes: '' }));
      await loadData();
      setStatusMsg('Time block created.');
    } catch (error) {
      setStatusMsg(`Create time block failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTimeBlock = async (id: number) => {
    if (!window.confirm('Delete this time block?')) return;
    try {
      setBusy(true);
      await deleteTimeBlock(id);
      await loadData();
      setStatusMsg('Time block deleted.');
    } catch (error) {
      setStatusMsg(`Delete time block failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const startEditTimeBlock = (block: TimeBlockDto) => {
    setEditingTimeBlockId(block.id);
    setTimeBlockEditForm({
      project: block.project ? String(block.project) : '',
      todo_item: block.todo_item ? String(block.todo_item) : '',
      title: block.title,
      date: block.start_at.slice(0, 10),
      start_time: block.start_at.slice(11, 16),
      end_time: block.end_at.slice(11, 16),
      notes: block.notes || '',
    });
  };

  const handleSaveTimeBlockEdit = async () => {
    if (!editingTimeBlockId) return;
    if (!timeBlockEditForm.title.trim()) {
      setStatusMsg('Time block title is required.');
      return;
    }
    const startAt = toApiDateTime(timeBlockEditForm.date, timeBlockEditForm.start_time);
    const endAt = toApiDateTime(timeBlockEditForm.date, timeBlockEditForm.end_time);
    if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
      setStatusMsg('End time must be after start time.');
      return;
    }

    try {
      setBusy(true);
      const conflict = await findConflictingTimeBlock(startAt, endAt, editingTimeBlockId);
      if (conflict) {
        setStatusMsg(`Conflict: overlaps with "${conflict.title}" (${conflict.start_at.slice(11, 16)}-${conflict.end_at.slice(11, 16)}).`);
        return;
      }
      await updateTimeBlock(editingTimeBlockId, {
        project: timeBlockEditForm.project ? Number(timeBlockEditForm.project) : null,
        todo_item: timeBlockEditForm.todo_item ? Number(timeBlockEditForm.todo_item) : null,
        title: timeBlockEditForm.title.trim(),
        start_at: startAt,
        end_at: endAt,
        notes: timeBlockEditForm.notes.trim() || '',
      });
      setEditingTimeBlockId(null);
      await loadData();
      setStatusMsg('Time block updated.');
    } catch (error) {
      setStatusMsg(`Update time block failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDropTimeBlock = async (targetDay: string) => {
    if (!draggingTimeBlockId) return;
    const block = timeBlocks.find((x) => x.id === draggingTimeBlockId);
    if (!block) {
      setDraggingTimeBlockId(null);
      return;
    }

    const currentDay = block.start_at.slice(0, 10);
    if (currentDay === targetDay) {
      setDraggingTimeBlockId(null);
      return;
    }

    const startTime = block.start_at.slice(11, 16);
    const endTime = block.end_at.slice(11, 16);
    const nextStartAt = toApiDateTime(targetDay, startTime);
    const nextEndAt = toApiDateTime(targetDay, endTime);

    try {
      setBusy(true);
      const conflict = await findConflictingTimeBlock(nextStartAt, nextEndAt, block.id);
      if (conflict) {
        setStatusMsg(`Move blocked: overlaps with "${conflict.title}" (${conflict.start_at.slice(11, 16)}-${conflict.end_at.slice(11, 16)}).`);
        return;
      }
      await updateTimeBlock(block.id, { start_at: nextStartAt, end_at: nextEndAt });
      await loadData();
      setStatusMsg(`Moved "${block.title}" to ${targetDay}.`);
    } catch (error) {
      setStatusMsg(`Move failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setDraggingTimeBlockId(null);
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
        <button onClick={() => setTab('timeblocks')} className={`px-4 py-2 rounded-xl font-semibold ${tab === 'timeblocks' ? 'bg-emerald-600 text-white' : theme === 'dark' ? 'bg-slate-800' : 'bg-white border border-gray-100'}`}>
          <span className="inline-flex items-center gap-2"><CalendarDays size={16} /> Time Blocks</span>
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

          <div className={`p-3 rounded-xl border flex flex-col md:flex-row md:items-center gap-3 ${theme === 'dark' ? 'bg-slate-900/30 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
            <span className="text-sm font-semibold">Reservation period</span>
            <select
              value={selectedReservePeriodId}
              onChange={(e) => setSelectedReservePeriodId(e.target.value)}
              className={`px-3 py-2 rounded-lg border text-sm min-w-[280px] ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
            >
              {budgetPeriods.length === 0 && <option value="">No open budget period</option>}
              {budgetPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  #{period.id} {period.period_start} to {period.period_end}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              Reserve/Unreserve actions use this selected open period.
            </span>
          </div>

          <div className="overflow-auto">
            <div className="text-xs text-gray-500 mb-2">
              Showing {pagedToBuyItems.length} / {filteredToBuyItems.length} filtered (total {toBuyItems.length})
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2">ID</th><th>Name</th><th>Category</th><th>Estimated</th><th>Status</th><th>Project</th><th>Target</th><th>Reservation</th><th>Actions</th></tr></thead>
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
                      {(() => {
                        const activeReservation = activeReservationByItemId.get(x.id);
                        if (!activeReservation) return <span className="text-gray-500">Not reserved</span>;
                        return (
                          <span className="text-emerald-700 font-semibold">
                            Active ({activeReservation.amount})
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      {editingToBuyId === x.id ? (
                        <div className="flex gap-2">
                          <button onClick={saveToBuyEdit} disabled={busy} className="p-1 rounded bg-emerald-600 text-white"><Save size={14} /></button>
                          <button onClick={() => setEditingToBuyId(null)} disabled={busy} className="p-1 rounded bg-gray-500 text-white"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => startEditToBuy(x)} disabled={busy} className="p-1 rounded bg-violet-600 text-white"><Edit3 size={14} /></button>
                          {activeReservationByItemId.has(x.id) ? (
                            <button
                              onClick={() => handleReleaseReservation(x)}
                              disabled={busy}
                              className="px-2 py-1 rounded bg-amber-600 text-white text-xs font-semibold"
                            >
                              Unreserve
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCreateReservation(x)}
                              disabled={busy || !hasToken || !selectedReservePeriodId}
                              className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
                            >
                              Reserve
                            </button>
                          )}
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

      {tab === 'timeblocks' && (
        <div className={`p-6 rounded-2xl border space-y-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <h3 className="text-lg font-bold">Create Time Block</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select
              value={timeBlockForm.project}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, project: e.target.value }))}
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select
              value={timeBlockForm.todo_item}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, todo_item: e.target.value }))}
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            >
              <option value="">No linked todo</option>
              {todoItems.map((item) => <option key={item.id} value={item.id}>#{item.id} {item.title}</option>)}
            </select>
            <input
              value={timeBlockForm.title}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="title"
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            />
            <input
              value={timeBlockForm.date}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, date: e.target.value }))}
              type="date"
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            />
            <input
              value={timeBlockForm.start_time}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, start_time: e.target.value }))}
              type="time"
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            />
            <input
              value={timeBlockForm.end_time}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, end_time: e.target.value }))}
              type="time"
              className={`px-3 py-2 rounded-lg border ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
            />
            <textarea
              value={timeBlockForm.notes}
              onChange={(e) => setTimeBlockForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="notes"
              rows={2}
              className={`px-3 py-2 rounded-lg border md:col-span-4 ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-gray-50 border-gray-100 text-gray-900'}`}
            />
          </div>
          <button onClick={handleCreateTimeBlock} disabled={busy || !hasToken} className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60">Create Time Block</button>

          <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${theme === 'dark' ? 'bg-slate-900/30 border-slate-700' : 'bg-gray-50 border-gray-100'}`}>
            <div className="text-sm font-semibold">
              Week: {weekDays[0]} to {weekDays[6]}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setWeekAnchorDate(addDaysIso(weekStart, -7))}
                className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 text-sm"
              >
                Prev Week
              </button>
              <button
                onClick={() => setWeekAnchorDate(new Date().toISOString().slice(0, 10))}
                className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 text-sm"
              >
                This Week
              </button>
              <button
                onClick={() => setWeekAnchorDate(addDaysIso(weekStart, 7))}
                className="px-3 py-1 rounded border border-gray-200 dark:border-slate-600 text-sm"
              >
                Next Week
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
            {weekDays.map((day) => {
              const blocks = timeBlocksByDay.get(day) || [];
              return (
                <div
                  key={day}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleDropTimeBlock(day);
                  }}
                  className={`p-3 rounded-xl border min-h-44 transition-colors ${draggingTimeBlockId ? 'border-dashed' : ''} ${theme === 'dark' ? 'bg-slate-900/30 border-slate-700' : 'bg-gray-50 border-gray-200'}`}
                >
                  <div className="font-semibold text-sm mb-2">
                    {formatDayLabel(day)}
                    <span className="ml-2 text-xs text-gray-500">{day}</span>
                  </div>
                  <div className="space-y-2">
                    {blocks.length === 0 && <div className="text-xs text-gray-500">No blocks</div>}
                    {blocks.map((block) => {
                      const startLabel = block.start_at.slice(11, 16);
                      const endLabel = block.end_at.slice(11, 16);
                      return (
                        <div
                          key={block.id}
                          draggable={editingTimeBlockId !== block.id}
                          onDragStart={() => setDraggingTimeBlockId(block.id)}
                          onDragEnd={() => setDraggingTimeBlockId(null)}
                          className={`rounded-lg border p-2 cursor-move shadow-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-600' : 'bg-white border-gray-300'}`}
                        >
                          {editingTimeBlockId === block.id ? (
                            <div className="space-y-2">
                              <input
                                value={timeBlockEditForm.title}
                                onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, title: e.target.value }))}
                                className={`px-2 py-1 rounded border w-full text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                              />
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={timeBlockEditForm.date}
                                  onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, date: e.target.value }))}
                                  type="date"
                                  className={`px-2 py-1 rounded border text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                                />
                                <select
                                  value={timeBlockEditForm.project}
                                  onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, project: e.target.value }))}
                                  className={`px-2 py-1 rounded border text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                                >
                                  <option value="">No project</option>
                                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input
                                  value={timeBlockEditForm.start_time}
                                  onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, start_time: e.target.value }))}
                                  type="time"
                                  className={`px-2 py-1 rounded border text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                                />
                                <input
                                  value={timeBlockEditForm.end_time}
                                  onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, end_time: e.target.value }))}
                                  type="time"
                                  className={`px-2 py-1 rounded border text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                                />
                              </div>
                              <select
                                value={timeBlockEditForm.todo_item}
                                onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, todo_item: e.target.value }))}
                                className={`px-2 py-1 rounded border text-xs w-full ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-white border-gray-200'}`}
                              >
                                <option value="">No linked todo</option>
                                {todoItems.map((item) => <option key={item.id} value={item.id}>#{item.id} {item.title}</option>)}
                              </select>
                              <textarea
                                value={timeBlockEditForm.notes}
                                onChange={(e) => setTimeBlockEditForm((p) => ({ ...p, notes: e.target.value }))}
                                placeholder="notes"
                                rows={2}
                                className={`px-2 py-1 rounded border w-full text-xs ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-100' : 'bg-white border-gray-300 text-gray-900'}`}
                              />
                              <div className="flex gap-2">
                                <button onClick={handleSaveTimeBlockEdit} disabled={busy} className="p-1 rounded bg-emerald-600 text-white"><Save size={12} /></button>
                                <button onClick={() => setEditingTimeBlockId(null)} disabled={busy} className="p-1 rounded bg-gray-500 text-white"><X size={12} /></button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold">{block.title}</div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300">
                                    {startLabel} - {endLabel} ({block.duration_minutes}m)
                                  </div>
                                  <div className="text-xs text-gray-600 dark:text-gray-300">
                                    {getProjectName(block.project)}{block.todo_item ? ` | Todo #${block.todo_item}` : ''}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => startEditTimeBlock(block)} disabled={busy} className="p-1 rounded bg-cyan-600 text-white">
                                    <Edit3 size={12} />
                                  </button>
                                  <button onClick={() => handleDeleteTimeBlock(block.id)} disabled={busy} className="p-1 rounded bg-red-600 text-white">
                                    <Trash2 size={12} />
                                  </button>
                                </div>
                              </div>
                              {block.notes && (
                                <div className={`text-xs mt-2 p-2 rounded border whitespace-pre-wrap ${theme === 'dark' ? 'text-slate-100 bg-slate-700 border-slate-600' : 'text-gray-900 bg-amber-50 border-amber-200'}`}>
                                  {block.notes}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {statusMsg && (
        <div className={`text-sm p-3 rounded-xl ${(statusMsg.toLowerCase().includes('failed') || statusMsg.toLowerCase().includes('conflict') || statusMsg.toLowerCase().includes('blocked')) ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {statusMsg}
        </div>
      )}
    </div>
  );
};

export default PlanningSection;
