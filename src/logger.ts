import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'patient-docs' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length > 1 // 1 because of service
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `${timestamp} [${level.toUpperCase()}] ${message}${extra}`;
        })
      ),
    }),
  ],
});

export default logger;
