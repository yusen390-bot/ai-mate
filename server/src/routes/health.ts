import { Router } from 'express';
import { config, getDbFile, isModelConfigured } from '../config.ts';
import { counts, getDb } from '../db.ts';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  let ok = true;
  let dbError: string | null = null;
  let tableCounts = { projects: 0, tasks: 0, runs: 0, artifacts: 0 };

  try {
    getDb();
    tableCounts = counts();
  } catch (error) {
    ok = false;
    dbError = error instanceof Error ? error.message : String(error);
  }

  res.json({
    status: ok ? 'ok' : 'degraded',
    service: 'ai-mate-api',
    version: '0.2.0',
    time: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    model: {
      baseUrl: config.model.baseUrl,
      name: config.model.name,
      configured: isModelConfigured(),
    },
    db: { ok, file: getDbFile(), counts: tableCounts, error: dbError },
  });
});