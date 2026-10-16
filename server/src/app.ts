import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error.ts';
import { healthRouter } from './routes/health.ts';
import { modelRouter } from './routes/model.ts';
import { projectsRouter } from './routes/projects.ts';
import { tasksRouter } from './routes/tasks.ts';

/**
 * 组装 Express 应用。
 * 注意：这里不打开数据库，保证测试可以先设置 DB_FILE=:memory: 再发请求。
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use(modelRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();