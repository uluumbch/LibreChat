import express from 'express';
import type { Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { config } from './config';
import { logger } from './logger';
import { errorMiddleware } from './errors';
import { authRouter } from './auth/routes';
import { conversationsRouter } from './routes/conversations';
import { messagesRouter } from './routes/messages';
import { profileRouter } from './routes/settings';
import { discoveryRouter } from './routes/discovery';
import { jobsRouter } from './routes/jobs';
import { adminRouter } from './routes/admin';
import { chatRouter } from './chat/routes';

export function createApp(): Express {
  const app = express();

  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '12mb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/conversations', messagesRouter);
  app.use('/api/profile', profileRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/chat', chatRouter);

  app.use(errorMiddleware);
  return app;
}
