-- 003_execution: 执行引擎字段（受控工具选择 / 人工审批标记）
ALTER TABLE tasks ADD COLUMN tool TEXT NOT NULL DEFAULT 'auto';
ALTER TABLE tasks ADD COLUMN approved INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);