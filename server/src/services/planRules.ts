import type { PlanDraft, PlanTaskDraft } from '../../../shared/types.ts';
import { AppError } from '../middleware/error.ts';
import { planDraftSchema } from '../schemas.ts';

/** 从模型输出里提取 JSON：容忍 ```json 包裹与前后多余文字 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();

  try {
    return JSON.parse(candidate);
  } catch {
    /* 继续尝试截取第一个对象 */
  }

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      /* 落到下面统一报错 */
    }
  }

  throw new AppError('PLAN_INVALID', '模型没有返回合法的 JSON 计划', 422, { raw: trimmed.slice(0, 500) });
}

/** 解析 + Zod 校验 + 依赖一致性/环检测（纯函数，便于单测） */
export function parsePlanOutput(text: string): PlanDraft {
  const raw = extractJson(text);
  const parsed = planDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError('PLAN_INVALID', '计划格式不合法', 422, {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'plan', message: i.message })),
    });
  }
  return assertPlanConsistent(parsed.data as PlanDraft);
}

/**
 * 依赖一致性校验：
 * - ref 唯一
 * - 依赖必须存在、不重复、不指向自己
 * - 依赖关系无环（Kahn 拓扑排序）
 */
export function assertPlanConsistent(plan: PlanDraft): PlanDraft {
  const refs = new Set<string>();
  for (const task of plan.tasks) {
    if (refs.has(task.ref)) {
      throw new AppError('PLAN_INVALID', `ref 重复：${task.ref}`, 422, { ref: task.ref });
    }
    refs.add(task.ref);
  }

  for (const task of plan.tasks) {
    if (new Set(task.dependsOn).size !== task.dependsOn.length) {
      throw new AppError('PLAN_INVALID', `任务 ${task.ref} 的依赖有重复`, 422, { ref: task.ref });
    }
    for (const dep of task.dependsOn) {
      if (dep === task.ref) {
        throw new AppError('PLAN_INVALID', `任务 ${task.ref} 不能依赖自己`, 422, { ref: task.ref });
      }
      if (!refs.has(dep)) {
        throw new AppError('PLAN_DEPENDENCY', `任务 ${task.ref} 依赖了不存在的 ${dep}`, 422, {
          ref: task.ref,
          missing: dep,
        });
      }
    }
  }

  if (hasCycle(plan.tasks)) {
    throw new AppError('PLAN_CYCLIC', '计划的依赖关系存在环，无法执行', 422);
  }
  return plan;
}

function hasCycle(tasks: PlanTaskDraft[]): boolean {
  const indegree = new Map<string, number>();
  const edges = new Map<string, string[]>();

  for (const task of tasks) {
    indegree.set(task.ref, task.dependsOn.length);
    edges.set(task.ref, []);
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn) edges.get(dep)?.push(task.ref);
  }

  const queue: string[] = [];
  for (const [ref, n] of indegree) if (n === 0) queue.push(ref);

  let visited = 0;
  while (queue.length > 0) {
    const ref = queue.shift() as string;
    visited += 1;
    for (const next of edges.get(ref) ?? []) {
      const n = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, n);
      if (n === 0) queue.push(next);
    }
  }
  return visited !== tasks.length;
}