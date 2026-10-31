import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/app.ts';
import { parsePlanOutput } from '../src/services/planRules.ts';
import { createProject, resetDatabase } from './helpers.ts';

const validPlan = {
  summary: '先收集来源，再撰写并校验报告',
  tasks: [
    {
      ref: 't1',
      title: '收集来源',
      description: '找 3 个可靠来源',
      acceptanceCriteria: '包含 3 个可访问链接',
      requiresApproval: false,
      dependsOn: [],
    },
    {
      ref: 't2',
      title: '撰写报告',
      description: '整合来源写报告',
      acceptanceCriteria: '含摘要、结论与来源列表',
      requiresApproval: true,
      dependsOn: ['t1'],
    },
  ],
};

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`期望抛出 ${code}，但没有抛错`);
}

beforeEach(resetDatabase);

describe('计划解析（纯函数）', () => {
  it('纯 JSON', () => {
    expect(parsePlanOutput(JSON.stringify(validPlan)).tasks).toHaveLength(2);
  });

  it('```json 代码块包裹', () => {
    expect(parsePlanOutput('```json\n' + JSON.stringify(validPlan) + '\n```').tasks).toHaveLength(2);
  });

  it('前后有多余文字', () => {
    expect(parsePlanOutput('好的，计划如下：' + JSON.stringify(validPlan) + '\n以上。').tasks).toHaveLength(2);
  });

  it('垃圾输入 -> PLAN_INVALID', () => {
    expectCode(() => parsePlanOutput('抱歉，我无法完成这个任务'), 'PLAN_INVALID');
  });

  it('缺少完成标准 -> PLAN_INVALID', () => {
    const bad = {
      summary: 'x',
      tasks: [{ ref: 't1', title: '任务', description: '', requiresApproval: false, dependsOn: [] }],
    };
    expectCode(() => parsePlanOutput(JSON.stringify(bad)), 'PLAN_INVALID');
  });

  it('依赖不存在 -> PLAN_DEPENDENCY', () => {
    const bad = {
      summary: 'x',
      tasks: [
        { ref: 't1', title: 'a', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t9'] },
      ],
    };
    expectCode(() => parsePlanOutput(JSON.stringify(bad)), 'PLAN_DEPENDENCY');
  });

  it('依赖自己 -> PLAN_INVALID', () => {
    const bad = {
      summary: 'x',
      tasks: [{ ref: 't1', title: 'a', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t1'] }],
    };
    expectCode(() => parsePlanOutput(JSON.stringify(bad)), 'PLAN_INVALID');
  });

  it('成环 -> PLAN_CYCLIC', () => {
    const bad = {
      summary: 'x',
      tasks: [
        { ref: 't1', title: 'a', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t2'] },
        { ref: 't2', title: 'b', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t1'] },
      ],
    };
    expectCode(() => parsePlanOutput(JSON.stringify(bad)), 'PLAN_CYCLIC');
  });
});

describe('计划 API', () => {
  it('保存计划：版本 1、依赖映射成真实 id、状态变待确认', async () => {
    const project = await createProject(app);
    const res = await request(app).put(`/api/projects/${project.id}/plan`).send(validPlan).expect(200);

    expect(res.body.version).toBe(1);
    expect(res.body.project.status).toBe('awaiting_confirmation');

    const tasks = res.body.tasks as { id: number; title: string; dependencies: number[]; planVersion: number; requiresApproval: boolean }[];
    expect(tasks).toHaveLength(2);

    const t1 = tasks.find((t) => t.title === '收集来源')!;
    const t2 = tasks.find((t) => t.title === '撰写报告')!;
    expect(t2.dependencies).toEqual([t1.id]);
    expect(t2.requiresApproval).toBe(true);
    expect(t2.planVersion).toBe(1);
  });

  it('非法计划（有环）→ 422 且不落库', async () => {
    const project = await createProject(app);
    const cyclic = {
      summary: 'x',
      tasks: [
        { ref: 't1', title: 'a', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t2'] },
        { ref: 't2', title: 'b', acceptanceCriteria: 'ok', requiresApproval: false, dependsOn: ['t1'] },
      ],
    };

    const res = await request(app).put(`/api/projects/${project.id}/plan`).send(cyclic).expect(422);
    expect(res.body.error.code).toBe('PLAN_CYCLIC');

    const list = await request(app).get(`/api/projects/${project.id}/tasks`).expect(200);
    expect(list.body.tasks).toHaveLength(0);
  });

  it('确认执行：awaiting_confirmation -> running', async () => {
    const project = await createProject(app);
    await request(app).put(`/api/projects/${project.id}/plan`).send(validPlan).expect(200);

    const before = await request(app).get(`/api/projects/${project.id}`).expect(200);
    expect(before.body.status).toBe('awaiting_confirmation');

    const res = await request(app).post(`/api/projects/${project.id}/plan/confirm`).expect(200);
    expect(res.body.project.status).toBe('running');
  });

  it('draft 状态没有计划时不能确认执行', async () => {
    const project = await createProject(app);
    const res = await request(app).post(`/api/projects/${project.id}/plan/confirm`).expect(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('项目执行完成后不能再保存计划', async () => {
    const project = await createProject(app);
    const simplePlan = {
      summary: '只有一步的计划',
      tasks: [
        { ref: 't1', title: '产出内容', acceptanceCriteria: '有产出', requiresApproval: false, dependsOn: [] },
      ],
    };

    await request(app).put(`/api/projects/${project.id}/plan`).send(simplePlan).expect(200);

    // W3：确认后会自动开始执行，等它跑完
    await request(app).post(`/api/projects/${project.id}/plan/confirm`).expect(200);

    const startAt = Date.now();
    let status = '';
    while (Date.now() - startAt < 5000) {
      const res = await request(app).get(`/api/projects/${project.id}`).expect(200);
      status = res.body.status;
      if (status === 'done' || status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(status).toBe('done');

    const res = await request(app).put(`/api/projects/${project.id}/plan`).send(simplePlan).expect(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('GET 计划：版本 / 任务 / 版本列表', async () => {
    const project = await createProject(app);
    await request(app).put(`/api/projects/${project.id}/plan`).send(validPlan).expect(200);

    const res = await request(app).get(`/api/projects/${project.id}/plan`).expect(200);
    expect(res.body.version).toBe(1);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].source).toBe('manual');
  });

  it('第二次保存会生成版本 2，并替换未执行的任务', async () => {
    const project = await createProject(app);
    await request(app).put(`/api/projects/${project.id}/plan`).send(validPlan).expect(200);

    const edited = {
      summary: '调整后的计划',
      tasks: [
        { ref: 't1', title: '新的第一步', acceptanceCriteria: '有产出', requiresApproval: false, dependsOn: [] },
      ],
    };
    const res = await request(app).put(`/api/projects/${project.id}/plan`).send(edited).expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe('新的第一步');
  });
});