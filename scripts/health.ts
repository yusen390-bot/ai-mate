// 健康检查小工具：node scripts/health.ts   （或用 npm run health）
const port = process.env.PORT ?? '3001';
const url = `http://127.0.0.1:${port}/health`;

(async () => {
  try {
    const res = await fetch(url);
    const json = (await res.json()) as unknown;
    console.log(`GET ${url} -> ${res.status}`);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.error(`[x] 连不上 ${url}`);
    console.error('    请先在另一个终端运行:  npm run dev:server');
    process.exit(1);
  }
})();