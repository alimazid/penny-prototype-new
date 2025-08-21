"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logPerformance = exports.logWarn = exports.logDebug = exports.logInfo = exports.logError = exports.performanceLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
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
winston_1.default.addColors(colors);
// Create log format
const format = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }), winston_1.default.format.colorize({ all: true }), winston_1.default.format.printf((info) => `${info.timestamp} ${info.level}: ${info.message}` +
    (info.splat !== undefined ? `${info.splat}` : ' ') +
    (info.stack !== undefined ? `\n${info.stack}` : '')));
// Create transports
const transports = [
    // Console transport for all environments
    new winston_1.default.transports.Console({
        format: format,
    }),
    // File transport for errors
    new winston_1.default.transports.File({
        filename: path_1.default.join(__dirname, '../../logs/error.log'),
        level: 'error',
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    }),
    // File transport for all logs
    new winston_1.default.transports.File({
        filename: path_1.default.join(__dirname, '../../logs/combined.log'),
        format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    }),
];
// Create logger instance
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json()),
    transports,
    exitOnError: false,
});
exports.logger = logger;
// Create performance logger for metrics
const performanceLogger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.File({
            filename: path_1.default.join(__dirname, '../../logs/performance.log'),
        }),
    ],
});
exports.performanceLogger = performanceLogger;
// Helper functions
const logError = (message, error, context) => {
    logger.error(message, {
        error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
        } : error,
        context
    });
};
exports.logError = logError;
const logInfo = (message, data) => {
    logger.info(message, data);
};
exports.logInfo = logInfo;
const logDebug = (message, data) => {
    logger.debug(message, data);
};
exports.logDebug = logDebug;
const logWarn = (message, data) => {
    logger.warn(message, data);
};
exports.logWarn = logWarn;
const logPerformance = (metric, value, unit = 'ms', tags) => {
    performanceLogger.info('performance_metric', {
        metric,
        value,
        unit,
        tags,
        timestamp: new Date().toISOString()
    });
};
exports.logPerformance = logPerformance;
//# sourceMappingURL=logger.js.map