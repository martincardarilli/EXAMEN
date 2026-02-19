import winston from 'winston';
import WinstonCloudWatch from 'winston-cloudwatch';

// --- Shared formats ---

const consoleFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length > 1
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestamp} [${level.toUpperCase()}] ${message}${extra}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// --- Main application logger ---

const transports: winston.transport[] = [
  new winston.transports.Console({ format: consoleFormat }),
];

// File transport — keeps logs on disk inside the container,
// useful as a fallback if CloudWatch is unreachable.
transports.push(
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: jsonFormat,
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    format: jsonFormat,
  })
);

// CloudWatch transport — enabled only when AWS credentials are present.
// In ECS/Fargate the credentials come from the task IAM role automatically.
if (process.env.AWS_REGION && process.env.CLOUDWATCH_LOG_GROUP) {
  transports.push(
    new WinstonCloudWatch({
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      logStreamName: `api-${new Date().toISOString().slice(0, 10)}`,
      awsRegion: process.env.AWS_REGION,
      jsonMessage: true,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  defaultMeta: { service: 'patient-docs' },
  transports,
});

// --- Audit logger (separate stream) ---
// Dedicated to PHI access events. In production this goes to its own
// CloudWatch log group with stricter retention and access policies.

const auditTransports: winston.transport[] = [
  new winston.transports.Console({ format: consoleFormat }),
  new winston.transports.File({
    filename: 'logs/audit.log',
    format: jsonFormat,
  }),
];

if (process.env.AWS_REGION && process.env.CLOUDWATCH_AUDIT_LOG_GROUP) {
  auditTransports.push(
    new WinstonCloudWatch({
      logGroupName: process.env.CLOUDWATCH_AUDIT_LOG_GROUP,
      logStreamName: `audit-${new Date().toISOString().slice(0, 10)}`,
      awsRegion: process.env.AWS_REGION,
      jsonMessage: true,
    })
  );
}

export const auditLogger = winston.createLogger({
  level: 'info',
  format: jsonFormat,
  defaultMeta: { service: 'patient-docs-audit' },
  transports: auditTransports,
});

export default logger;
