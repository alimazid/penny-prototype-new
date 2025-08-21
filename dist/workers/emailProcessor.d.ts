export interface EmailProcessingJob {
    emailAccountId: string;
    emailId?: string;
    processType: 'sync' | 'classify' | 'extract';
    priority?: number;
}
export interface EmailProcessingResult {
    success: boolean;
    processedCount?: number;
    errors?: string[];
    emailId?: string;
    classification?: any;
    extraction?: any;
}
export declare class EmailProcessor {
    private worker;
    private isRunning;
    constructor();
    private processJob;
    /**
     * Sync emails from Gmail for a specific account
     */
    private syncEmails;
    /**
     * Classify a single email using AI
     */
    private classifyEmail;
    /**
     * Extract financial data from a classified financial email
     */
    private extractEmailData;
    private queueClassificationJob;
    /**
     * Map AI category to database enum
     */
    private mapCategoryToEnum;
    /**
     * Map AI transaction type to database enum
     */
    private mapTransactionTypeToEnum;
    /**
     * Get classification as string for AI processing
     */
    private getClassificationString;
    /**
     * Send processing update via WebSocket (private method to avoid direct io access)
     */
    private sendProcessingUpdate;
    private queueExtractionJob;
    close(): Promise<void>;
    get running(): boolean;
    /**
     * Find and reprocess emails stuck at CLASSIFIED status
     */
    processStuckEmails(): Promise<{
        processed: number;
        errors: string[];
    }>;
}
export declare const emailProcessor: EmailProcessor;
//# sourceMappingURL=emailProcessor.d.ts.map