import { Request, Response, NextFunction } from 'express';
export declare class PerformanceMonitor {
    private static metrics;
    static middleware: (req: Request, res: Response, next: NextFunction) => void;
    static addMetric(name: string, value: number): void;
    static getMetricStats(name: string): {
        count: number;
        min: number;
        max: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
    };
    static getAllMetrics(): any;
    static timer(name: string): {
        end: (tags?: any) => Promise<number>;
    };
    static measure<T>(name: string, fn: () => Promise<T>, tags?: any): Promise<{
        result: T;
        duration: number;
    }>;
    static recordEmailProcessingMetric(stage: string, duration: number, emailId: string, success: boolean, metadata?: any): Promise<void>;
    static getSystemMetrics(): {
        memory: {
            rss: number;
            heapTotal: number;
            heapUsed: number;
            external: number;
            arrayBuffers: number;
        };
        cpu: {
            user: number;
            system: number;
        };
        uptime: number;
        pid: number;
        version: string;
        platform: NodeJS.Platform;
        arch: NodeJS.Architecture;
    };
    static startSystemMonitoring(intervalMs?: number): void;
    static generateReport(): {
        timestamp: string;
        uptime: number;
        system: {
            memory: {
                rss: number;
                heapTotal: number;
                heapUsed: number;
                external: number;
                arrayBuffers: number;
            };
            cpu: {
                user: number;
                system: number;
            };
            uptime: number;
            pid: number;
            version: string;
            platform: NodeJS.Platform;
            arch: NodeJS.Architecture;
        };
        performance: any;
        summary: {
            totalRequests: unknown;
            averageResponseTime: number;
            slowestEndpoints: {
                name: string;
                avg: any;
            }[];
            fastestEndpoints: {
                name: string;
                avg: any;
            }[];
        };
    };
    private static calculateOverallAverage;
    private static getSlowestEndpoints;
    private static getFastestEndpoints;
}
//# sourceMappingURL=performance.d.ts.map