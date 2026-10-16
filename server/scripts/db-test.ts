// 四表结构 + 事务 + 级联删除自检：cd server && npm run db:test
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const testDbFile = path.join(here, '..', 'data', 'db-test.db');

process.env.DB_FILE = testDbFile;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDbFile + suffix, { force: true });

const repo = await import('../src/db.ts');

const project = repo.createProject({ title: '自检项目', goal: '帮我整理一份技术主题报告' });
console.log(`1) 建项目           #${project.id} ${project.title} (${project.status})`);

const gather = repo.createTask(project.id, {
  title: '资料收集',
  acceptanceCriteria: '至少 3 个可追溯来源',
});
const write = repo.createTask(project.id, {
  title: '撰写报告',
  dependencies: [gather.id],
  acceptanceCriteria: '含摘要、结论与来源列表',
  requiresApproval: true,
});
console.log(`2) 建任务           #${gather.id} ${gather.title} / #${write.id} ${write.title} 依赖=[${write.dependencies}]`);

const runId = repo.recordRun({
  taskId: gather.id,
  attempt: 1,
  status: 'succeeded',
  input: '{"topic":"技术主题"}',
  output: '3 个来源',
});
const artifactId = repo.addArtifact({
  taskId: write.id,
  projectId: project.id,
  type: 'report',
  name: 'report.md',
  content: '# 技术主题报告\n\n...',
});
console.log(`3) 执行记录 #${runId} / 产物 #${artifactId}`);

console.log('4) 读回', JSON.stringify({
  taskStats: repo.getProject(project.id)?.taskStats,
  tasks: repo.listTasks(project.id).map((t) => `${t.title}:${t.status}`),
  runs: repo.listRuns(gather.id).length,
  artifacts: repo.listArtifacts(project.id).length,
}));

try {
  repo.tx(() => {
    repo.createProject({ title: '这个项目应该被回滚', goal: 'x' });
    throw new Error('故意失败以验证回滚');
  });
} catch {
  /* 预期 */
}
console.log(`5) 事务回滚后项目数 ${repo.listProjects().length}（应为 1）`);

repo.deleteProject(project.id);
console.log(`6) 删除项目后计数 ${JSON.stringify(repo.counts())}（应全为 0）`);

repo.closeDb();
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(testDbFile + suffix, { force: true });
console.log('\n✅ 四张表 + 事务 + 级联删除 自检通过（测试库已清理）');