import winston from 'winston';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Create log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}` +
    (info.splat !== undefined ? `${info.splat}` : ' ') +
    (info.stack !== undefined ? `\n${info.stack}` : '')
  ),
);

// Create transports
const transports = [
  // Console transport for all environments
  new winston.transports.Console({
    format: format,
  }),
  
  // File transport for errors
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  
  // File transport for all logs
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports,
  exitOnError: false,
});

// Create performance logger for metrics
const performanceLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/performance.log'),
    }),
  ],
});

// Helper functions
const logError = (message: string, error?: Error | unknown, context?: any) => {
  logger.error(message, {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    context
  });
};

const logInfo = (message: string, data?: any) => {
  logger.info(message, data);
};

const logDebug = (message: string, data?: any) => {
  logger.debug(message, data);
};

const logWarn = (message: string, data?: any) => {
  logger.warn(message, data);
};

const logPerformance = (metric: string, value: number, unit: string = 'ms', tags?: any) => {
  performanceLogger.info('performance_metric', {
    metric,
    value,
    unit,
    tags,
    timestamp: new Date().toISOString()
  });
};

export {
  logger,
  performanceLogger,
  logError,
  logInfo,
  logDebug,
  logWarn,
  logPerformance
};