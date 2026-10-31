import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getDbFile } from './config.ts';
import type { CreateTaskInput, UpdateTaskInput } from './schemas.ts';
import type {
  Artifact,
  PlanDraft,
  PlanVersionInfo,
  PlanVersionSource,
  Project,
  ProjectStatus,
  Run,
  Task,
  TaskStats,
  TaskStatus,
  TaskTool,
} from '../../shared/types.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, '..', 'migrations');

let db: DatabaseSync | null = null;
let schema = { version: 0, applied: [] as number[] };

// ---------------------------------------------------------------------------
// 迁移：server/migrations/NNN_name.sql，按版本号顺序执行，记录到 schema_version
// ---------------------------------------------------------------------------
function applyMigrations(instance: DatabaseSync): { version: number; applied: number[] } {
  instance.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `);

  const done = new Set(
    (instance.prepare('SELECT version FROM schema_version').all() as { version: number }[]).map((r) => r.version),
  );

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    : [];

  const applied: number[] = [];
  for (const file of files) {
    const version = Number(file.slice(0, file.indexOf('_')));
    if (!Number.isInteger(version) || done.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    instance.exec('BEGIN');
    try {
      instance.exec(sql);
      instance.prepare('INSERT INTO schema_version (version, name) VALUES (?, ?)').run(version, file);
      instance.exec('COMMIT');
      applied.push(version);
    } catch (error) {
      instance.exec('ROLLBACK');
      throw new Error(`迁移 ${file} 执行失败：${(error as Error).message}`);
    }
  }

  const maxRow = instance.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number | null };
  return { version: Number(maxRow?.v ?? 0), applied };
}

/** 惰性打开数据库（测试可在首次调用前用 DB_FILE 指定 :memory:） */
export function getDb(): DatabaseSync {
  if (db) return db;
  const file = getDbFile();
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const instance = new DatabaseSync(file);
  instance.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') instance.exec('PRAGMA journal_mode = WAL');

  schema = applyMigrations(instance);
  db = instance;
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/** 当前 schema 版本信息（/health、db:test 用） */
export function schemaInfo(): { version: number; applied: number[] } {
  getDb();
  return schema;
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
// 行类型与映射
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
  approved: number;
  tool: string;
  acceptance_criteria: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
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
    approved: row.approved === 1,
    tool: row.tool as TaskTool,
    acceptanceCriteria: row.acceptance_criteria,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 一次聚合查询拿到所有项目的任务统计（避免 N+1） */
function statsFor(projectId?: number): Map<number, TaskStats> | TaskStats {
  const rows = getDb()
    .prepare(
      `SELECT project_id,
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS done
         FROM tasks
        ${projectId === undefined ? 'GROUP BY project_id' : 'WHERE project_id = ? GROUP BY project_id'}`,
    )
    .all(...(projectId === undefined ? [] : [projectId])) as { project_id: number; total: number; done: number | null }[];

  const map = new Map<number, TaskStats>();
  for (const row of rows) map.set(row.project_id, { total: Number(row.total ?? 0), done: Number(row.done ?? 0) });
  if (projectId === undefined) return map;
  return map.get(projectId) ?? { total: 0, done: 0 };
}

function toProject(row: ProjectRow, stats: TaskStats): Project {
  return {
    id: row.id,
    title: row.title,
    goal: row.goal,
    status: row.status as ProjectStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    taskStats: stats,
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
  const stats = statsFor() as Map<number, TaskStats>;
  return rows.map((row) => toProject(row, stats.get(row.id) ?? { total: 0, done: 0 }));
}

export function getProject(id: number): Project | null {
  const row = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!row) return null;
  return toProject(row, statsFor(id) as TaskStats);
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
          order_index, requires_approval, acceptance_criteria, max_attempts, tool)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.tool ?? 'auto',
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
              order_index = ?, requires_approval = ?, acceptance_criteria = ?, max_attempts = ?, tool = ?, updated_at = ${NOW}
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
      patch.tool ?? existing.tool,
      id,
    );
  return getTask(id);
}

export function deleteTask(id: number): boolean {
  return Number(getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes) > 0;
}

// ---------------------------------------------------------------------------
// runs / artifacts（W3 执行引擎使用）
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
// ---------------------------------------------------------------------------
// 计划（W2）
// ---------------------------------------------------------------------------
type PlanVersionRow = {
  id: number;
  project_id: number;
  version: number;
  source: string;
  summary: string;
  created_at: string;
};

export function listPlanVersions(projectId: number): PlanVersionInfo[] {
  const rows = getDb()
    .prepare(
      `SELECT id, project_id, version, source, summary, created_at
         FROM plan_versions WHERE project_id = ? ORDER BY version DESC`,
    )
    .all(projectId) as PlanVersionRow[];

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    version: row.version,
    source: row.source as PlanVersionSource,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

/** 当前计划 = 最新版本的任务 + 历史版本列表 */
export function getPlan(projectId: number): { version: number; tasks: Task[]; versions: PlanVersionInfo[] } {
  const versions = listPlanVersions(projectId);
  const version = versions.length > 0 ? versions[0].version : 0;
  if (version === 0) return { version: 0, tasks: [], versions };

  const rows = getDb()
    .prepare('SELECT * FROM tasks WHERE project_id = ? AND plan_version = ? ORDER BY order_index ASC, id ASC')
    .all(projectId, version) as TaskRow[];

  return { version, tasks: rows.map(toTask), versions };
}

/**
 * 保存计划（事务）：
 * - 版本号 = 已有最大版本 + 1
 * - 只清理"还没执行过"的旧任务（attempts=0 且 pending）
 * - ref -> 真实 task id 映射后写入 dependencies
 * - 项目状态置为 awaiting_confirmation（确认前不会执行）
 */
export function savePlan(
  projectId: number,
  plan: PlanDraft,
  opts: { source: PlanVersionSource; rawOutput?: string | null },
): { version: number; tasks: Task[] } {
  const d = getDb();

  return tx(() => {
    const row = d
      .prepare(
        `SELECT COALESCE(MAX(v), 0) AS v FROM (
           SELECT MAX(plan_version) AS v FROM tasks WHERE project_id = ?
           UNION ALL
           SELECT MAX(version) AS v FROM plan_versions WHERE project_id = ?
         )`,
      )
      .get(projectId, projectId) as { v: number };
    const version = Number(row?.v ?? 0) + 1;

    d.prepare(`DELETE FROM tasks WHERE project_id = ? AND attempts = 0 AND status = 'pending'`).run(projectId);

    const insert = d.prepare(
      `INSERT INTO tasks (project_id, title, description, status, dependencies, plan_version, order_index, requires_approval, acceptance_criteria)
       VALUES (?, ?, ?, 'pending', '[]', ?, ?, ?, ?)`,
    );

    const ids = new Map<string, number>();
    plan.tasks.forEach((task, index) => {
      const info = insert.run(
        projectId,
        task.title,
        task.description,
        version,
        index,
        task.requiresApproval ? 1 : 0,
        task.acceptanceCriteria,
      );
      ids.set(task.ref, Number(info.lastInsertRowid));
    });

    const setDeps = d.prepare('UPDATE tasks SET dependencies = ? WHERE id = ?');
    for (const task of plan.tasks) {
      const taskId = ids.get(task.ref) as number;
      const deps = task.dependsOn.map((ref) => ids.get(ref) as number);
      setDeps.run(JSON.stringify(deps), taskId);
    }

    d.prepare('INSERT INTO plan_versions (project_id, version, source, summary, raw_output) VALUES (?, ?, ?, ?, ?)').run(
      projectId,
      version,
      opts.source,
      plan.summary,
      opts.rawOutput ?? null,
    );

    d.prepare(`UPDATE projects SET status = 'awaiting_confirmation', updated_at = ${NOW} WHERE id = ?`).run(projectId);

    return { version, tasks: listTasks(projectId) };
  });
}
// ---------------------------------------------------------------------------
// 执行引擎（W3）
// ---------------------------------------------------------------------------
export function setTaskStatus(
  id: number,
  status: TaskStatus,
  patch: { attempts?: number; lastError?: string | null } = {},
): void {
  const row = getDb().prepare('SELECT attempts, last_error FROM tasks WHERE id = ?').get(id) as
    | { attempts: number; last_error: string | null }
    | undefined;
  if (!row) return;

  getDb()
    .prepare(`UPDATE tasks SET status = ?, attempts = ?, last_error = ?, updated_at = ${NOW} WHERE id = ?`)
    .run(status, patch.attempts ?? row.attempts, patch.lastError === undefined ? row.last_error : patch.lastError, id);
}

/** 人工批准：approved=1，任务回到 pending，等待执行器继续 */
export function approveTask(id: number): void {
  getDb()
    .prepare(`UPDATE tasks SET approved = 1, status = 'pending', last_error = NULL, updated_at = ${NOW} WHERE id = ?`)
    .run(id);
}

export function recordRunStart(taskId: number, attempt: number, input: string): number {
  const info = getDb()
    .prepare(`INSERT INTO runs (task_id, attempt, status, input) VALUES (?, ?, 'running', ?)`)
    .run(taskId, attempt, input);
  return Number(info.lastInsertRowid);
}

export function finishRun(
  runId: number,
  status: 'succeeded' | 'failed',
  output?: string | null,
  error?: string | null,
): void {
  getDb()
    .prepare(`UPDATE runs SET status = ?, output = ?, error = ?, finished_at = ${NOW} WHERE id = ?`)
    .run(status, output ?? null, error ?? null, runId);
}

export type ProjectRun = {
  id: number;
  taskId: number;
  taskTitle: string;
  attempt: number;
  status: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
};

export function listProjectRuns(projectId: number, limit = 100): ProjectRun[] {
  const rows = getDb()
    .prepare(
      `SELECT r.id, r.task_id, t.title AS task_title, r.attempt, r.status, r.error, r.started_at, r.finished_at
         FROM runs r JOIN tasks t ON t.id = r.task_id
        WHERE t.project_id = ?
        ORDER BY r.id DESC
        LIMIT ?`,
    )
    .all(projectId, limit) as {
    id: number;
    task_id: number;
    task_title: string;
    attempt: number;
    status: string;
    error: string | null;
    started_at: string;
    finished_at: string | null;
  }[];

  return rows.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    attempt: row.attempt,
    status: row.status,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  }));
}

/**
 * 服务重启恢复：running 任务可能已产生外部副作用，不能盲目重跑。
 * 策略：任务转 needs_review、对应 run 标记 failed，项目转 awaiting_confirmation 等人工处理。
 */
export function interruptRunningTasks(): number {
  const d = getDb();
  const tasks = d
    .prepare(
      `UPDATE tasks
          SET status = 'needs_review',
              last_error = '服务重启导致执行中断，需人工确认',
              updated_at = ${NOW}
        WHERE status = 'running'`,
    )
    .run();
  const runs = d
    .prepare(
      `UPDATE runs
          SET status = 'failed',
              error = '服务重启导致执行中断',
              finished_at = ${NOW}
        WHERE status = 'running'`,
    )
    .run();
  d.prepare(
    `UPDATE projects SET status = 'awaiting_confirmation', updated_at = ${NOW}
      WHERE status = 'running'
        AND id IN (SELECT project_id FROM tasks WHERE status = 'needs_review')`,
  ).run();
  return Number(tasks.changes) + Number(runs.changes);
}