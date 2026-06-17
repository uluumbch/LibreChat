import { createApp } from './app';
import { config } from './config';
import { logger } from './logger';
import { disconnectDb, prisma } from './db';

async function main(): Promise<void> {
  await prisma.$connect();
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Hermes-Chat BFF listening on :${config.port}`);
    logger.info(
      `Gateway pool: ${config.gateways.map((g) => `${g.id}=${g.model}`).join(', ')} (default: ${config.defaultModel})`,
    );
  });

  const shutdown = (signal: string): void => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
