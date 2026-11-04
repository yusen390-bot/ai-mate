import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { createProject, createTask, setTaskStatus, updateProject } from '../src/db.ts';
import { resetDatabase } from './helpers.ts';

beforeEach(resetDatabase);

async function waitProject(projectId: number, statuses: string[], timeoutMs = 8000): Promise<string> {
  const start = Date.now();
  let last = '';
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get(`/api/projects/${projectId}`).expect(200);
    last = res.body.status;
    if (statuses.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('等待项目状态超时，当前=' + last);
}

describe('执行类 API', () => {
  it('非 running 项目不能调用 /run', async () => {
    const project = createProject({ title: 'draft 项目', goal: 'g' });
    const res = await request(app).post(`/api/projects/${project.id}/run`).expect(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('GET /runs 返回执行日志与 executing 标记', async () => {
    const project = createProject({ title: '日志项目', goal: 'g' });
    const res = await request(app).get(`/api/projects/${project.id}/runs`).expect(200);
    expect(Array.isArray(res.body.runs)).toBe(true);
    expect(res.body.executing).toBe(false);
  });

  it('失败任务可 retry 恢复并执行完成', async () => {
    const project = createProject({ title: '重试项目', goal: 'g' });
    const task = createTask(project.id, { title: '任务', acceptanceCriteria: '有产出' });

    setTaskStatus(task.id, 'failed', { attempts: 3, lastError: '模拟失败' });
    updateProject(project.id, { status: 'failed' });

    await request(app).post(`/api/tasks/${task.id}/retry`).expect(200);

    const status = await waitProject(project.id, ['done', 'failed']);
    expect(status).toBe('done');

    const finalTask = await request(app).get(`/api/tasks/${task.id}`).expect(200);
    expect(finalTask.body.status).toBe('succeeded');
    expect(finalTask.body.lastError).toBeNull();
  });

  it('不需要审批的任务调用 approve → 409', async () => {
    const project = createProject({ title: '审批项目', goal: 'g' });
    const task = createTask(project.id, { title: '任务', acceptanceCriteria: '有产出' });

    const res = await request(app).post(`/api/tasks/${task.id}/approve`).expect(409);
    expect(res.body.error.code).toBe('NOT_REQUIRES_APPROVAL');
  });

  it('模型不可用 → 502 MODEL_ERROR，服务仍可用', async () => {
    const project = createProject({ title: '模型失败', goal: 'g' });
    const backup = {
      base: process.env.MODEL_BASE_URL,
      key: process.env.MODEL_API_KEY,
      timeout: process.env.MODEL_TIMEOUT_MS,
    };

    process.env.MODEL_BASE_URL = 'http://127.0.0.1:9/v1';
    process.env.MODEL_API_KEY = 'test-key';
    process.env.MODEL_TIMEOUT_MS = '400';

    try {
      const res = await request(app).post(`/api/projects/${project.id}/plan/generate`).expect(502);
      expect(res.body.error.code).toBe('MODEL_ERROR');

      const health = await request(app).get('/health').expect(200);
      expect(health.body.status).toBe('ok');
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('MODEL_BASE_URL', backup.base);
      restore('MODEL_API_KEY', backup.key);
      restore('MODEL_TIMEOUT_MS', backup.timeout);
    }
  });
});