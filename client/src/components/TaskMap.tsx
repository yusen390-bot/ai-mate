import type { Task } from '../api';
import { TASK_STATUS_LABEL, TASK_STATUS_STYLE } from '../api';

type Props = {
  tasks: Task[];
  onSelect: (id: number) => void;
};

const CARD_W = 220;
const CARD_H = 96;
const COL_GAP = 90;
const ROW_GAP = 16;
const PAD = 16;

export default function TaskMap({ tasks, onSelect }: Props) {
  if (tasks.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
        还没有任务，先添加或生成计划。
      </section>
    );
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const depthCache = new Map<number, number>();

  const depthOf = (task: Task, seen: Set<number>): number => {
    const cached = depthCache.get(task.id);
    if (cached !== undefined) return cached;
    if (seen.has(task.id)) return 0;
    seen.add(task.id);
    const deps = task.dependencies.map((id) => byId.get(id)).filter((item): item is Task => Boolean(item));
    const value = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => depthOf(dep, seen))) + 1;
    depthCache.set(task.id, value);
    return value;
  };

  for (const task of tasks) depthOf(task, new Set());

  const layers: Task[][] = [];
  for (const task of tasks) {
    const layer = depthCache.get(task.id) ?? 0;
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(task);
  }

  const positions = new Map<number, { x: number; y: number }>();
  layers.forEach((column, columnIndex) => {
    column.forEach((task, rowIndex) => {
      positions.set(task.id, {
        x: PAD + columnIndex * (CARD_W + COL_GAP),
        y: PAD + rowIndex * (CARD_H + ROW_GAP),
      });
    });
  });

  const columns = Math.max(layers.length, 1);
  const maxRows = Math.max(...layers.map((column) => column.length), 1);
  const width = PAD * 2 + columns * CARD_W + (columns - 1) * COL_GAP;
  const height = PAD * 2 + maxRows * CARD_H + (maxRows - 1) * ROW_GAP;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>任务地图（按依赖层级排列，箭头表示前置依赖）</span>
        <span>共 {tasks.length} 个任务</span>
      </div>
      <div className="overflow-auto">
        <div className="relative" style={{ width, height }}>
          <svg className="absolute inset-0" width={width} height={height}>
            <defs>
              <marker id="dep-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#475569" />
              </marker>
            </defs>
            {tasks.flatMap((task) =>
              task.dependencies.map((depId) => {
                const from = positions.get(depId);
                const to = positions.get(task.id);
                if (!from || !to) return null;
                const x1 = from.x + CARD_W;
                const y1 = from.y + CARD_H / 2;
                const x2 = to.x;
                const y2 = to.y + CARD_H / 2;
                const midX = (x1 + x2) / 2;
                return (
                  <path
                    key={`${depId}-${task.id}`}
                    d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                    stroke="#475569"
                    strokeWidth="1.5"
                    fill="none"
                    markerEnd="url(#dep-arrow)"
                  />
                );
              }),
            )}
          </svg>

          {tasks.map((task) => {
            const pos = positions.get(task.id);
            if (!pos) return null;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelect(task.id)}
                className={`absolute cursor-pointer rounded-lg border bg-slate-900 px-3 py-2 text-left transition hover:border-sky-500 ${TASK_STATUS_STYLE[task.status]}`}
                style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
                title={task.title}
              >
                <div className="flex items-center justify-between text-[10px] opacity-80">
                  <span className="font-mono">#{task.id}</span>
                  <span className="rounded bg-slate-950/60 px-1.5 py-0.5">{TASK_STATUS_LABEL[task.status]}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs font-medium text-slate-100">{task.title}</div>
                <div className="mt-1 text-[10px] text-slate-500">
                  依赖 {task.dependencies.length} · 尝试 {task.attempts}/{task.maxAttempts}
                  {task.requiresApproval ? ' · 需审批' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}