import React, { useEffect, useState } from 'react';
import { useApp } from '../AppContext';
import { translations } from '../i18n';
import { Plus, Trash2, Edit3, CheckCircle, Clock, ListTodo, Circle, PlayCircle } from 'lucide-react';
import { Project, Priority, Status, Task, type ProjectSection } from '../types';
import { createProject, deleteProject, listProjects, updateProject, type CreateProjectInput, type ProjectDto, type ProjectSectionDto, type ProjectStatus, type ProjectTaskDto } from '../data/api/projects';
import { deleteToBuyItem, deleteTodo, listToBuyItems, listTodos, markToBuyRecorded, updateToBuyItem, updateTodo, type ToBuyItemDto, type TodoItemDto } from '../data/api/planning';

const normalizeProjectStatus = (status: unknown): Status => {
  if (status === Status.IN_PROGRESS) return Status.IN_PROGRESS;
  if (status === Status.COMPLETED) return Status.COMPLETED;
  if (status === Status.ON_HOLD) return Status.ON_HOLD;
  return Status.NOT_STARTED;
};

const normalizeTask = (task: unknown): Task | null => {
  if (!task || typeof task !== 'object') return null;
  const input = task as { id?: unknown; title?: unknown; status?: unknown };
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return null;
  return {
    id: String(input.id ?? Date.now()),
    title,
    status: normalizeProjectStatus(input.status),
  };
};

const normalizeSection = (section: unknown): ProjectSection | null => {
  if (!section || typeof section !== 'object') return null;
  const input = section as { id?: unknown; name?: unknown; checklist?: unknown };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;
  const checklistRaw = Array.isArray(input.checklist) ? input.checklist : [];
  const checklist = checklistRaw.map(normalizeTask).filter((task): task is Task => !!task);
  return {
    id: String(input.id ?? Date.now()),
    name,
    checklist,
  };
};

const normalizeSections = (dto: ProjectDto): ProjectSection[] => {
  const fromSections = Array.isArray(dto.sections)
    ? dto.sections.map(normalizeSection).filter((section): section is ProjectSection => !!section)
    : [];
  if (fromSections.length > 0) return fromSections;
  const fallbackTasks = Array.isArray(dto.tasks)
    ? dto.tasks.map(normalizeTask).filter((task): task is Task => !!task)
    : [];
  if (fallbackTasks.length === 0) return [];
  return [{ id: 'legacy-general', name: 'General', checklist: fallbackTasks }];
};

const toApiTaskStatus = (status: Status): ProjectStatus => status as unknown as ProjectStatus;

const mapDtoToProject = (dto: ProjectDto): Project => ({
  id: String(dto.id),
  createdAt: new Date(dto.created_at).getTime(),
  name: dto.name,
  description: dto.description || '',
  status: dto.status as Status,
  priority: dto.priority as Priority,
  deadline: dto.deadline || '',
  tasks: Array.isArray(dto.tasks) ? dto.tasks.map((t) => ({ id: String(t.id), title: t.title, status: normalizeProjectStatus(t.status) })) : [],
  sections: normalizeSections(dto),
});

const toPayload = (p: Partial<Project>): CreateProjectInput => ({
  name: p.name || '',
  description: p.description || '',
  status: (p.status || Status.NOT_STARTED) as CreateProjectInput['status'],
  priority: (p.priority || Priority.MEDIUM) as CreateProjectInput['priority'],
  deadline: p.deadline || null,
  tasks: (p.tasks || []).map((t) => ({ id: String(t.id), title: t.title, status: toApiTaskStatus(t.status) as ProjectTaskDto['status'] })),
  sections: (p.sections || []).map((section) => ({
    id: String(section.id),
    name: section.name,
    checklist: (section.checklist || []).map((task) => ({
      id: String(task.id),
      title: task.title,
      status: toApiTaskStatus(task.status) as ProjectSectionDto['checklist'][number]['status'],
    })),
  })),
});

