import { Router } from 'express';
import { PROJECT_TRANSITIONS, canTransition } from '../../../shared/types.ts';
import {
  createProject,
  createTask,
  deleteProject,
  getProject,
  listArtifacts,
  listProjects,
  listTasks,
  updateProject,
} from '../db.ts';
import { AppError } from '../middleware/error.ts';
import { validate, validateNonEmptyBody } from '../middleware/validate.ts';
import type { CreateProjectInput, CreateTaskInput, UpdateProjectInput } from '../schemas.ts';
import { createProjectSchema, createTaskSchema, idParamSchema, updateProjectSchema } from '../schemas.ts';
import { assertDependenciesValid } from '../services/taskRules.ts';

export const projectsRouter = Router();

projectsRouter.post('/', validate(createProjectSchema), (req, res) => {
  res.status(201).json(createProject(req.body as CreateProjectInput));
});

projectsRouter.get('/', (_req, res) => {
  res.json({ projects: listProjects() });
});

projectsRouter.get('/:id', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  const project = getProject(id);
  if (!project) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  res.json({ ...project, tasks: listTasks(id) });
});

projectsRouter.patch(
  '/:id',
  validate(idParamSchema, 'params'),
  validateNonEmptyBody(),
  validate(updateProjectSchema),
  (req, res) => {
    const id = Number(req.params.id);
    const project = getProject(id);
    if (!project) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);

    const patch = req.body as UpdateProjectInput;

    // 状态流转白名单：非法跳转（例如 draft -> done）直接拒绝
    if (patch.status && !canTransition(PROJECT_TRANSITIONS, project.status, patch.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        `项目状态不能从「${project.status}」直接变为「${patch.status}」`,
        409,
        { from: project.status, to: patch.status, allowed: PROJECT_TRANSITIONS[project.status] },
      );
    }

    res.json(updateProject(id, patch));
  },
);

projectsRouter.delete('/:id', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  if (!deleteProject(id)) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  res.status(204).end();
});

projectsRouter.get('/:id/tasks', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  if (!getProject(id)) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  res.json({ tasks: listTasks(id) });
});

projectsRouter.post('/:id/tasks', validate(idParamSchema, 'params'), validate(createTaskSchema), (req, res) => {
  const projectId = Number(req.params.id);
  if (!getProject(projectId)) throw new AppError('PROJECT_NOT_FOUND', `项目 ${projectId} 不存在`, 404);

  const input = req.body as CreateTaskInput;
  assertDependenciesValid(projectId, input.dependencies ?? [], null);
  res.status(201).json(createTask(projectId, input));
});

projectsRouter.get('/:id/artifacts', validate(idParamSchema, 'params'), (req, res) => {
  const id = Number(req.params.id);
  if (!getProject(id)) throw new AppError('PROJECT_NOT_FOUND', `项目 ${id} 不存在`, 404);
  res.json({ artifacts: listArtifacts(id) });
});