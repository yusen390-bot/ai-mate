import { Router } from 'express';
import { PROJECT_TRANSITIONS, canTransition } from '../../../shared/types.ts';
import type { PlanDraft } from '../../../shared/types.ts';
import { getPlan, getProject, savePlan, updateProject } from '../db.ts';
import { AppError } from '../middleware/error.ts';
import { validate } from '../middleware/validate.ts';
import { planDraftSchema } from '../schemas.ts';
import { generatePlan } from '../services/planner.ts';
import { assertPlanConsistent } from '../services/planRules.ts';

/** 挂载在 /api/projects/:projectId/plan 下 */
export const planRouter = Router({ mergeParams: true });

// 确认前都允许（重新）生成/保存计划；进入 running 之后必须走重新规划流程
const PLANNABLE: string[] = ['draft', 'planning', 'awaiting_confirmation', 'failed'];

function projectOr404(projectIdRaw: unknown) {
  const projectId = Number(projectIdRaw);
  const project = getProject(projectId);
  if (!project) throw new AppError('PROJECT_NOT_FOUND', `项目 ${projectId} 不存在`, 404);
  return project;
}

/** 生成计划（只预览，不落库） */
planRouter.post('/generate', async (req, res) => {
  const project = projectOr404((req.params as Record<string, string | undefined>).projectId);
  if (!PLANNABLE.includes(project.status)) {
    throw new AppError('INVALID_STATE', `项目当前状态「${project.status}」不能生成计划`, 409, {
      status: project.status,
      allowed: PLANNABLE,
    });
  }

  const { plan, model, rawOutput } = await generatePlan(project.goal);

  // 首次生成时把项目推进到 planning（draft -> planning 合法）
  if (project.status === 'draft') {
    updateProject(project.id, { status: 'planning' });
  }

  res.json({ projectId: project.id, plan, model, rawOutput: rawOutput.slice(0, 1000) });
});

/** 保存用户编辑后的计划（写库 + 版本 +1 + 待确认） */
planRouter.put('/', validate(planDraftSchema), (req, res) => {
  const project = projectOr404((req.params as Record<string, string | undefined>).projectId);
  if (!PLANNABLE.includes(project.status)) {
    throw new AppError('INVALID_STATE', `项目当前状态「${project.status}」不能保存计划`, 409, {
      status: project.status,
      allowed: PLANNABLE,
    });
  }

  const plan = assertPlanConsistent(req.body as PlanDraft);
  const saved = savePlan(project.id, plan, { source: 'manual' });

  res.json({
    version: saved.version,
    tasks: saved.tasks,
    project: getProject(project.id),
  });
});

/** 当前计划 + 历史版本 */
planRouter.get('/', (req, res) => {
  const project = projectOr404((req.params as Record<string, string | undefined>).projectId);
  res.json({ projectId: project.id, ...getPlan(project.id) });
});

/** 确认执行：awaiting_confirmation -> running（W2 只切状态） */
planRouter.post('/confirm', (req, res) => {
  const project = projectOr404((req.params as Record<string, string | undefined>).projectId);

  if (!canTransition(PROJECT_TRANSITIONS, project.status, 'running')) {
    throw new AppError('INVALID_TRANSITION', `项目状态不能从「${project.status}」进入「running」`, 409, {
      from: project.status,
      to: 'running',
      allowed: PROJECT_TRANSITIONS[project.status],
    });
  }

  const plan = getPlan(project.id);
  if (plan.tasks.length === 0) {
    throw new AppError('PLAN_EMPTY', '还没有已保存的计划任务，无法确认执行', 409);
  }

  res.json({
    project: updateProject(project.id, { status: 'running' }),
    version: plan.version,
    note: 'W2 只切换状态；真正的执行引擎在 W3 接入',
  });
});