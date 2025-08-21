"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceMonitor = void 0;
const logger_1 = require("./logger");
const database_1 = require("./database");
// Performance monitoring utilities
class PerformanceMonitor {
    static metrics = new Map();
    // Middleware to track API performance
    static middleware = (req, res, next) => {
        const startTime = process.hrtime.bigint();
        const startMemory = process.memoryUsage();
        res.on('finish', async () => {
            const endTime = process.hrtime.bigint();
            const endMemory = process.memoryUsage();
            const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
            const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;
            const route = `${req.method} ${req.route?.path || req.path}`;
            // Log performance metrics
            (0, logger_1.logPerformance)(`api.${req.method.toLowerCase()}.duration`, duration, 'ms', {
                route,
                statusCode: res.statusCode,
                memoryDelta,
            });
            // Store in database for analysis
            try {
                await database_1.DatabaseOperations.recordPerformanceMetric({
                    metricName: `api.${req.method.toLowerCase()}.duration`,
                    metricValue: duration,
                    metricUnit: 'ms',
                    category: 'api',
                    tags: {
                        route,
                        statusCode: res.statusCode,
                        memoryDelta,
                        userAgent: req.get('User-Agent'),
                    },
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to record performance metric:', error);
            }
            // Track in memory for quick stats
            PerformanceMonitor.addMetric(route, duration);
        });
        next();
    };
    // Add metric to in-memory store
    static addMetric(name, value) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }
        const values = this.metrics.get(name);
        values.push(value);
        // Keep only last 1000 values
        if (values.length > 1000) {
            values.shift();
        }
    }
    // Get metric statistics
    static getMetricStats(name) {
        const values = this.metrics.get(name);
        if (!values || values.length === 0) {
            return null;
        }
        const sorted = [...values].sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        return {
            count: values.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            avg: sum / values.length,
            p50: sorted[Math.floor(sorted.length * 0.5)],
            p95: sorted[Math.floor(sorted.length * 0.95)],
            p99: sorted[Math.floor(sorted.length * 0.99)],
        };
    }
    // Get all metrics
    static getAllMetrics() {
        const result = {};
        for (const [name] of this.metrics.entries()) {
            result[name] = this.getMetricStats(name);
        }
        return result;
    }
    // Timer utility for measuring operation duration
    static timer(name) {
        const startTime = process.hrtime.bigint();
        return {
            end: async (tags) => {
                const endTime = process.hrtime.bigint();
                const duration = Number(endTime - startTime) / 1_000_000;
                (0, logger_1.logPerformance)(name, duration, 'ms', tags);
                try {
                    await database_1.DatabaseOperations.recordPerformanceMetric({
                        metricName: name,
                        metricValue: duration,
                        metricUnit: 'ms',
                        category: 'operation',
                        tags: tags || {},
                    });
                }
                catch (error) {
                    logger_1.logger.error('Failed to record performance metric:', error);
                }
                this.addMetric(name, duration);
                return duration;
            }
        };
    }
    // Measure async function execution
    static async measure(name, fn, tags) {
        const timer = this.timer(name);
        try {
            const result = await fn();
            const duration = await timer.end({ ...tags, success: true });
            return { result, duration };
        }
        catch (error) {
            await timer.end({ ...tags, success: false, error: true });
            throw error;
        }
    }
    // Email processing specific metrics
    static async recordEmailProcessingMetric(stage, duration, emailId, success, metadata) {
        const metricName = `email.processing.${stage}`;
        (0, logger_1.logPerformance)(metricName, duration, 'ms', {
            emailId,
            success,
            ...metadata,
        });
        try {
            await database_1.DatabaseOperations.recordPerformanceMetric({
                metricName,
                metricValue: duration,
                metricUnit: 'ms',
                category: 'email_processing',
                tags: {
                    emailId,
                    success,
                    stage,
                    ...metadata,
                },
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to record email processing metric:', error);
        }
        this.addMetric(metricName, duration);
    }
    // System resource monitoring
    static getSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        return {
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers,
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
            },
            uptime: process.uptime(),
            pid: process.pid,
            version: process.version,
            platform: process.platform,
            arch: process.arch,
        };
    }
    // Record system metrics periodically
    static startSystemMonitoring(intervalMs = 60000) {
        setInterval(async () => {
            const metrics = this.getSystemMetrics();
            try {
                // Record memory usage
                await database_1.DatabaseOperations.recordPerformanceMetric({
                    metricName: 'system.memory.heap_used',
                    metricValue: metrics.memory.heapUsed,
                    metricUnit: 'bytes',
                    category: 'system',
                    tags: { type: 'memory' },
                });
                // Record CPU usage
                await database_1.DatabaseOperations.recordPerformanceMetric({
                    metricName: 'system.cpu.user',
                    metricValue: metrics.cpu.user,
                    metricUnit: 'microseconds',
                    category: 'system',
                    tags: { type: 'cpu' },
                });
                // Record uptime
                await database_1.DatabaseOperations.recordPerformanceMetric({
                    metricName: 'system.uptime',
                    metricValue: metrics.uptime,
                    metricUnit: 'seconds',
                    category: 'system',
                    tags: { type: 'uptime' },
                });
            }
            catch (error) {
                logger_1.logger.error('Failed to record system metrics:', error);
            }
        }, intervalMs);
    }
    // Generate performance report
    static generateReport() {
        const allMetrics = this.getAllMetrics();
        const systemMetrics = this.getSystemMetrics();
        return {
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            system: systemMetrics,
            performance: allMetrics,
            summary: {
                totalRequests: Object.values(allMetrics).reduce((sum, metric) => sum + (metric?.count || 0), 0),
                averageResponseTime: this.calculateOverallAverage(allMetrics),
                slowestEndpoints: this.getSlowestEndpoints(allMetrics, 5),
                fastestEndpoints: this.getFastestEndpoints(allMetrics, 5),
            },
        };
    }
    static calculateOverallAverage(metrics) {
        let totalTime = 0;
        let totalCount = 0;
        for (const metric of Object.values(metrics)) {
            if (metric && typeof metric === 'object' && 'avg' in metric && 'count' in metric) {
                totalTime += metric.avg * metric.count;
                totalCount += metric.count;
            }
        }
        return totalCount > 0 ? totalTime / totalCount : 0;
    }
    static getSlowestEndpoints(metrics, limit) {
        return Object.entries(metrics)
            .filter(([_, metric]) => metric && typeof metric === 'object' && 'avg' in metric)
            .sort(([, a], [, b]) => b.avg - a.avg)
            .slice(0, limit)
            .map(([name, metric]) => ({ name, avg: metric.avg }));
    }
    static getFastestEndpoints(metrics, limit) {
        return Object.entries(metrics)
            .filter(([_, metric]) => metric && typeof metric === 'object' && 'avg' in metric)
            .sort(([, a], [, b]) => a.avg - b.avg)
            .slice(0, limit)
            .map(([name, metric]) => ({ name, avg: metric.avg }));
    }
}
exports.PerformanceMonitor = PerformanceMonitor;
//# sourceMappingURL=performance.js.map