import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';

describe('GET /health', () => {
  it('返回服务、模型与数据库（四表计数）状态', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('ai-mate-api');
    expect(res.body.db.ok).toBe(true);
    expect(res.body.db.counts).toEqual({ projects: 0, tasks: 0, runs: 0, artifacts: 0 });
    expect(res.body.model).toHaveProperty('baseUrl');
    expect(res.body.model).toHaveProperty('configured');
  });

  it('未知接口返回结构化 404', async () => {
    const res = await request(app).get('/api/not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});