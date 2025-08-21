export interface MonitoringSession {
    accountId: string;
    gmailAddress: string;
    intervalId: NodeJS.Timeout | null;
    lastChecked: Date;
    active: boolean;
}
export declare class EmailMonitoringService {
    private static instance;
    private activeSessions;
    private checkInterval;
    private queueService;
    private constructor();
    static getInstance(): EmailMonitoringService;
    startMonitoring(accountId: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    stopMonitoring(accountId: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    triggerManualSync(accountId: string): Promise<{
        success: boolean;
        message?: string;
    }>;
    private checkForNewEmails;
    private fallbackEmailCheck;
    private processNewEmail;
    getActiveMonitoringSessions(): MonitoringSession[];
    isMonitoring(accountId: string): boolean;
    getMonitoringSession(accountId: string): MonitoringSession | undefined;
    stopAllMonitoring(): Promise<void>;
    setCheckInterval(intervalMs: number): void;
    getCheckInterval(): number;
}
export declare const emailMonitoringService: EmailMonitoringService;
//# sourceMappingURL=emailMonitoringService.d.ts.map