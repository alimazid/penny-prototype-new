import winston from 'winston';
declare const logger: winston.Logger;
declare const performanceLogger: winston.Logger;
declare const logError: (message: string, error?: Error | unknown, context?: any) => void;
declare const logInfo: (message: string, data?: any) => void;
declare const logDebug: (message: string, data?: any) => void;
declare const logWarn: (message: string, data?: any) => void;
declare const logPerformance: (metric: string, value: number, unit?: string, tags?: any) => void;
export { logger, performanceLogger, logError, logInfo, logDebug, logWarn, logPerformance };
//# sourceMappingURL=logger.d.ts.map