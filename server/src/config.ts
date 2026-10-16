import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 数据库文件路径。
 * - 默认：server/data/ai-mate.db
 * - 可用 .env 的 DB_FILE 覆盖
 * - 测试使用 ":memory:"（内存库，互不干扰）
 */
export function getDbFile(): string {
  const raw = (process.env.DB_FILE ?? '').trim();
  if (raw === '') return path.join(here, '..', 'data', 'ai-mate.db');
  if (raw === ':memory:' || raw.startsWith('file:')) return raw;
  return path.resolve(raw);
}

/** 模型服务配置：OpenAI 兼容接口，全部来自环境变量 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  model: {
    baseUrl: (process.env.MODEL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: process.env.MODEL_API_KEY ?? '',
    name: process.env.MODEL_NAME ?? 'gpt-4o-mini',
    timeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 60000),
  },
};

export function isModelConfigured(): boolean {
  return config.model.apiKey.trim().length > 0;
}