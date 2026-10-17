// ===========================================================================
// 前后端共用的领域类型 + 状态流转规则（单一事实来源）
// server 与 client 都从这里 import，避免两边各写一份导致漂移
// ===========================================================================

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

/**
 * 项目状态允许的流转（"当前 -> 允许的下一个"）。
 * 未列出的跳转一律视为非法（例如 draft 不能直接跳到 done）。
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['planning', 'awaiting_confirmation', 'cancelled'],
  planning: ['awaiting_confirmation', 'running', 'draft', 'cancelled'],
  awaiting_confirmation: ['running', 'planning', 'cancelled'],
  running: ['done', 'failed', 'cancelled'],
  done: [],
  failed: ['planning', 'cancelled'],
  cancelled: ['draft'],
};

/**
 * 任务状态允许的流转。
 * 注意：W1/W2 还没有执行引擎，所以允许 pending 直接 marked succeeded（手工确认）；
 * W3 引入执行器后，正常链路是 pending -> running -> succeeded。
 */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'succeeded', 'cancelled'],
  running: ['succeeded', 'failed', 'needs_review', 'cancelled'],
  succeeded: [],
  failed: ['pending', 'cancelled'],
  needs_review: ['succeeded', 'failed', 'cancelled'],
  cancelled: ['pending'],
};

export function canTransition<S extends string>(map: Record<S, S[]>, from: S, to: S): boolean {
  if (from === to) return true;
  return (map[from] ?? []).includes(to);
}

/** 返回"当前状态 + 允许的下一个状态"，用于前端下拉只显示合法选项 */
export function allowedNext<S extends string>(map: Record<S, S[]>, from: S): S[] {
  return [from, ...(map[from] ?? [])];
}

// ---------------- 对外数据结构（API 返回值） ----------------

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

export type Run = {
  id: number;
  taskId: number;
  attempt: number;
  status: string;
  input: string | null;
  output: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export type Artifact = {
  id: number;
  taskId: number;
  projectId: number;
  type: string;
  name: string;
  content: string;
  createdAt: string;
};

export type HealthResponse = {
  status: string;
  service: string;
  version: string;
  time: string;
  uptimeSec: number;
  model: { baseUrl: string; name: string; configured: boolean };
  db: {
    ok: boolean;
    file: string;
    counts: { projects: number; tasks: number; runs: number; artifacts: number };
    schemaVersion?: number;
    error: string | null;
  };
};