import { useState } from 'react';
import type { FormEvent } from 'react';
import { PROJECT_STATUS_LABEL, api } from '../api';
import type { Project } from '../api';

type Props = {
  projects: Project[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRefresh: () => void;
};

export default function ProjectPanel({ projects, selectedId, onSelect, onRefresh }: Props) {
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !goal.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject({ title: title.trim(), goal: goal.trim() });
      setTitle('');
      setGoal('');
      onRefresh();
      onSelect(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    try {
      await api.deleteProject(id);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-slate-300">新建项目</h2>
      <form className="mt-3 space-y-2" onSubmit={onCreate}>
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          placeholder="项目标题，例如：技术主题报告"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="h-20 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          placeholder="目标（越具体越好），例如：帮我整理一份关于向量数据库的技术主题报告"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700"
          type="submit"
          disabled={busy || !title.trim() || !goal.trim()}
        >
          {busy ? '创建中…' : '创建项目'}
        </button>
      </form>

      {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}

      <h2 className="mt-6 text-sm font-semibold tracking-wide text-slate-300">
        项目列表 <span className="text-slate-500">({projects.length})</span>
      </h2>
      <ul className="mt-3 space-y-2">
        {projects.length === 0 && <li className="text-xs text-slate-500">还没有项目，先在上方创建一个。</li>}
        {projects.map((project) => (
          <li key={project.id}>
            <div
              className={`flex cursor-pointer items-start justify-between gap-2 rounded-lg border px-3 py-2 transition ${
                project.id === selectedId
                  ? 'border-sky-500/60 bg-sky-500/10'
                  : 'border-slate-800 hover:border-slate-600'
              }`}
              onClick={() => onSelect(project.id)}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">#{project.id} {project.title}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {PROJECT_STATUS_LABEL[project.status]} · 任务 {project.taskStats.done}/{project.taskStats.total}
                </p>
              </div>
              <button
                className="shrink-0 rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-rose-500 hover:text-rose-400"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete(project.id);
                }}
              >
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}