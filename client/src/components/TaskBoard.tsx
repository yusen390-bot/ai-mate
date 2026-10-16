import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_STYLE, TASK_STATUSES, api } from '../api';
import type { CreateTaskInput, Project, ProjectStatus, Task, TaskStatus } from '../api';

type Props = {
  project: Project | null;
  onProjectChanged: () => void;
};

export default function TaskBoard({ project, onProjectChanged }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [criteria, setCriteria] = useState('');
  const [deps, setDeps] = useState<number[]>([]);
  const [approval, setApproval] = useState(false);

  const projectId = project?.id ?? null;

  const load = useCallback(async () => {
    if (projectId === null) {
      setTasks([]);
      return;
    }
    try {
      setTasks(await api.listTasks(projectId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (projectId === null || !title.trim() || busy) return;
    setBusy(true);
    setError(null);
    const input: CreateTaskInput = {
      title: title.trim(),
      dependencies: deps,
      acceptanceCriteria: criteria.trim(),
      requiresApproval: approval,
    };
    try {
      await api.createTask(projectId, input);
      setTitle('');
      setCriteria('');
      setDeps([]);
      setApproval(false);
      await load();
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task: Task, status: TaskStatus) {
    try {
      await api.updateTask(task.id, { status });
      await load();
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function changeProjectStatus(status: ProjectStatus) {
    if (!project) return;
    try {
      await api.updateProject(project.id, { status });
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function removeTask(id: number) {
    try {
      await api.deleteTask(id);
      await load();
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (!project) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
        请在左侧选择或创建一个项目
      </section>
    );
  }

  const titleOf = (id: number) => tasks.find((task) => task.id === id)?.title ?? `#${id}`;

  return (
    <section className="space-y-4">
      <header className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-100">
              #{project.id} {project.title}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">目标：{project.goal}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            项目状态
            <select
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500"
              value={project.status}
              onChange={(e) => void changeProjectStatus(e.target.value as ProjectStatus)}
            >
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          共 {project.taskStats.total} 个任务，已完成 {project.taskStats.done} 个
        </p>
      </header>

      <form className="rounded-xl border border-slate-800 bg-slate-900/40 p-4" onSubmit={onCreate}>
        <h3 className="text-sm font-semibold text-slate-300">新增子任务</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="任务标题，例如：收集 3 个可追溯来源"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="完成标准（验证器将据此判定）"
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
          <label className="flex items-center gap-2">
            前置依赖
            <select
              multiple
              className="h-20 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500"
              value={deps.map(String)}
              onChange={(e) => setDeps(Array.from(e.target.selectedOptions, (o) => Number(o.value)))}
            >
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  #{task.id} {task.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} />
            需要人工审批
          </label>
          <button
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-700"
            type="submit"
            disabled={busy || !title.trim()}
          >
            {busy ? '添加中…' : '添加任务'}
          </button>
        </div>
      </form>

      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}

      <ul className="space-y-2">
        {tasks.length === 0 && (
          <li className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
            还没有子任务。（第 2 周会由模型自动生成计划）
          </li>
        )}
        {tasks.map((task) => (
          <li key={task.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-100">
                  <span className="text-slate-500">#{task.id}</span> {task.title}
                  {task.requiresApproval && (
                    <span className="ml-2 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                      需审批
                    </span>
                  )}
                </p>
                {task.acceptanceCriteria && (
                  <p className="mt-1 text-[11px] text-slate-400">完成标准：{task.acceptanceCriteria}</p>
                )}
                {task.dependencies.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    依赖：{task.dependencies.map((id) => `#${id} ${titleOf(id)}`).join('、')}
                  </p>
                )}
                <p className="mt-1 text-[10px] text-slate-600">
                  计划版本 v{task.planVersion} · 尝试 {task.attempts}/{task.maxAttempts} · 更新于 {task.updatedAt}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TASK_STATUS_STYLE[task.status]}`}>
                  {TASK_STATUS_LABEL[task.status]}
                </span>
                <select
                  className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500"
                  value={task.status}
                  onChange={(e) => void changeStatus(task, e.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {TASK_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 hover:border-rose-500 hover:text-rose-400"
                  type="button"
                  onClick={() => void removeTask(task.id)}
                >
                  删除
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}