import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { HealthResponse, Project } from './api';
import ModelCheck from './components/ModelCheck';
import ProjectPanel from './components/ProjectPanel';
import TaskBoard from './components/TaskBoard';

type Tab = 'tasks' | 'model';

export default function App() {
  const [tab, setTab] = useState<Tab>('tasks');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshHealth = useCallback(async () => {
    try {
      setHealth(await api.health());
      setHealthError(null);
    } catch (err) {
      setHealth(null);
      setHealthError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.listProjects();
      setProjects(list);
      setSelectedId((prev) => (prev && list.some((p) => p.id === prev) ? prev : (list[0]?.id ?? null)));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
    void refreshProjects();
  }, [refreshHealth, refreshProjects]);

  const selected = projects.find((project) => project.id === selectedId) ?? null;
  const online = Boolean(health) && !healthError;
  const modelReady = health?.model.configured ?? false;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-cyan-300 text-sm font-bold text-slate-900">
              AI
            </span>
            <div>
              <h1 className="text-base font-semibold text-slate-100">AI Mate</h1>
              <p className="text-[11px] text-slate-500">目标 → 计划 → 确认 → 执行 → 验证</p>
            </div>
          </div>

          <nav className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1 text-sm">
            <button
              className={`rounded-md px-3 py-1.5 transition ${tab === 'tasks' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              type="button"
              onClick={() => setTab('tasks')}
            >
              任务
            </button>
            <button
              className={`rounded-md px-3 py-1.5 transition ${tab === 'model' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              type="button"
              onClick={() => setTab('model')}
            >
              模型自检
            </button>
          </nav>

          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={`rounded-full border px-2 py-0.5 ${
                online ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }`}
            >
              {online ? '后端在线' : '后端离线'}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 ${
                modelReady ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              }`}
            >
              {modelReady ? `${health?.model.name} 已配置` : '模型未配置'}
            </span>
            {health && (
              <span className="text-slate-500">
                项目 {health.db.counts.projects} · 任务 {health.db.counts.tasks}
              </span>
            )}
            <button
              className="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:border-slate-500 hover:text-slate-200"
              type="button"
              onClick={() => {
                void refreshHealth();
                void refreshProjects();
              }}
            >
              刷新
            </button>
          </div>
        </div>
      </header>

      {(healthError || loadError) && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
            {healthError ?? loadError} —— 请先运行 <code className="rounded bg-slate-900 px-1">npm run dev:server</code>
          </p>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        {tab === 'tasks' ? (
          <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
            <ProjectPanel
              projects={projects}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRefresh={() => void refreshProjects()}
            />
            <TaskBoard project={selected} onProjectChanged={() => void refreshProjects()} />
          </div>
        ) : (
          <ModelCheck />
        )}
      </main>
    </div>
  );
}