import { useState } from 'react';
import { api } from '../api';
import type { PlanDraft, PlanTaskDraft, Project } from '../api';

type Props = {
  project: Project;
  initialPlan: PlanDraft | null;
  onSaved: () => void;
  onClose: () => void;
};

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-500';
const smallInputClass =
  'rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none focus:border-sky-500';

export default function PlanEditor({ project, initialPlan, onSaved, onClose }: Props) {
  const [plan, setPlan] = useState<PlanDraft | null>(initialPlan);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.generatePlan(project.id);
      setPlan(res.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function patchTask(index: number, patch: Partial<PlanTaskDraft>) {
    setPlan((prev) =>
      prev
        ? { ...prev, tasks: prev.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)) }
        : prev,
    );
  }

  function addTask() {
    setPlan((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.tasks.map((t) => t.ref));
      let n = prev.tasks.length + 1;
      while (used.has(`t${n}`)) n += 1;
      return {
        ...prev,
        tasks: [
          ...prev.tasks,
          {
            ref: `t${n}`,
            title: '',
            description: '',
            acceptanceCriteria: '',
            requiresApproval: false,
            dependsOn: [],
          },
        ],
      };
    });
  }

  function removeTask(index: number) {
    setPlan((prev) => {
      if (!prev) return prev;
      const removed = prev.tasks[index].ref;
      return {
        ...prev,
        tasks: prev.tasks
          .filter((_, i) => i !== index)
          .map((task) => ({ ...task, dependsOn: task.dependsOn.filter((ref) => ref !== removed) })),
      };
    });
  }

  async function save() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      await api.savePlan(project.id, plan);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!plan) {
    return (
      <section className="rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
        <h3 className="text-sm font-semibold text-sky-200">用 AI 生成计划</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">目标：{project.goal}</p>
        <div className="mt-3 flex gap-2">
          <button
            className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-medium text-white disabled:bg-slate-700"
            type="button"
            onClick={() => void generate()}
            disabled={loading}
          >
            {loading ? '模型规划中…' : '调用模型生成计划'}
          </button>
          <button className="rounded-lg border border-slate-600 px-4 py-1.5 text-sm text-slate-300" type="button" onClick={onClose}>
            取消
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
      </section>
    );
  }

  const refs = plan.tasks.map((task) => task.ref);

  return (
    <section className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-sky-200">计划编辑（保存后等待确认，不会自动执行）</h3>
        <div className="flex gap-2 text-xs">
          <button
            className="rounded border border-slate-600 px-3 py-1 text-slate-300 disabled:opacity-50"
            type="button"
            onClick={() => void generate()}
            disabled={loading || saving}
          >
            {loading ? '重新生成中…' : '重新生成'}
          </button>
          <button
            className="rounded bg-emerald-600 px-3 py-1 font-medium text-white disabled:bg-slate-700"
            type="button"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? '保存中…' : '保存计划'}
          </button>
          <button className="rounded border border-slate-600 px-3 py-1 text-slate-300" type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>

      <label className="block text-xs text-slate-400">
        计划摘要
        <input
          className={`${inputClass} mt-1`}
          value={plan.summary}
          onChange={(e) => setPlan({ ...plan, summary: e.target.value })}
        />
      </label>

      <div className="space-y-2">
        {plan.tasks.map((task, index) => (
          <div key={task.ref} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-slate-300">{task.ref}</span>
              <label className="flex items-center gap-1">
                依赖
                <select
                  multiple
                  className="h-16 min-w-24 rounded border border-slate-700 bg-slate-950 px-1 text-[11px]"
                  value={task.dependsOn}
                  onChange={(e) =>
                    patchTask(index, { dependsOn: Array.from(e.target.selectedOptions, (o) => o.value) })
                  }
                >
                  {refs
                    .filter((ref) => ref !== task.ref)
                    .map((ref) => (
                      <option key={ref} value={ref}>
                        {ref}
                      </option>
                    ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={task.requiresApproval}
                  onChange={(e) => patchTask(index, { requiresApproval: e.target.checked })}
                />
                需人工审批
              </label>
              <button
                className="ml-auto rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-400 hover:border-rose-500 hover:text-rose-400"
                type="button"
                onClick={() => removeTask(index)}
              >
                删除
              </button>
            </div>

            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input
                className={smallInputClass}
                placeholder="任务标题"
                value={task.title}
                onChange={(e) => patchTask(index, { title: e.target.value })}
              />
              <input
                className={smallInputClass}
                placeholder="完成标准（可验证）"
                value={task.acceptanceCriteria}
                onChange={(e) => patchTask(index, { acceptanceCriteria: e.target.value })}
              />
            </div>
            <input
              className={`${smallInputClass} mt-2 w-full`}
              placeholder="任务说明（可选）"
              value={task.description}
              onChange={(e) => patchTask(index, { description: e.target.value })}
            />
          </div>
        ))}
      </div>

      <button
        className="w-full rounded-lg border border-dashed border-slate-600 py-2 text-xs text-slate-400 hover:border-sky-500 hover:text-sky-300"
        type="button"
        onClick={addTask}
      >
        + 添加任务
      </button>

      {error && <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>}
    </section>
  );
}