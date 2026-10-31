import { Router } from 'express';
import { PROJECT_TRANSITIONS, canTransition } from '../../../shared/types.ts';
import { approveTask, getProject, getTask, listProjectRuns, updateProject } from '../db.ts';
import { AppError } from '../middleware/error.ts';
import { validate } from '../middleware/validate.ts';
import { idParamSchema } from '../schemas.ts';
import { isProjectRunning, runProject } from '../services/executor.ts';

/** 挂载在 /api 下 */
export const executionRouter = Router();

/** 启动 / 继续执行（异步，立即返回 202） */
executionRouter.post('/projects/:id/run', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  const project = getProject(id);
  if (!project) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  if (project.status !== 'running') {
    throw new AppError('INVALID_STATE', `项目状态「${project.status}」不能执行`, 409, { status: project.status });
  }
  if (isProjectRunning(id)) {
    res.json({ started: false, message: '项目正在执行中' });
    return;
  }
  void runProject(id);
  res.status(202).json({ started: true, projectId: id });
});

/** 执行日志：每次尝试的输入/输出/错误 */
executionRouter.get('/projects/:id/runs', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  const project = getProject(id);
  if (!project) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  res.json({ project, runs: listProjectRuns(id), executing: isProjectRunning(id) });
});

/** 人工批准暂停的任务 → 回到 pending 并继续执行 */
executionRouter.post('/tasks/:id/approve', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  const task = getTask(id);
  if (!task) throw new AppError('TASK_NOT_FOUND', `任务 ${id} 不存在`, 404);
  if (!task.requiresApproval) throw new AppError('NOT_REQUIRES_APPROVAL', '该任务不需要人工审批', 409);
  if (task.status !== 'needs_review') {
    throw new AppError('INVALID_STATE', `任务状态「${task.status}」不是待审批`, 409, { status: task.status });
  }

  approveTask(id);

  const project = getProject(task.projectId);
  if (project && canTransition(PROJECT_TRANSITIONS, project.status, 'running')) {
    updateProject(project.id, { status: 'running' });
  }
  void runProject(task.projectId);

  res.json({ task: getTask(id), project: getProject(task.projectId) });
});