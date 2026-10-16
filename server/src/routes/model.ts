import { Router } from 'express';
import { chatCompletion, listRemoteModels } from '../model.ts';
import type { ChatMessage } from '../model.ts';
import { validate } from '../middleware/validate.ts';
import { chatSchema } from '../schemas.ts';

/** 模型连通性自检：只调用模型，不写数据库（产品主路径在 W2/W3 接入） */
export const modelRouter = Router();

modelRouter.post('/api/chat', validate(chatSchema), async (req, res) => {
  const { message } = req.body as { message: string };
  const messages: ChatMessage[] = [{ role: 'user', content: message }];
  const result = await chatCompletion(messages);
  res.json({
    reply: result.content,
    model: result.model,
    usage: result.usage,
    note: '模型自检接口，不写数据库',
  });
});

modelRouter.get('/api/models', async (_req, res) => {
  res.json({ models: await listRemoteModels() });
});