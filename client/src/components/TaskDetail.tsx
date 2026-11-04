import type { Artifact, ProjectRunInfo, Task } from '../api';
import { TASK_STATUS_LABEL, TASK_STATUS_STYLE } from '../api';

type Props = {
  task: Task;
  runs: ProjectRunInfo[];
  artifacts: Artifact[];
  onClose: () => void;
  onRetry: (id: number) => void;
  onApprove: (id: number) => void;
};

export default function TaskDetail({ task, runs, artifacts, onClose, onRetry, onApprove }: Props) {
  const taskRuns = runs.filter((run) => run.taskId === task.id);
  const taskArtifacts = artifacts.filter((artifact) => artifact.taskId === task.id);

  return (
    <section className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-sky-200">
            #{task.id} {task.title}
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            {task.description || '（无说明）'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TASK_STATUS_STYLE[task.status]}`}>
            {TASK_STATUS_LABEL[task.status]}
          </span>
          <button
            className="rounded border border-slate-600 px-2 py-0.5 text-[11px] text-slate-300"
            type="button"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>

      <dl className="mt-3 grid gap-2 text-[11px] text-slate-400 md:grid-cols-2">
        <div>
          <dt className="text-slate-500">完成标准</dt>
          <dd className="text-slate-300">{task.acceptanceCriteria || '（未设置）'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">工具 / 尝试</dt>
          <dd className="text-slate-300">
            {task.tool} · {task.attempts}/{task.maxAttempts}
            {task.requiresApproval ? ` · 审批=${task.approved ? '已批准' : '待批准'}` : ''}
          </dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-slate-500">最近错误</dt>
          <dd className={task.lastError ? 'text-rose-300' : 'text-slate-500'}>{task.lastError || '（无）'}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {task.status === 'needs_review' && task.requiresApproval && (
          <button
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
            type="button"
            onClick={() => onApprove(task.id)}
          >
            批准并继续
          </button>
        )}
        {(task.status === 'failed' || task.status === 'needs_review') && (
          <button
            className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white"
            type="button"
            onClick={() => onRetry(task.id)}
          >
            重试任务
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400">执行记录（{taskRuns.length}）</h4>
          <ul className="mt-1 space-y-1 text-[11px]">
            {taskRuns.length === 0 && <li className="text-slate-500">暂无</li>}
            {taskRuns.map((run) => (
              <li key={run.id} className="text-slate-400">
                #{run.id} 第{run.attempt}次{' '}
                <span className={run.status === 'succeeded' ? 'text-emerald-400' : 'text-rose-400'}>{run.status}</span>
                {run.error && <span className="text-rose-300">（{run.error.slice(0, 60)}）</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[11px] font-semibold text-slate-400">产物（{taskArtifacts.length}）</h4>
          <ul className="mt-1 space-y-1 text-[11px]">
            {taskArtifacts.length === 0 && <li className="text-slate-500">暂无</li>}
            {taskArtifacts.map((artifact) => (
              <li key={artifact.id} className="text-slate-400">
                [{artifact.type}] {artifact.name}（{artifact.content.length} 字符）
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}