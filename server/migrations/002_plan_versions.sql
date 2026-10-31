-- 002_plan_versions: 计划版本记录（W2）
CREATE TABLE IF NOT EXISTS plan_versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL,
  source     TEXT NOT NULL,                 -- 'model' | 'manual'
  summary    TEXT NOT NULL DEFAULT '',
  raw_output TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (project_id, version)
);

CREATE INDEX IF NOT EXISTS idx_plan_versions_project ON plan_versions(project_id, version DESC);