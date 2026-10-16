import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getDbFile } from './config.ts';
import type { CreateTaskInput, ProjectStatus, TaskStatus, UpdateTaskInput } from './schemas.ts';

// ---------------------------------------------------------------------------
// 四张表：projects / tasks / runs / artifacts   （对应方案书第五节）
// ---------------------------------------------------------------------------
const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    goal       TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'pending',
    dependencies        TEXT NOT NULL DEFAULT '[]',
    plan_version        INTEGER NOT NULL DEFAULT 1,
    order_index         INTEGER NOT NULL DEFAULT 0,
    requires_approval   INTEGER NOT NULL DEFAULT 0,
    acceptance_criteria TEXT NOT NULL DEFAULT '',
    attempts            INTEGER NOT NULL DEFAULT 0,
    max_attempts        INTEGER NOT NULL DEFAULT 3,
    last_error          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  `CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    attempt     INTEGER NOT NULL,
    status      TEXT NOT NULL,
    input       TEXT,
    output      TEXT,
    error       TEXT,
    started_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    finished_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    name       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id, order_index, id)',
  'CREATE INDEX IF NOT EXISTS idx_runs_task         ON runs(task_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, id)',
  'CREATE INDEX IF NOT EXISTS idx_artifacts_task    ON artifacts(task_id, id)',
];

let db: DatabaseSync | null = null;

/** 惰性打开数据库（测试可在首次调用前用 DB_FILE 指定 :memory:） */
export function getDb(): DatabaseSync {
  if (db) return db;
  const file = getDbFile();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const instance = new DatabaseSync(file);
  instance.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') instance.exec('PRAGMA journal_mode = WAL');
  for (const sql of SCHEMA) instance.exec(sql);
  db = instance;
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** 事务封装：状态变更 + 执行记录 + 产物保存应放在同一事务里 */
export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (error) {
    d.exec('ROLLBACK');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// 行类型与对外类型
// ---------------------------------------------------------------------------
type ProjectRow = {
  id: number;
  title: string;
  goal: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: string;
  dependencies: string;
  plan_version: number;
  order_index: number;
  requires_approval: number;
  acceptance_criteria: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
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

function parseDependencies(raw: string): number[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((n): n is number => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    dependencies: parseDependencies(row.dependencies),
    planVersion: row.plan_version,
    orderIndex: row.order_index,
    requiresApproval: row.requires_approval === 1,
    acceptanceCriteria: row.acceptance_criteria,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function statsFor(projectId: number): TaskStats {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS done
         FROM tasks WHERE project_id = ?`,
    )
    .get(projectId) as { total: number; done: number | null } | undefined;
  return { total: Number(row?.total ?? 0), done: Number(row?.done ?? 0) };
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    status: row.status as ProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskStats: statsFor(row.id),
  };
}

const NOW = "datetime('now','localtime')";

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
export function createProject(input: { title: string; goal: string }): Project {
  const info = getDb().prepare('INSERT INTO projects (title, goal) VALUES (?, ?)').run(input.title, input.goal);
  return getProject(Number(info.lastInsertRowid))!;
}

export function listProjects(): Project[] {
  const rows = getDb().prepare('SELECT * FROM projects ORDER BY id DESC').all() as ProjectRow[];
  return rows.map(toProject);
}

export function getProject(id: number): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  return row ? toProject(row) : null;
}

export function updateProject(
  id: number,
  patch: { title?: string; goal?: string; status?: ProjectStatus },
): Project | null {
  const existing = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!existing) return null;
  getDb()
    .prepare(`UPDATE projects SET title = ?, goal = ?, status = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(patch.title ?? existing.title, patch.goal ?? existing.goal, patch.status ?? existing.status, id);
  return getProject(id);
}

export function deleteProject(id: number): boolean {
  return Number(getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes) > 0;
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------
export function listTasks(projectId: number): Task[] {
  const rows = getDb()
    .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY order_index ASC, id ASC')
    .all(projectId) as TaskRow[];
  return rows.map(toTask);
}

export function getTask(id: number): Task | null {
  const row = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

export function createTask(projectId: number, input: CreateTaskInput): Task {
  const d = getDb();
  const orderIndex =
    input.orderIndex ??
    Number(
      (d.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM tasks WHERE project_id = ?').get(projectId) as {
        next: number;
      }).next,
    );

  const info = d
    .prepare(
      `INSERT INTO tasks
         (project_id, title, description, status, dependencies, plan_version,
          order_index, requires_approval, acceptance_criteria, max_attempts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      input.title,
      input.description ?? '',
      input.status ?? 'pending',
      JSON.stringify(input.dependencies ?? []),
      input.planVersion ?? 1,
      orderIndex,
      input.requiresApproval ? 1 : 0,
      input.acceptanceCriteria ?? '',
      input.maxAttempts ?? 3,
    );
  return getTask(Number(info.lastInsertRowid))!;
}

