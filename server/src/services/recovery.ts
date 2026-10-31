import { interruptRunningTasks } from '../db.ts';

/**
 * 启动时恢复策略：
 * running 任务可能已经产生外部副作用，不盲目重跑，统一转 needs_review 等人工确认。
 */
export function recoverOnStartup(): { changed: number; message: string } {
  const changed = interruptRunningTasks();
  const message =
    changed > 0
      ? `检测到 ${changed} 条中断的执行记录，已转为 needs_review 等待人工确认`
      : '没有需要恢复的中断任务';
  console.log(`启动恢复：${message}`);
  return { changed, message };
}