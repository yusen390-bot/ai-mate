import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { createProject, createTask, resetDatabase } from './helpers.ts';

beforeEach(resetDatabase);

describe('状态流转白名单', () => {
  it('项目：draft -> planning 允许', async () => {
    const project = await createProject(app);
    const res = await request(app).patch(`/api/projects/${project.id}`).send({ status: 'planning' }).expect(200);
    expect(res.body.status).toBe('planning');
  });

  it('项目：draft -> done 被拒绝（409 + allowed 列表）', async () => {
    const project = await createProject(app);
    const res = await request(app).patch(`/api/projects/${project.id}`).send({ status: 'done' }).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
    expect(res.body.error.details.allowed).toContain('planning');
  });

  it('项目：done 是终态，不能再改回 draft', async () => {
    const project = await createProject(app);
    for (const status of ['planning', 'running', 'done']) {
      await request(app).patch(`/api/projects/${project.id}`).send({ status }).expect(200);
    }
    const res = await request(app).patch(`/api/projects/${project.id}`).send({ status: 'draft' }).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('任务：pending -> succeeded 允许；进入终态后不能再改', async () => {
    const project = await createProject(app);
    const task = await createTask(app, project.id, { title: '任务' });

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'succeeded' }).expect(200);

    const res = await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'pending' }).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('任务：pending -> running -> succeeded 是正常链路', async () => {
    const project = await createProject(app);
    const task = await createTask(app, project.id, { title: '任务' });

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'running' }).expect(200);
    const res = await request(app).patch(`/api/tasks/${task.id}`).send({ status: 'succeeded' }).expect(200);
    expect(res.body.status).toBe('succeeded');
  });

  it('同一状态不算非法跳转', async () => {
    const project = await createProject(app);
    await request(app).patch(`/api/projects/${project.id}`).send({ status: 'draft' }).expect(200);
  });
});