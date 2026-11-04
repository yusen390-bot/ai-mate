import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function getDbFile(): string {
  const raw = (process.env.DB_FILE ?? '').trim();
  if (raw === '') return path.join(here, '..', 'data', 'ai-mate.db');
  if (raw === ':memory:' || raw.startsWith('file:')) return raw;
  return path.resolve(raw);
}

/** 模型配置用 getter 读取：测试里可以临时改环境变量验证失败兜底 */
export const config = {
  port: Number(process.env.PORT ?? 3001),
  model: {
    get baseUrl(): string {
      return (process.env.MODEL_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    },
    get apiKey(): string {
      return process.env.MODEL_API_KEY ?? '';
    },
    get name(): string {
      return process.env.MODEL_NAME ?? 'gpt-4o-mini';
    },
    get timeoutMs(): number {
      return Number(process.env.MODEL_TIMEOUT_MS ?? 60000);
    },
  },
};

export function isModelConfigured(): boolean {
  return config.model.apiKey.trim().length > 0;
}