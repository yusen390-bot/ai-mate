export const PROJECT_STATUSES = [
  'draft',
  'planning',
  'awaiting_confirmation',
  'running',
  'done',
  'failed',
  'cancelled',
] as const;

export const TASK_STATUSES = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'needs_review',
  'cancelled',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: '草稿',
  planning: '规划中',
  awaiting_confirmation: '待用户确认',
  running: '执行中',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  pending: '待执行',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败',
  needs_review: '待人工复核',
  cancelled: '已取消',
};

export const TASK_STATUS_STYLE: Record<TaskStatus, string> = {
  pending: 'bg-slate-700/50 text-slate-300 border-slate-600',
  running: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
  succeeded: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  needs_review: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  cancelled: 'bg-slate-800 text-slate-500 border-slate-700',
};

export type TaskStats = { total: number; done: number };

export type Project = {
  id: number;
  title: string;
  goal: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  taskStats: TaskStats;
};

export type Task = {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: TaskStatus;
  dependencies: number[];
  planVersion: number;
  orderIndex: number;
  requiresApproval: boolean;
  acceptanceCriteria: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
  time: string;
  uptimeSec: number;
  model: { baseUrl: string; name: string; configured: boolean };
  db: { ok: boolean; file: string; counts: { projects: number; tasks: number; runs: number; artifacts: number }; error: string | null };
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  dependencies?: number[];
  acceptanceCriteria?: string;
  requiresApproval?: boolean;
};

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as unknown;
  if (!res.ok) {
    const error = (data as { error?: { message?: string } }).error;
    throw new Error(error?.message ?? `请求失败（HTTP ${res.status}）`);
  }
  return data as T;
}

const jsonHeaders = { 'content-type': 'application/json' };

export const api = {
  health: () => fetch('/health').then((res) => readJson<HealthResponse>(res)),

  listProjects: () =>
    fetch('/api/projects')
      .then((res) => readJson<{ projects: Project[] }>(res))
      .then((data) => data.projects),

  createProject: (input: { title: string; goal: string }) =>
    fetch('/api/projects', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(input) }).then((res) =>
      readJson<Project>(res),
    ),

  updateProject: (id: number, patch: Partial<{ title: string; goal: string; status: ProjectStatus }>) =>
    fetch(`/api/projects/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(patch) }).then((res) =>
      readJson<Project>(res),
    ),

  deleteProject: async (id: number) => {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(`删除失败（HTTP ${res.status}）`);
  },

  listTasks: (projectId: number) =>
    fetch(`/api/projects/${projectId}/tasks`)
      .then((res) => readJson<{ tasks: Task[] }>(res))
      .then((data) => data.tasks),

  createTask: (projectId: number, input: CreateTaskInput) =>
    fetch(`/api/projects/${projectId}/tasks`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify(input) }).then(
      (res) => readJson<Task>(res),
    ),

  updateTask: (
    id: number,
    patch: Partial<{
      title: string;
      description: string;
      status: TaskStatus;
      dependencies: number[];
      acceptanceCriteria: string;
      requiresApproval: boolean;
    }>,
  ) =>
    fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(patch) }).then((res) =>
      readJson<Task>(res),
    ),

  deleteTask: async (id: number) => {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) throw new Error(`删除失败（HTTP ${res.status}）`);
  },

  chat: (message: string) =>
    fetch('/api/chat', { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ message }) }).then((res) =>
      readJson<{ reply: string; model: string }>(res),
    ),
};