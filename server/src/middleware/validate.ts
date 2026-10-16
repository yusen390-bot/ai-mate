import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

/** 用 Zod 校验请求参数，失败返回 400 + 结构化错误 */
export function validate(schema: ZodType, source: 'body' | 'params' | 'query' = 'body'): RequestHandler {
  return (req, res, next) => {
    const input = source === 'body' ? (req.body ?? {}) : req[source];
    const result = schema.safeParse(input);
    if (!result.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求参数不合法',
          details: result.error.issues.map((issue) => ({
            path: issue.path.join('.') || source,
            message: issue.message,
          })),
        },
      });
      return;
    }
    if (source === 'body') req.body = result.data;
    next();
  };
}

/** 更新类接口：不允许空对象 */
export const validateNonEmptyBody = (): RequestHandler => (req, res, next) => {
  const body = req.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    res.status(400).json({ error: { code: 'EMPTY_PAYLOAD', message: '至少要提供一个要修改的字段' } });
    return;
  }
  next();
};