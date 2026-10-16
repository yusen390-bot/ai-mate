import type { Express } from 'express';
import request from 'supertest';
import { getDb } from '../src/db.ts';

/** 每个用例前清空数据（外键级联会一并清掉 tasks / runs / artifacts） */
export function resetDatabase(): void {
  getDb().exec('DELETE FROM projects');
}

export async function createProject(
  app: Express,
  input: { title?: string; goal?: string } = {},
): Promise<{ id: number; title: string; goal: string; status: string }> {
  const res = await request(app)
    .post('/api/projects')
    .send({ title: '测试项目', goal: '帮我整理一份技术主题报告', ...input });
  return res.body;
}

export async function createTask(
  app: Express,
  projectId: number,
  input: Record<string, unknown> = {},
): Promise<Record<string, unknown> & { id: number }> {
  const res = await request(app)
    .post(`/api/projects/${projectId}/tasks`)
    .send({ title: '子任务', ...input });
  return res.body;
}