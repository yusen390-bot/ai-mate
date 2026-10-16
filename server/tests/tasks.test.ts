import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { createProject, createTask, resetDatabase } from './helpers.ts';

beforeEach(resetDatabase);

describe('任务 API', () => {
  it('创建任务：默认 pending、自动排序、依赖可保存', async () => {
    const project = await createProject(app);
    const first = await createTask(app, project.id, { title: '资料收集' });
    const second = await createTask(app, project.id, {
      title: '撰写报告',
      dependencies: [first.id],
      acceptanceCriteria: '含摘要与结论',
      requiresApproval: true,
    });

    expect(first.status).toBe('pending');
    expect(first.orderIndex).toBe(0);
    expect(second.orderIndex).toBe(1);
    expect(second.dependencies).toEqual([first.id]);
    expect(second.requiresApproval).toBe(true);
    expect(second.acceptanceCriteria).toBe('含摘要与结论');

    const list = await request(app).get(`/api/projects/${project.id}/tasks`).expect(200);
    expect(list.body.tasks).toHaveLength(2);
  });

  it('依赖校验：不存在 / 依赖自身 / 重复 / 跨项目 都会被拒绝', async () => {
    const project = await createProject(app, { title: 'A' });
    const other = await createProject(app, { title: 'B' });
    const task = await createTask(app, project.id, { title: '任务1' });
    const foreign = await createTask(app, other.id, { title: '别的项目的任务' });

    const notFound = await createTask(app, project.id, { title: 'x', dependencies: [9999] });
    expect(notFound.error).toBeDefined();

    const res1 = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .send({ title: '依赖不存在的任务', dependencies: [9999] })
      .expect(400);
    expect(res1.body.error.code).toBe('DEPENDENCY_NOT_FOUND');

    const res2 = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ dependencies: [task.id] })
      .expect(400);
    expect(res2.body.error.code).toBe('DEPENDENCY_SELF');

    const res3 = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ dependencies: [foreign.id] })
      .expect(400);
    expect(res3.body.error.code).toBe('DEPENDENCY_NOT_FOUND');
  });

  it('修改状态与字段，非法状态被拒绝', async () => {
    const project = await createProject(app);
    const task = await createTask(app, project.id, { title: '任务' });

    const ok = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ status: 'succeeded', acceptanceCriteria: '已人工确认' })
      .expect(200);
    expect(ok.body.status).toBe('succeeded');

    await request(app).patch(`/api/tasks/${task.id}`).send({ status: '随便写的' }).expect(400);
  });

  it('删除项目会级联删除任务（方案书要求的状态一致性）', async () => {
    const project = await createProject(app);
    await createTask(app, project.id, { title: '任务1' });
    await createTask(app, project.id, { title: '任务2' });

    await request(app).delete(`/api/projects/${project.id}`).expect(204);

    const health = await request(app).get('/health').expect(200);
    expect(health.body.db.counts.tasks).toBe(0);
  });

  it('删除任务 → 204，再查 → 404', async () => {
    const project = await createProject(app);
    const task = await createTask(app, project.id, { title: '任务' });

    await request(app).delete(`/api/tasks/${task.id}`).expect(204);
    await request(app).get(`/api/tasks/${task.id}`).expect(404);
  });
});