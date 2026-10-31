import { beforeEach, describe, expect, it } from 'vitest';
import type { Task } from '../../shared/types.ts';
import {
  approveTask,
  createProject,
  createTask,
  getProject,
  getTask,
  interruptRunningTasks,
  listRuns,
  recordRunStart,
  setTaskStatus,
  updateProject,
} from '../src/db.ts';
import { runProject } from '../src/services/executor.ts';
import { resolveTool } from '../src/services/tools.ts';
import { verifyOutput } from '../src/services/verifier.ts';
import { resetDatabase } from './helpers.ts';

beforeEach(resetDatabase);

describe('验证器（确定性规则）', () => {
  const base = { acceptanceCriteria: '有产出' } as unknown as Task;

  it('note：>=20 字符通过，过短不通过', () => {
    expect(verifyOutput('note', 'x'.repeat(30), base).ok).toBe(true);
    expect(verifyOutput('note', 'short', base).ok).toBe(false);
  });

  it('report：需要长度与至少 2 个二级标题', () => {
    expect(verifyOutput('report', '# T\n\n## A\n\ncontent', base).ok).toBe(false);
    const good = '# T\n\n## 目标\n\n' + 'x'.repeat(220) + '\n\n## 结论\n\nok';
    expect(verifyOutput('report', good, base).ok).toBe(true);
  });

  it('text_check：ok=false 不通过', () => {
    expect(verifyOutput('text_check', JSON.stringify({ ok: true, issues: [] }), base).ok).toBe(true);
    const bad = verifyOutput('text_check', JSON.stringify({ ok: false, issues: ['有问题'] }), base);
    expect(bad.ok).toBe(false);
    expect(bad.issues).toContain('有问题');
  });

  it('缺少完成标准 → 不通过', () => {
    const noCriteria = { acceptanceCriteria: '' } as unknown as Task;
    expect(verifyOutput('note', 'x'.repeat(30), noCriteria).ok).toBe(false);
  });
});

describe('执行器', () => {
  it('按依赖顺序执行，全部成功后项目 done', async () => {
    const project = createProject({ title: '顺序测试', goal: '验证依赖顺序' });
    const first = createTask(project.id, { title: '第一步', acceptanceCriteria: '有产出' });
    const second = createTask(project.id, {
      title: '第二步',
      acceptanceCriteria: '有产出',
      dependencies: [first.id],
    });

    updateProject(project.id, { status: 'running' });
    await runProject(project.id);

    expect(getTask(first.id)?.status).toBe('succeeded');
    expect(getTask(second.id)?.status).toBe('succeeded');
    expect(getProject(project.id)?.status).toBe('done');

    const firstRun = listRuns(first.id);
    const secondRun = listRuns(second.id);
    expect(firstRun).toHaveLength(1);
    expect(secondRun).toHaveLength(1);
    expect(firstRun[0].status).toBe('succeeded');
    expect(firstRun[0].id).toBeLessThan(secondRun[0].id);
  });

  it('验证不通过会有限重试，耗尽后任务 failed、项目 failed', async () => {
    const project = createProject({ title: '重试测试', goal: '触发检查失败' });
    const dep = createTask(project.id, {
      title: '产出资料',
      acceptanceCriteria: '有产出',
      description: 'TODO: 待补充',
    });
    const check = createTask(project.id, {
      title: '核查产出',
      acceptanceCriteria: '通过检查',
      dependencies: [dep.id],
      maxAttempts: 2,
    });

    updateProject(project.id, { status: 'running' });
    await runProject(project.id);

    const task = getTask(check.id)!;
    expect(task.status).toBe('failed');
    expect(task.attempts).toBe(2);
    expect(task.lastError ?? '').toContain('TODO');
    expect(listRuns(check.id)).toHaveLength(2);
    expect(getProject(project.id)?.status).toBe('failed');
  });

  it('需要审批的任务会暂停，批准后继续并完成', async () => {
    const project = createProject({ title: '审批测试', goal: '验证暂停与继续' });
    const first = createTask(project.id, { title: '任务一', acceptanceCriteria: '有产出' });
    const second = createTask(project.id, {
      title: '任务二',
      acceptanceCriteria: '有产出',
      dependencies: [first.id],
      requiresApproval: true,
    });

    updateProject(project.id, { status: 'running' });
    await runProject(project.id);

    expect(getTask(first.id)?.status).toBe('succeeded');
    expect(getTask(second.id)?.status).toBe('needs_review');
    expect(getProject(project.id)?.status).toBe('awaiting_confirmation');

    approveTask(second.id);
    updateProject(project.id, { status: 'running' });
    await runProject(project.id);

    expect(getTask(second.id)?.status).toBe('succeeded');
    expect(getProject(project.id)?.status).toBe('done');
  });

  it('重启恢复：running 任务转 needs_review，不盲目重跑', async () => {
    const project = createProject({ title: '恢复测试', goal: '模拟中断' });
    const task = createTask(project.id, { title: '中断任务', acceptanceCriteria: '有产出' });

    updateProject(project.id, { status: 'running' });
    setTaskStatus(task.id, 'running', { attempts: 1 });
    recordRunStart(task.id, 1, '{}');

    const changed = interruptRunningTasks();
    expect(changed).toBeGreaterThanOrEqual(2);

    expect(getTask(task.id)?.status).toBe('needs_review');
    expect(getTask(task.id)?.lastError ?? '').toContain('服务重启');
    expect(getProject(project.id)?.status).toBe('awaiting_confirmation');
  });
});
describe('工具推断（auto）', () => {
  const asTask = (title: string, tool = 'auto') => ({ title, tool }) as unknown as Task;

  it('撰写/正文/定稿 → report', () => {
    expect(resolveTool(asTask('撰写报告正文'))).toBe('report');
    expect(resolveTool(asTask('定稿并交付报告'))).toBe('report');
  });

  it('核查/审校/校验 → text_check', () => {
    expect(resolveTool(asTask('事实核查与引用校验'))).toBe('text_check');
  });

  it('范围/收集/评估类 → note', () => {
    expect(resolveTool(asTask('明确报告范围与结构大纲'))).toBe('note');
    expect(resolveTool(asTask('收集主流产品特性与基准数据'))).toBe('note');
  });

  it('显式指定时以指定为准', () => {
    expect(resolveTool(asTask('任意标题', 'text_check'))).toBe('text_check');
  });
});