import { z } from 'zod';
import { PROJECT_STATUSES, TASK_STATUSES } from '../../shared/types.ts';
import type { ProjectStatus, TaskStatus } from '../../shared/types.ts';

// 状态词表来自 shared/types.ts（与前端共用同一份定义）
export { PROJECT_STATUSES, TASK_STATUSES };
export type { ProjectStatus, TaskStatus };

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const taskStatusSchema = z.enum(TASK_STATUSES);

// ---------- 基础字段 ----------
const titleField = z.string().trim().min(1, '标题不能为空').max(200, '标题最长 200 字');
const goalField = z.string().trim().min(1, '目标不能为空').max(2000, '目标最长 2000 字');
const idList = z.array(z.number().int().positive()).max(50, '依赖任务过多');

// ---------- 项目 ----------
export const createProjectSchema = z.object({
  title: titleField,
  goal: goalField,
});

export const updateProjectSchema = z.object({
  title: titleField.optional(),
  goal: goalField.optional(),
  status: projectStatusSchema.optional(),
});

// ---------- 任务 ----------
export const createTaskSchema = z.object({
  title: titleField,
  description: z.string().max(5000).default(''),
  status: taskStatusSchema.optional(),
  dependencies: idList.default([]),
  acceptanceCriteria: z.string().max(2000).default(''),
  requiresApproval: z.boolean().default(false),
  orderIndex: z.number().int().min(0).optional(),
  planVersion: z.number().int().min(1).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

export const updateTaskSchema = z.object({
  title: titleField.optional(),
  description: z.string().max(5000).optional(),
  status: taskStatusSchema.optional(),
  dependencies: idList.optional(),
  acceptanceCriteria: z.string().max(2000).optional(),
  requiresApproval: z.boolean().optional(),
  orderIndex: z.number().int().min(0).optional(),
  planVersion: z.number().int().min(1).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

// ---------- 路径参数 ----------
export const idParamSchema = z.object({ id: z.coerce.number().int().positive('id 必须是正整数') });

// ---------- 模型自检 ----------
export const chatSchema = z.object({ message: z.string().trim().min(1, 'message 不能为空').max(4000) });

// 注意：用 z.input 而不是 z.infer —— 带 .default() 的字段在调用方可以省略，
// 默认值由 validate 中间件（API 入口）或 db 层补齐。
export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;