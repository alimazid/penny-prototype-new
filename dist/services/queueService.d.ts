import { Job } from 'bullmq';
export interface EmailProcessingJobData {
    emailAccountId: string;
    emailId?: string;
    processType: 'sync' | 'classify' | 'extract';
    priority?: number;
}
export declare class QueueService {
    private static instance;
    private emailQueue;
    private isInitialized;
    private constructor();
    static getInstance(): QueueService;
    initialize(): Promise<void>;
    private setupQueueEventListeners;
    addEmailProcessingJob(data: EmailProcessingJobData): Promise<Job<EmailProcessingJobData> | null>;
    getQueueStats(): Promise<any>;
    isReady(): boolean;
    close(): Promise<void>;
}
//# sourceMappingURL=queueService.d.ts.map