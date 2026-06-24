import pino from 'pino';

function createLogger(): pino.Logger {
  const level = process.env.LOG_LEVEL ?? 'info';
  if (process.env.NODE_ENV === 'production') {
    return pino({ level });
  }
  try {
    return pino({
      level,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } },
    });
  } catch {
    // pino-pretty not available — fall back to structured JSON logs.
    return pino({ level });
  }
}

export const logger = createLogger();
