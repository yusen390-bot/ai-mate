import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { PROJECT_STATUS_LABEL, PROJECT_TRANSITIONS, TASK_STATUS_LABEL, TASK_STATUS_STYLE, TASK_TRANSITIONS, allowedNext, api } from '../api';
import type { Artifact, CreateTaskInput, PlanDraft, Project, ProjectRunInfo, ProjectStatus, Task, TaskStatus } from '../api';
import PlanEditor from './PlanEditor';
import TaskDetail from './TaskDetail';
import TaskMap from './TaskMap';

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

  const [planVersion, setPlanVersion] = useState(0);
  const [showPlan, setShowPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [runs, setRuns] = useState<ProjectRunInfo[]>([]);
  const [executing, setExecuting] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

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

  const loadPlan = useCallback(async () => {
    if (projectId === null) {
      setPlanVersion(0);
      return;
    }
    try {
      const plan = await api.getPlan(projectId);
      setPlanVersion(plan.version);
    } catch {
      /* 计划信息仅用于展示，失败不打断主流程 */
    }
  }, [projectId]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const loadRuns = useCallback(async () => {
    if (projectId === null) {
      setRuns([]);
      return;
    }
    try {
      const data = await api.getProjectRuns(projectId);
      setRuns(data.runs);
      setExecuting(data.executing);
      setArtifacts(await api.listArtifacts(projectId));
    } catch {
      /* 执行日志仅用于展示 */
    }
  }, [projectId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function runNow() {
    if (projectId === null) return;
    setError(null);
    try {
      await api.runProject(projectId);
      window.setTimeout(() => {
        void load();
        void loadRuns();
        onProjectChanged();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function approveAndContinue(taskId: number) {
    setError(null);
    try {
      await api.approveTask(taskId);
      void load();
      void loadRuns();
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  /** 把当前任务转回可编辑的计划草稿（ref 按顺序重建） */
  function tasksToDraft(): PlanDraft {
    const refById = new Map<number, string>();
    tasks.forEach((task, index) => refById.set(task.id, `t${index + 1}`));
    return {
      summary: `计划 v${planVersion}（手动调整）`,
      tasks: tasks.map((task, index) => ({
        ref: `t${index + 1}`,
        title: task.title,
        description: task.description,
        acceptanceCriteria: task.acceptanceCriteria,
        requiresApproval: task.requiresApproval,
        tool: task.tool,
        dependsOn: task.dependencies.map((id) => refById.get(id)).filter((ref): ref is string => Boolean(ref)),
      })),
    };
  }

  async function confirmPlan() {
    if (projectId === null) return;
    setError(null);
    try {
      await api.confirmPlan(projectId);
      await load();
      onProjectChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onPlanSaved() {
    setShowPlan(false);
    setPlanDraft(null);
    void load();
    void loadPlan();
    onProjectChanged();
  }

  async function retryOne(taskId: number) {
    setError(null);
    try {
      await api.retryTask(taskId);
      window.setTimeout(() => {
        void load();
        void loadRuns();
        onProjectChanged();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function retryFailed() {
    const failed = tasks.filter((task) => task.status === 'failed');
    if (failed.length === 0) return;
    setError(null);
    try {
      for (const task of failed) await api.retryTask(task.id);
      window.setTimeout(() => {
        void load();
        void loadRuns();
        onProjectChanged();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
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
              {allowedNext(PROJECT_TRANSITIONS, project.status).map((status) => (
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

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-slate-400">
            计划 {planVersion > 0 ? `v${planVersion}` : '未生成'}
          </span>
          {(project.status === 'draft' ||
            project.status === 'planning' ||
            project.status === 'awaiting_confirmation' ||
            project.status === 'failed') && (
            <button
              className="rounded bg-sky-600 px-3 py-1 font-medium text-white"
              type="button"
              onClick={() => {
                setPlanDraft(null);
                setShowPlan(true);
              }}
            >
              用 AI 生成计划
            </button>
          )}
          {planVersion > 0 && project.status !== 'running' && (
            <button
              className="rounded border border-slate-600 px-3 py-1 text-slate-300"
              type="button"
              onClick={() => {
                setPlanDraft(tasksToDraft());
                setShowPlan(true);
              }}
            >
              编辑计划
            </button>
          )}
          {project.status === 'awaiting_confirmation' && (
            <button
              className="rounded bg-emerald-600 px-3 py-1 font-medium text-white"
              type="button"
              onClick={() => void confirmPlan()}
            >
              确认执行
            </button>
          )}
          {project.status === 'running' && (
            <button
              className="rounded bg-indigo-600 px-3 py-1 font-medium text-white disabled:bg-slate-700"
              type="button"
              onClick={() => void runNow()}
              disabled={executing}
            >
              {executing ? '执行中…' : '执行 / 继续'}
            </button>
          )}
          <button
            className="rounded border border-slate-600 px-3 py-1 text-slate-300"
            type="button"
            onClick={() => {
              void load();
              void loadRuns();
              void loadPlan();
              onProjectChanged();
            }}
          >
            刷新执行日志
          </button>          <button
            className={view === 'list' ? 'rounded bg-slate-700 px-3 py-1 text-white' : 'rounded border border-slate-600 px-3 py-1 text-slate-300'}
            type="button"
            onClick={() => setView('list')}
          >
            列表
          </button>
          <button
            className={view === 'map' ? 'rounded bg-slate-700 px-3 py-1 text-white' : 'rounded border border-slate-600 px-3 py-1 text-slate-300'}
            type="button"
            onClick={() => setView('map')}
          >
            任务地图
          </button>
          {project.status === 'awaiting_confirmation' && tasks.some((task) => task.status === 'needs_review') && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">
              有任务等待人工批准
            </span>
          )}
          {project.status === 'failed' && (
            <>
              <button
                className="rounded bg-amber-600 px-3 py-1 font-medium text-white"
                type="button"
                onClick={() => void retryFailed()}
              >
                重试失败任务
              </button>
              <button
                className="rounded border border-slate-600 px-3 py-1 text-slate-300"
                type="button"
                onClick={() => {
                  setPlanDraft(null);
                  setShowPlan(true);
                }}
              >
                重新规划
              </button>
            </>
          )}        </div>
      </header>

      {showPlan && (
        <PlanEditor
          project={project}
          initialPlan={planDraft}
          onSaved={onPlanSaved}
          onClose={() => {
            setShowPlan(false);
            setPlanDraft(null);
          }}
        />
      )}

      {view === 'map' && <TaskMap tasks={tasks} onSelect={setSelectedTaskId} />}

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          runs={runs}
          artifacts={artifacts}
          onClose={() => setSelectedTaskId(null)}
          onRetry={(id) => void retryOne(id)}
          onApprove={(id) => void approveAndContinue(id)}
        />
      )}
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
                  {allowedNext(TASK_TRANSITIONS, task.status).map((status) => (
                    <option key={status} value={status}>
                      {TASK_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                {task.status === 'needs_review' && task.requiresApproval && (
                  <button
                    className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white"
                    type="button"
                    onClick={() => void approveAndContinue(task.id)}
                  >
                    批准并继续
                  </button>
                )}                <button
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

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="text-sm font-semibold text-slate-300">
          执行日志 <span className="text-slate-500">({runs.length})</span>
        </h3>
        {runs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">还没有执行记录。</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[11px]">
            {runs.slice(0, 20).map((run) => (
              <li key={run.id} className="flex flex-wrap items-center gap-2 text-slate-400">
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">#{run.id}</span>
                <span className="text-slate-300">{run.taskTitle}</span>
                <span>第 {run.attempt} 次</span>
                <span
                  className={
                    run.status === 'succeeded'
                      ? 'text-emerald-400'
                      : run.status === 'failed'
                        ? 'text-rose-400'
                        : 'text-sky-400'
                  }
                >
                  {run.status}
                </span>
                {run.error && <span className="text-rose-300">（{run.error.slice(0, 80)}）</span>}
              </li>
            ))}
          </ul>
        )}
      </section>    </section>
  );
}