import os from 'node:os';
import { app } from './app.ts';
import { config, getDbFile, isModelConfigured } from './config.ts';
import { counts, getDb } from './db.ts';
import { recoverOnStartup } from './services/recovery.ts';

const dbCounts = (() => {
  getDb();
  return counts();
})();

recoverOnStartup();

function printLanUrls(port: number): void {
  const nets = os.networkInterfaces();
  const ips: string[] = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  if (ips.length === 0) {
    console.log('局域网地址          未检测到（可能未联网）');
    return;
  }
  for (const ip of ips) {
    console.log(`局域网地址          http://${ip}:${port}   （手机/其他电脑访问这个）`);
  }
}
const server = app.listen(config.port, () => {
  console.log(`AI Mate API 已启动   http://localhost:${config.port}`);
  console.log(`健康检查            http://localhost:${config.port}/health`);
  console.log(`模型服务            ${config.model.baseUrl}  (${config.model.name})`);
  console.log(`模型密钥            ${isModelConfigured() ? '已配置' : '未配置（编辑根目录 .env 的 MODEL_API_KEY）'}`);
  console.log(`SQLite              ${getDbFile()}`);
  console.log(
    `当前记录            项目 ${dbCounts.projects} / 任务 ${dbCounts.tasks} / 执行 ${dbCounts.runs} / 产物 ${dbCounts.artifacts}`,
  );
});

printLanUrls(config.port);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}