export function updateTask(id: number, patch: UpdateTaskInput): Task | null {
  const existing = getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
  if (!existing) return null;

  const requiresApproval =
    patch.requiresApproval === undefined ? existing.requires_approval : patch.requiresApproval ? 1 : 0;

  getDb()
    .prepare(
      `UPDATE tasks SET title = ?, description = ?, status = ?, dependencies = ?, plan_version = ?,
              order_index = ?, requires_approval = ?, acceptance_criteria = ?, max_attempts = ?, updated_at = ${NOW}
        WHERE id = ?`,
    )
    .run(
      patch.title ?? existing.title,
      patch.description ?? existing.description,
      patch.status ?? existing.status,
      patch.dependencies !== undefined ? JSON.stringify(patch.dependencies) : existing.dependencies,
      patch.planVersion ?? existing.plan_version,
      patch.orderIndex ?? existing.order_index,
      requiresApproval,
      patch.acceptanceCriteria ?? existing.acceptance_criteria,
      patch.maxAttempts ?? existing.max_attempts,
      id,
    );
  return getTask(id);
}

export function deleteTask(id: number): boolean {
  return Number(getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) > 0;
}

// ---------------------------------------------------------------------------
// runs / artifacts（W3 执行引擎使用，W1 先建表并留好入口）
// ---------------------------------------------------------------------------
export function recordRun(input: {
  taskId: number;
  attempt: number;
  status: string;
  input?: string | null;
  output?: string | null;
  error?: string | null;
}): number {
  const info = getDb()
    .prepare(
      `INSERT INTO runs (task_id, attempt, status, input, output, error, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ${NOW})`,
    )
    .run(input.taskId, input.attempt, input.status, input.input ?? null, input.output ?? null, input.error ?? null);
  return Number(info.lastInsertRowid);
}

export function listRuns(taskId: number): Run[] {
  const rows = getDb().prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY id ASC').all(taskId) as {
    id: number;
    task_id: number;
    attempt: number;
    status: string;
    input: string | null;
    output: string | null;
    error: string | null;
    started_at: string;
    finished_at: string | null;
  }[];
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    attempt: r.attempt,
    status: r.status,
    input: r.input,
    output: r.output,
    error: r.error,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  }));
}

export function addArtifact(input: {
  taskId: number;
  projectId: number;
  type: string;
  name: string;
  content: string;
}): number {
  const info = getDb()
    .prepare('INSERT INTO artifacts (task_id, project_id, type, name, content) VALUES (?, ?, ?, ?, ?)')
    .run(input.taskId, input.projectId, input.type, input.name, input.content);
  return Number(info.lastInsertRowid);
}

export function listArtifacts(projectId: number): Artifact[] {
  const rows = getDb()
    .prepare('SELECT * FROM artifacts WHERE project_id = ? ORDER BY id ASC')
    .all(projectId) as {
    id: number;
    task_id: number;
    project_id: number;
    type: string;
    name: string;
    content: string;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id,
    type: r.type,
    name: r.name,
    content: r.content,
    createdAt: r.created_at,
  }));
}

/** /health 用：四表记录数 */
export function counts(): { projects: number; tasks: number; runs: number; artifacts: number } {
  const d = getDb();
  const one = (table: string) =>
    Number((d.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  return { projects: one('projects'), tasks: one('tasks'), runs: one('runs'), artifacts: one('artifacts') };
}