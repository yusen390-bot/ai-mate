-- 001_init: 四张核心表（projects / tasks / runs / artifacts）+ 索引
-- 由 server/src/db.ts 在启动时自动执行，执行记录写入 schema_version

CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  goal       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tasks (
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
);

CREATE TABLE IF NOT EXISTS runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  attempt     INTEGER NOT NULL,
  status      TEXT NOT NULL,
  input       TEXT,
  output      TEXT,
  error       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project     ON tasks(project_id, order_index, id);
CREATE INDEX IF NOT EXISTS idx_runs_task         ON runs(task_id, id);
CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id, id);
CREATE INDEX IF NOT EXISTS idx_artifacts_task    ON artifacts(task_id, id);