import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { createProject, resetDatabase } from './helpers.ts';

beforeEach(resetDatabase);

describe('项目 API', () => {
  it('创建项目：trim 生效，默认状态 draft', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ title: '  报告项目  ', goal: '帮我整理一份技术主题报告' })
      .expect(201);
    expect(res.body.title).toBe('报告项目');
    expect(res.body.status).toBe('draft');
    expect(res.body.taskStats).toEqual({ total: 0, done: 0 });
  });

  it('缺字段 / 空标题 → 400 且带字段级错误', async () => {
    const missingGoal = await request(app).post('/api/projects').send({ title: '只有标题' }).expect(400);
    expect(missingGoal.body.error.code).toBe('VALIDATION_ERROR');
    expect(missingGoal.body.error.details[0].path).toBe('goal');

    await request(app).post('/api/projects').send({ title: '   ', goal: '目标' }).expect(400);
  });

  it('列表 / 详情 / 修改 / 删除 全链路', async () => {
    const created = await createProject(app);

    const list = await request(app).get('/api/projects').expect(200);
    expect(list.body.projects).toHaveLength(1);

    const detail = await request(app).get(`/api/projects/${created.id}`).expect(200);
    expect(detail.body.tasks).toEqual([]);

    const patched = await request(app)
      .patch(`/api/projects/${created.id}`)
      .send({ status: 'awaiting_confirmation' })
      .expect(200);
    expect(patched.body.status).toBe('awaiting_confirmation');

    await request(app).delete(`/api/projects/${created.id}`).expect(204);
    await request(app).get(`/api/projects/${created.id}`).expect(404);
  });

  it('PATCH 空对象 → 400 EMPTY_PAYLOAD；非法状态 → 400', async () => {
    const project = await createProject(app);

    const empty = await request(app).patch(`/api/projects/${project.id}`).send({}).expect(400);
    expect(empty.body.error.code).toBe('EMPTY_PAYLOAD');

    const badStatus = await request(app)
      .patch(`/api/projects/${project.id}`)
      .send({ status: '不存在的状态' })
      .expect(400);
    expect(badStatus.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('不存在的项目 → 404', async () => {
    const res = await request(app).get('/api/projects/9999').expect(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });
});