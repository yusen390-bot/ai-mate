import type { Task } from '../../../shared/types.ts';
import {
  addArtifact,
  finishRun,
  getProject,
  listRuns,
  listTasks,
  recordRunStart,
  setTaskStatus,
  updateProject,
} from '../db.ts';
import { resolveTool, tools } from './tools.ts';
import { verifyOutput } from './verifier.ts';

const running = new Set<number>();

export function isProjectRunning(projectId: number): boolean {
  return running.has(projectId);
}

export type RunOutcome = { ok: boolean; message: string };

/**
 * 执行器：按依赖顺序执行任务，失败有限重试，遇到需审批任务则暂停。
 * 模型不参与状态控制——状态只由本文件的程序逻辑和验证器修改。
 */
export async function runProject(projectId: number): Promise<RunOutcome> {
  if (running.has(projectId)) return { ok: false, message: '项目正在执行中' };
  running.add(projectId);

  try {
    for (;;) {
      const project = getProject(projectId);
      if (!project) return { ok: false, message: '项目不存在' };
      if (project.status !== 'running') {
        return { ok: true, message: `项目状态为 ${project.status}，停止执行` };
      }

      const tasks = listTasks(projectId);
      const byId = new Map(tasks.map((task) => [task.id, task]));

      // 1) 找可执行任务：pending 且所有依赖已 succeeded
      const runnable = tasks.filter(
        (t) => t.status === 'pending' && t.dependencies.every((depId) => byId.get(depId)?.status === 'succeeded'),
      );

      // 2) 只有"即将执行"的任务需要审批时才暂停（不能被后面还没轮到的审批任务提前拦住）
      const needApproval = runnable.find((t) => t.requiresApproval && !t.approved);
      if (needApproval) {
        setTaskStatus(needApproval.id, 'needs_review');
        updateProject(projectId, { status: 'awaiting_confirmation' });
        return { ok: true, message: `任务「${needApproval.title}」需要人工批准，已暂停` };
      }

      if (runnable.length === 0) {
        if (tasks.length > 0 && tasks.every((t) => t.status === 'succeeded')) {
          updateProject(projectId, { status: 'done' });
          return { ok: true, message: '全部任务已完成' };
        }
        updateProject(projectId, { status: 'failed' });
        return { ok: true, message: '没有可执行的任务（依赖未满足或任务失败）' };
      }

      await executeTask(projectId, runnable[0], byId);
    }
  } finally {
    running.delete(projectId);
  }
}

async function executeTask(projectId: number, task: Task, byId: Map<number, Task>): Promise<void> {
  const attempt = task.attempts + 1;
  setTaskStatus(task.id, 'running', { attempts: attempt });

  const runId = recordRunStart(task.id, attempt, JSON.stringify({ title: task.title, tool: task.tool }));

  const dependencyOutputs = task.dependencies.map((depId) => {
    const dep = byId.get(depId);
    if (!dep) return { title: `#${depId}`, output: '' };
    const succeeded = listRuns(dep.id).filter((run) => run.status === 'succeeded');
    const last = succeeded[succeeded.length - 1];
    return { title: dep.title, output: last?.output ?? '' };
  });

  const toolName = resolveTool(task);
  const project = getProject(projectId);

  try {
    const result = await tools[toolName]({
      goal: project?.goal ?? '',
      task,
      dependencyOutputs,
    });

    if (result.artifact) {
      addArtifact({
        taskId: task.id,
        projectId,
        type: result.artifact.type,
        name: result.artifact.name,
        content: result.artifact.content,
      });
    }

    const verdict = verifyOutput(toolName, result.output, task);
    if (verdict.ok) {
      finishRun(runId, 'succeeded', result.output, null);
      setTaskStatus(task.id, 'succeeded', { lastError: null });
      return;
    }

    const error = verdict.issues.join('；');
    finishRun(runId, 'failed', result.output, error);
    retryOrFail(task, error);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishRun(runId, 'failed', null, message);
    retryOrFail(task, message);
  }
}

function retryOrFail(task: Task, error: string): void {
  const attempt = task.attempts + 1;
  if (attempt < task.maxAttempts) {
    setTaskStatus(task.id, 'pending', { lastError: error });
  } else {
    setTaskStatus(task.id, 'failed', { lastError: error });
  }
}