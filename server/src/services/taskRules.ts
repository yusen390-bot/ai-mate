import { listTasks } from '../db.ts';
import { AppError } from '../middleware/error.ts';

/**
 * 依赖合法性校验（方案书要求：有依赖的任务不能被提前执行，依赖必须真实存在）
 * - 不能重复
 * - 不能依赖自己
 * - 必须存在且属于同一个项目
 */
export function assertDependenciesValid(projectId: number, dependencies: number[], selfId: number | null): void {
  if (dependencies.length === 0) return;

  if (new Set(dependencies).size !== dependencies.length) {
    throw new AppError('DEPENDENCY_DUPLICATED', '依赖里存在重复的任务 id', 400);
  }
  if (selfId !== null && dependencies.includes(selfId)) {
    throw new AppError('DEPENDENCY_SELF', '任务不能依赖自身', 400);
  }

  const ids = new Set(listTasks(projectId).map((task) => task.id));
  const missing = dependencies.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    throw new AppError(
      'DEPENDENCY_NOT_FOUND',
      `依赖的任务不存在或不属于本项目：${missing.join(', ')}`,
      400,
      { missing },
    );
  }
}