const ProjectsSection: React.FC = () => {
  const { projects, setProjects, language, theme } = useApp();
  const t = translations[language];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [backendConnected, setBackendConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [linkedToBuyByProject, setLinkedToBuyByProject] = useState<Record<number, ToBuyItemDto[]>>({});
  const [linkedTodoByProject, setLinkedTodoByProject] = useState<Record<number, TodoItemDto[]>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Project>>({
    name: '',
    description: '',
    priority: Priority.MEDIUM,
    status: Status.NOT_STARTED,
    deadline: '',
    tasks: [],
    sections: [],
  });

  const fetchProjects = async () => {
    const token = localStorage.getItem('zenlife_access_token');
    if (!token) {
      setBackendConnected(false);
      setLinkedToBuyByProject({});
      setLinkedTodoByProject({});
      return;
    }

    try {
      setSyncing(true);
      const [projectsResp, toBuyResp, todoResp] = await Promise.all([listProjects(), listToBuyItems(), listTodos()]);
      setProjects(projectsResp.results.map(mapDtoToProject));

      const toBuyMap: Record<number, ToBuyItemDto[]> = {};
      toBuyResp.results.forEach((item) => {
        if (!item.project) return;
        if (!toBuyMap[item.project]) toBuyMap[item.project] = [];
        toBuyMap[item.project].push(item);
      });
      setLinkedToBuyByProject(toBuyMap);

      const todoMap: Record<number, TodoItemDto[]> = {};
      todoResp.results.forEach((item) => {
        if (!item.project) return;
        if (!todoMap[item.project]) todoMap[item.project] = [];
        todoMap[item.project].push(item);
      });
      setLinkedTodoByProject(todoMap);
      setBackendConnected(true);
      setApiError(null);
    } catch {
      setBackendConnected(false);
      setApiError('API projects unavailable, local mode active.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
    setFormData({ name: '', description: '', priority: Priority.MEDIUM, status: Status.NOT_STARTED, deadline: '', tasks: [], sections: [] });
    setNewTaskTitle('');
  };

  const openEdit = (p: Project) => {
    setEditingProject(p);
    setFormData(p);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) return;

    const token = localStorage.getItem('zenlife_access_token');
    const payload = toPayload(formData);

    if (token) {
      try {
        setSyncing(true);
        if (editingProject) {
          await updateProject(Number(editingProject.id), payload);
        } else {
          await createProject(payload);
        }
        await fetchProjects();
        closeModal();
        return;
      } catch {
        setApiError('Project sync failed, data saved locally.');
      } finally {
        setSyncing(false);
      }
    }

    if (editingProject) {
      setProjects((prev) => prev.map((p) => (p.id === editingProject.id ? ({ ...p, ...formData } as Project) : p)));
    } else {
      const newProject: Project = {
        id: Date.now().toString(),
        createdAt: Date.now(),
        name: formData.name!,
        description: formData.description || '',
        status: formData.status || Status.NOT_STARTED,
        priority: formData.priority || Priority.MEDIUM,
        deadline: formData.deadline || new Date().toISOString().split('T')[0],
        tasks: formData.tasks || [],
        sections: formData.sections || [],
      };
      setProjects((prev) => [newProject, ...prev]);
    }

    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t.confirmDelete)) return;

    const token = localStorage.getItem('zenlife_access_token');
    if (token) {
      try {
        setSyncing(true);
        await deleteProject(Number(id));
        await fetchProjects();
        return;
      } catch {
        setApiError('Delete failed on backend, removed locally only.');
      } finally {
        setSyncing(false);
      }
    }

    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const addTask = () => {
    if (!newTaskTitle) return;
    const newTask: Task = { id: Date.now().toString(), title: newTaskTitle, status: Status.NOT_STARTED };
    setFormData((prev) => ({ ...prev, tasks: [...(prev.tasks || []), newTask] }));
    setNewTaskTitle('');
  };

  const handleUpdateLinkedTodoStatus = async (id: number, status: 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED') => {
    try {
      setSyncing(true);
      await updateTodo(id, { status });
      await fetchProjects();
    } catch {
      setApiError('Failed to update linked Todo.');
    } finally {
      setSyncing(false);
    }
  };

  const handleUpdateLinkedToBuyStatus = async (id: number, status: 'IDEA' | 'RESEARCHING' | 'PLANNED' | 'ORDERED' | 'DELIVERED' | 'INSTALLED' | 'RETURNED') => {
    try {
      setSyncing(true);
      await updateToBuyItem(id, { status });
      await fetchProjects();
    } catch {
      setApiError('Failed to update linked ToBuy.');
    } finally {
      setSyncing(false);
    }
  };

  const handleEditLinkedTodoTitle = async (item: TodoItemDto) => {
    const nextTitle = prompt('Edit Todo title', item.title);
    if (!nextTitle || nextTitle.trim() === item.title) return;
    try {
      setSyncing(true);
      await updateTodo(item.id, { title: nextTitle.trim() });
      await fetchProjects();
    } catch {
      setApiError('Failed to edit linked Todo.');
    } finally {
      setSyncing(false);
    }
  };

  const handleEditLinkedToBuyName = async (item: ToBuyItemDto) => {
    const nextName = prompt('Edit ToBuy name', item.name);
    if (!nextName || nextName.trim() === item.name) return;
    try {
      setSyncing(true);
      await updateToBuyItem(item.id, { name: nextName.trim() });
      await fetchProjects();
    } catch {
      setApiError('Failed to edit linked ToBuy.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteLinkedTodo = async (id: number) => {
    if (!confirm('Delete linked Todo?')) return;
    try {
      setSyncing(true);
      await deleteTodo(id);
      await fetchProjects();
    } catch {
      setApiError('Failed to delete linked Todo.');
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteLinkedToBuy = async (id: number) => {
    if (!confirm('Delete linked ToBuy?')) return;
    try {
      setSyncing(true);
      await deleteToBuyItem(id);
      await fetchProjects();
    } catch {
      setApiError('Failed to delete linked ToBuy.');
    } finally {
      setSyncing(false);
    }
  };

  const handleMarkRecordedToBuy = async (item: ToBuyItemDto) => {
    const suggested = item.actual_cost || item.estimated_cost || '';
    const value = prompt(`Recorded amount for "${item.name}"`, suggested || '');
    if (value === null) return;
    const amount = value.trim().replace(',', '.');
    if (!amount || Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      setApiError('Invalid recorded amount.');
      return;
    }
    try {
      setSyncing(true);
      await markToBuyRecorded(item.id, {
        amount,
        entry_date: new Date().toISOString().split('T')[0],
        note: 'Marked recorded from Projects UI',
      });
      await fetchProjects();
      setApiError(null);
    } catch {
      setApiError('Failed to mark ToBuy item as recorded.');
    } finally {
      setSyncing(false);
    }
  };

  const cycleTaskStatus = (taskId: string) => {
    const statusOrder = [Status.NOT_STARTED, Status.IN_PROGRESS, Status.COMPLETED];
    setFormData((prev) => ({
      ...prev,
      tasks: (prev.tasks || []).map((task) => {
        if (task.id === taskId) {
          const currentIndex = statusOrder.indexOf(task.status);
          const nextIndex = (currentIndex + 1) % statusOrder.length;
          return { ...task, status: statusOrder[nextIndex] };
        }
        return task;
      }),
    }));
  };

  const selectedProject = selectedProjectId ? projects.find((project) => project.id === selectedProjectId) || null : null;

  const updateProjectSections = async (projectId: string, sections: ProjectSection[]) => {
    const token = localStorage.getItem('zenlife_access_token');
    if (token) {
      try {
        setSyncing(true);
        await updateProject(Number(projectId), { sections });
        await fetchProjects();
        return;
      } catch {
        setApiError('Failed to save project sections to backend.');
      } finally {
        setSyncing(false);
      }
    }
    setProjects((prev) => prev.map((project) => (project.id === projectId ? { ...project, sections } : project)));
  };

  const handleAddSection = async () => {
    if (!selectedProject) return;
    const sectionName = prompt('Section/room name');
    if (!sectionName || !sectionName.trim()) return;
    const nextSections = [...(selectedProject.sections || []), { id: Date.now().toString(), name: sectionName.trim(), checklist: [] }];
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const handleRenameSection = async (sectionId: string) => {
    if (!selectedProject) return;
    const section = (selectedProject.sections || []).find((entry) => entry.id === sectionId);
    if (!section) return;
    const nextName = prompt('Rename section', section.name);
    if (!nextName || !nextName.trim() || nextName.trim() === section.name) return;
    const nextSections = (selectedProject.sections || []).map((entry) => (entry.id === sectionId ? { ...entry, name: nextName.trim() } : entry));
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!selectedProject) return;
    if (!confirm('Delete this section and all checklist items?')) return;
    const nextSections = (selectedProject.sections || []).filter((entry) => entry.id !== sectionId);
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const handleAddChecklistItem = async (sectionId: string) => {
    if (!selectedProject) return;
    const title = prompt('Checklist item');
    if (!title || !title.trim()) return;
    const nextSections = (selectedProject.sections || []).map((entry) =>
      entry.id === sectionId
        ? {
            ...entry,
            checklist: [...(entry.checklist || []), { id: Date.now().toString(), title: title.trim(), status: Status.NOT_STARTED }],
          }
        : entry
    );
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const handleCycleChecklistItemStatus = async (sectionId: string, itemId: string) => {
    if (!selectedProject) return;
    const statusOrder = [Status.NOT_STARTED, Status.IN_PROGRESS, Status.COMPLETED];
    const nextSections = (selectedProject.sections || []).map((entry) => {
      if (entry.id !== sectionId) return entry;
      return {
        ...entry,
        checklist: entry.checklist.map((item) => {
          if (item.id !== itemId) return item;
          const idx = statusOrder.indexOf(item.status);
          return { ...item, status: statusOrder[(idx + 1) % statusOrder.length] };
        }),
      };
    });
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const handleDeleteChecklistItem = async (sectionId: string, itemId: string) => {
    if (!selectedProject) return;
    const nextSections = (selectedProject.sections || []).map((entry) =>
      entry.id === sectionId ? { ...entry, checklist: entry.checklist.filter((item) => item.id !== itemId) } : entry
    );
    await updateProjectSections(selectedProject.id, nextSections);
  };

  const getTaskIcon = (status: Status) => {
    switch (status) {
      case Status.COMPLETED:
        return <CheckCircle className="text-emerald-500" size={20} />;
      case Status.IN_PROGRESS:
        return <PlayCircle className="text-blue-500 animate-pulse" size={20} />;
      default:
        return <Circle className="text-gray-300" size={20} />;
    }
  };

  const getTaskRowStyle = (status: Status) => {
    switch (status) {
      case Status.COMPLETED:
        return theme === 'dark' ? 'bg-emerald-900/20 border-emerald-500/40 shadow-sm' : 'bg-emerald-50 border-emerald-100 shadow-sm';
      case Status.IN_PROGRESS:
        return theme === 'dark' ? 'bg-blue-900/20 border-blue-500/40 shadow-sm' : 'bg-blue-50 border-blue-100 shadow-sm';
      default:
        return theme === 'dark' ? 'bg-slate-700/50 border-slate-600' : 'bg-gray-50 border-gray-100';
    }
  };

  const getStatusBadgeStyle = (status: Status) => {
    switch (status) {
      case Status.COMPLETED:
        return 'bg-emerald-100 text-emerald-700';
      case Status.IN_PROGRESS:
        return 'bg-blue-100 text-blue-700';
      case Status.ON_HOLD:
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold">{t.projects}</h2>
          <p className="text-gray-500">Monitor your project milestones and task lifecycles.</p>
          <p className={`text-xs mt-2 ${backendConnected ? 'text-emerald-600' : 'text-amber-600'}`}>
            {backendConnected ? 'Backend sync active' : 'Local mode'} {syncing ? ' (syncing...)' : ''}
          </p>
          {apiError && <p className="text-xs mt-1 text-rose-500">{apiError}</p>}
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl shadow-lg transition-all"
        >
          <Plus size={20} />
          {t.addProject}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {projects.map((project) => {
          const projectIdNum = Number(project.id);
          const linkedTodos = Number.isFinite(projectIdNum) ? (linkedTodoByProject[projectIdNum] || []) : [];
          const linkedToBuy = Number.isFinite(projectIdNum) ? (linkedToBuyByProject[projectIdNum] || []) : [];
          const linkedPlannedCost = linkedToBuy.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0);
          const linkedRecordedCost = linkedToBuy.reduce((sum, item) => sum + Number(item.actual_cost || 0), 0);
          const linkedVariance = linkedPlannedCost - linkedRecordedCost;

          const internalChecklist = project.sections && project.sections.length > 0 ? project.sections.flatMap((section) => section.checklist || []) : project.tasks;
          const internalCompleted = internalChecklist.filter((pt) => pt.status === Status.COMPLETED).length;
          const internalInProgress = internalChecklist.filter((pt) => pt.status === Status.IN_PROGRESS).length;
          const internalNotStarted = internalChecklist.filter((pt) => pt.status === Status.NOT_STARTED).length;

          const todoCompleted = linkedTodos.filter((it) => it.status === 'DONE').length;
          const todoInProgress = linkedTodos.filter((it) => it.status === 'IN_PROGRESS').length;
          const todoNotStarted = linkedTodos.filter((it) => it.status === 'NOT_STARTED' || it.status === 'BLOCKED').length;

          const toBuyCompleted = linkedToBuy.filter((it) => it.status === 'DELIVERED' || it.status === 'INSTALLED').length;
          const toBuyInProgress = linkedToBuy.filter((it) => it.status === 'ORDERED' || it.status === 'RESEARCHING' || it.status === 'PLANNED').length;
          const toBuyNotStarted = linkedToBuy.filter((it) => it.status === 'IDEA' || it.status === 'RETURNED').length;

          const completedTasks = internalCompleted + todoCompleted + toBuyCompleted;
          const inProgressTasks = internalInProgress + todoInProgress + toBuyInProgress;
          const notStartedTasks = internalNotStarted + todoNotStarted + toBuyNotStarted;
          const totalTasks = internalChecklist.length + linkedTodos.length + linkedToBuy.length;
          const taskProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

          return (
            <div key={project.id} className={`p-6 rounded-2xl shadow-sm border transition-all hover:shadow-md ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
                <div className="flex justify-between items-start mb-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${getStatusBadgeStyle(project.status)}`}>
                  {t[project.status.toLowerCase() as keyof typeof t]}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(project)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-blue-500">
                    <Edit3 size={16} />
                  </button>
                  <button onClick={() => handleDelete(project.id)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <h3 className="text-xl font-bold mb-2">{project.name}</h3>
              <p className="text-gray-500 text-sm mb-6 line-clamp-2">{project.description}</p>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold mb-1">
                    <span className="text-gray-400 flex items-center gap-2 tracking-tight uppercase"><ListTodo size={14} /> Progress</span>
                    <span className="text-emerald-500 font-bold">{taskProgress}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-gray-100 dark:bg-slate-700 rounded-full flex overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" style={{ width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : '0%' }} />
                    <div className="h-full bg-blue-500 transition-all duration-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]" style={{ width: totalTasks > 0 ? `${(inProgressTasks / totalTasks) * 100}%` : '0%' }} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-bold uppercase tracking-tighter pt-1">
                    <div className="flex items-center gap-1.5 text-emerald-600"><CheckCircle size={10} /> {completedTasks} {t.completed}</div>
                    <div className="flex items-center gap-1.5 text-blue-600"><PlayCircle size={10} className="animate-pulse" /> {inProgressTasks} {t.inProgress}</div>
                    <div className="flex items-center gap-1.5 text-gray-400"><Circle size={10} /> {notStartedTasks} {t.notStarted}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-700/50 px-2 py-1 rounded-md">
                    <Clock size={12} />
                    {project.deadline || '-'}
                  </div>
                  <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-slate-700/50 px-2 py-1 rounded-md">
                    <ListTodo size={12} />
                    {completedTasks}/{totalTasks} tasks
                  </div>
                </div>

                <div className="text-xs grid grid-cols-3 gap-2">
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-slate-700/60' : 'bg-gray-50'}`}>
                    <div className="text-gray-500">Planned Cost</div>
                    <div className="font-semibold">{linkedPlannedCost.toFixed(2)}</div>
                  </div>
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-slate-700/60' : 'bg-gray-50'}`}>
                    <div className="text-gray-500">Recorded Cost</div>
                    <div className="font-semibold">{linkedRecordedCost.toFixed(2)}</div>
                  </div>
                  <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-slate-700/60' : 'bg-gray-50'}`}>
                    <div className="text-gray-500">Variance</div>
                    <div className={`font-semibold ${linkedVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{linkedVariance.toFixed(2)}</div>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-slate-700">
                  <button
                    onClick={() => setSelectedProjectId((current) => (current === project.id ? null : project.id))}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                  >
                    {selectedProjectId === project.id ? 'Hide details' : 'Project details'}
                  </button>
                </div>

                <div className="pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
                  <p className="text-xs font-semibold text-gray-500">
                    Linked planning items: {linkedTodos.length} Todos, {linkedToBuy.length} ToBuy
                  </p>
                  {(linkedTodos.length > 0 || linkedToBuy.length > 0) ? (
                    <div className="text-xs text-gray-500 space-y-2">
                      {linkedTodos.slice(0, 3).map((it) => (
                        <div key={`todo-${it.id}`} className="flex items-center gap-2">
                          <span className="min-w-0 truncate flex-1">Todo: {it.title}</span>
                          <select
                            value={it.status}
                            onChange={(e) => handleUpdateLinkedTodoStatus(it.id, e.target.value as 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED')}
                            className={`px-2 py-1 rounded border text-[11px] ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}
                          >
                            <option value="NOT_STARTED">NOT_STARTED</option>
                            <option value="IN_PROGRESS">IN_PROGRESS</option>
                            <option value="DONE">DONE</option>
                            <option value="BLOCKED">BLOCKED</option>
                          </select>
                          <button onClick={() => handleEditLinkedTodoTitle(it)} className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600">Edit</button>
                          <button onClick={() => handleDeleteLinkedTodo(it.id)} className="px-2 py-1 rounded border border-rose-200 text-rose-600">Delete</button>
                        </div>
                      ))}
                      {linkedToBuy.slice(0, 3).map((it) => (
                        <div key={`tb-${it.id}`} className="flex items-center gap-2">
                          <span className="min-w-0 truncate flex-1">ToBuy: {it.name}</span>
                          <select
                            value={it.status}
                            onChange={(e) => handleUpdateLinkedToBuyStatus(it.id, e.target.value as 'IDEA' | 'RESEARCHING' | 'PLANNED' | 'ORDERED' | 'DELIVERED' | 'INSTALLED' | 'RETURNED')}
                            className={`px-2 py-1 rounded border text-[11px] ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200'}`}
                          >
                            <option value="IDEA">IDEA</option>
                            <option value="RESEARCHING">RESEARCHING</option>
                            <option value="PLANNED">PLANNED</option>
                            <option value="ORDERED">ORDERED</option>
                            <option value="DELIVERED">DELIVERED</option>
                            <option value="INSTALLED">INSTALLED</option>
                            <option value="RETURNED">RETURNED</option>
                          </select>
                          <button onClick={() => handleEditLinkedToBuyName(it)} className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600">Edit</button>
                          <button
                            onClick={() => handleMarkRecordedToBuy(it)}
                            className="px-2 py-1 rounded border border-emerald-200 text-emerald-700"
                          >
                            Mark Recorded
                          </button>
                          <button onClick={() => handleDeleteLinkedToBuy(it.id)} className="px-2 py-1 rounded border border-rose-200 text-rose-600">Delete</button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No linked Todo/ToBuy yet.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedProject && (
        <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold">Project detail: {selectedProject.name}</h3>
              <p className="text-sm text-gray-500">Sections/rooms and checklist</p>
            </div>
            <button
              onClick={handleAddSection}
              disabled={syncing}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              Add section
            </button>
          </div>

          {(selectedProject.sections || []).length === 0 ? (
            <div className="text-sm text-gray-500 border border-dashed border-gray-300 dark:border-slate-600 rounded-xl p-4">
              No sections yet. Add your first room/section to start the checklist.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {(selectedProject.sections || []).map((section) => (
                <div key={section.id} className={`rounded-xl border p-4 space-y-3 ${theme === 'dark' ? 'border-slate-600 bg-slate-700/30' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-semibold">{section.name}</h4>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRenameSection(section.id)}
                        disabled={syncing}
                        className="px-2 py-1 rounded border border-gray-300 dark:border-slate-500 text-xs"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => handleDeleteSection(section.id)}
                        disabled={syncing}
                        className="px-2 py-1 rounded border border-rose-300 text-rose-600 text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(section.checklist || []).map((item) => (
                      <div key={item.id} className={`flex items-center gap-2 rounded-lg border p-2 ${theme === 'dark' ? 'border-slate-600 bg-slate-700' : 'border-gray-200 bg-white'}`}>
                        <button onClick={() => handleCycleChecklistItemStatus(section.id, item.id)} className="flex-shrink-0" title="Cycle status">
                          {getTaskIcon(item.status)}
                        </button>
                        <span className={`flex-1 text-sm ${item.status === Status.COMPLETED ? 'line-through text-gray-400' : ''}`}>
                          {item.title}
                        </span>
                        <button
                          onClick={() => handleDeleteChecklistItem(section.id, item.id)}
                          disabled={syncing}
                          className="text-rose-600 text-xs px-2 py-1 rounded border border-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    {(section.checklist || []).length === 0 && (
                      <p className="text-xs text-gray-500">No checklist item yet.</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleAddChecklistItem(section.id)}
                    disabled={syncing}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Add checklist item
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh] ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">{editingProject ? t.edit : t.addProject}</h3>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><Trash2 size={20} className="rotate-45" /></button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.title}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.deadline}</label>
                  <input
                    type="date"
                    value={formData.deadline}
                    onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">{t.description}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.priority}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Priority })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <option value={Priority.LOW}>{t.low}</option>
                    <option value={Priority.MEDIUM}>{t.medium}</option>
                    <option value={Priority.HIGH}>{t.high}</option>
                    <option value={Priority.CRITICAL}>{t.critical}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">{t.status}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Status })}
                    className={`w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  >
                    <option value={Status.NOT_STARTED}>{t.notStarted}</option>
                    <option value={Status.IN_PROGRESS}>{t.inProgress}</option>
                    <option value={Status.COMPLETED}>{t.completed}</option>
                    <option value={Status.ON_HOLD}>{t.onHold}</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold flex items-center gap-2">
                    <ListTodo size={18} /> {t.tasks}
                  </h4>
                  <span className="text-[10px] uppercase font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded tracking-widest">Interactive</span>
                </div>

                <div className="flex gap-2 mb-6">
                  <input
                    type="text"
                    placeholder={t.addTask}
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addTask()}
                    className={`flex-1 px-4 py-2 rounded-xl border outline-none focus:ring-2 focus:ring-emerald-500 ${theme === 'dark' ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-100'}`}
                  />
                  <button onClick={addTask} className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-md transition-all">
                    <Plus size={20} />
                  </button>
                </div>

                <div className="space-y-3">
                  {(formData.tasks || []).map((task) => (
                    <div key={task.id} className={`flex items-center gap-3 p-4 rounded-xl border group transition-all duration-300 ${getTaskRowStyle(task.status)}`}>
                      <button onClick={() => cycleTaskStatus(task.id)} className="hover:scale-110 transition-transform active:scale-95 flex-shrink-0" title={t.taskStatus}>
                        {getTaskIcon(task.status)}
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`block font-semibold truncate ${task.status === Status.COMPLETED ? 'line-through text-gray-400' : ''}`}>{task.title}</span>
                        <span className="text-[9px] uppercase font-black tracking-widest opacity-60">{t[task.status.toLowerCase() as keyof typeof t]}</span>
                      </div>
                      <button onClick={() => setFormData((prev) => ({ ...prev, tasks: prev.tasks?.filter((tk) => tk.id !== task.id) }))} className="text-gray-400 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {(formData.tasks || []).length === 0 && (
                    <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-100 dark:border-slate-700 rounded-3xl">
                      <Circle size={40} className="mx-auto mb-3 opacity-10" />
                      <p className="text-xs font-bold uppercase tracking-widest opacity-40">Zero Tasks Found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={closeModal} className={`flex-1 py-3 rounded-xl font-bold transition-all ${theme === 'dark' ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>{t.cancel}</button>
              <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all">{t.save}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectsSection;
