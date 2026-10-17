import { Router } from 'express';
import { TASK_TRANSITIONS, canTransition } from '../../../shared/types.ts';
import { deleteTask, getTask, listRuns, updateTask } from '../db.ts';
import { AppError } from '../middleware/error.ts';
import { validate, validateNonEmptyBody } from '../middleware/validate.ts';
import type { UpdateTaskInput } from '../schemas.ts';
import { idParamSchema, updateTaskSchema } from '../schemas.ts';
import { assertDependenciesValid } from '../services/taskRules.ts';

export const tasksRouter = Router();

tasksRouter.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  const task = getTask(id);
  if (!task) throw new AppError('TASK_NOT_FOUND', `任务 ${id} 不存在`, 404);
  res.json({ ...task, runs: listRuns(id) });
});

tasksRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validateNonEmptyBody(),
  validate(updateTaskSchema),
  (req, res) => {
    const id = Number(req.params.id);
    const task = getTask(id);
    if (!task) throw new AppError('TASK_NOT_FOUND', `任务 ${id} 不存在`, 404);

    const patch = req.body as UpdateTaskInput;

    // 状态流转白名单
    if (patch.status && !canTransition(TASK_TRANSITIONS, task.status, patch.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        `任务状态不能从「${task.status}」直接变为「${patch.status}」`,
        409,
        { from: task.status, to: patch.status, allowed: TASK_TRANSITIONS[task.status] },
      );
    }

    if (patch.dependencies !== undefined) {
      assertDependenciesValid(task.projectId, patch.dependencies, id);
    }

    res.json(updateTask(id, patch));
  },
);

tasksRouter.delete('/:id', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  if (!deleteTask(id)) throw new AppError('TASK_NOT_FOUND', `任务 ${id} 不存在`, 404);
  res.status(204).end();
});