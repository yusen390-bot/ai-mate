import { config, isModelConfigured } from './config.ts';

export type Role = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: Role; content: string };

export class ModelError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = 'ModelError';
    this.status = status;
  }
}

export type ChatResult = { content: string; model: string; usage?: unknown };

/**
 * 调用 OpenAI 兼容的 /chat/completions 接口（当前指向 DeepSeek）。
 * 切换服务商只改环境变量，代码不动；未来要换 OpenAI Agents SDK 时，
 * 只需替换本文件的实现，其余代码不受影响。
 */
export async function chatCompletion(
  messages: ChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<ChatResult> {
  if (!isModelConfigured()) {
    throw new ModelError('模型未配置：请在 .env 里填写 MODEL_API_KEY（必要时再改 MODEL_BASE_URL / MODEL_NAME）', 400);
  }

  const url = `${config.model.baseUrl}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model.name,
    messages,
    temperature: opts.temperature ?? 0.7,
    stream: false,
  };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.model.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.model.timeoutMs),
    });
  } catch (error) {
    throw new ModelError(`无法连接模型服务 ${url}：${(error as Error).message}`, 502);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ModelError(`模型服务返回 ${res.status}：${text.slice(0, 500)}`, 502);
  }

  let json: { choices?: { message?: { content?: string } }[]; model?: string; usage?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ModelError(`模型服务返回了非 JSON 内容：${text.slice(0, 300)}`, 502);
  }

  return {
    content: json.choices?.[0]?.message?.content ?? '',
    model: json.model ?? config.model.name,
    usage: json.usage,
  };
}

/** 拉取服务端可用模型列表（用于验证密钥是否有效） */
export async function listRemoteModels(): Promise<string[]> {
  if (!isModelConfigured()) {
    throw new ModelError('模型未配置：请在 .env 里填写 MODEL_API_KEY', 400);
  }
  const url = `${config.model.baseUrl}/models`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${config.model.apiKey}` },
    signal: AbortSignal.timeout(config.model.timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) throw new ModelError(`模型服务返回 ${res.status}：${text.slice(0, 300)}`, 502);
  const json = JSON.parse(text) as { data?: { id?: string }[] };
  return (json.data ?? []).map((m) => m.id ?? '').filter(Boolean);
}