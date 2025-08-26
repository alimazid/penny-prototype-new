"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailProcessor = exports.EmailProcessor = void 0;
const bullmq_1 = require("bullmq");
const gmailService_1 = require("../services/gmailService");
const openaiService_1 = require("../services/openaiService");
const database_1 = require("../utils/database");
const websocketService_1 = require("../services/websocketService");
const logger_1 = require("../utils/logger");
const redis_1 = require("../utils/redis");
class EmailProcessor {
    worker;
    isRunning = false;
    constructor() {
        this.worker = new bullmq_1.Worker('email-processing', this.processJob.bind(this), {
            connection: redis_1.redisConnection,
            concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '2'),
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 100 },
        });
        this.worker.on('ready', () => {
            logger_1.logger.info('Email processing worker ready');
            this.isRunning = true;
        });
        this.worker.on('error', (error) => {
            logger_1.logger.error('Email processing worker error:', error);
        });
        this.worker.on('failed', (job, error) => {
            logger_1.logger.error(`Email processing job ${job?.id} failed:`, error);
        });
        this.worker.on('completed', (job, result) => {
            logger_1.logger.info(`Email processing job ${job.id} completed:`, result);
        });
    }
    async processJob(job) {
        const { emailAccountId, emailId, processType } = job.data;
        logger_1.logger.info(`Processing ${processType} job for account ${emailAccountId}`, {
            jobId: job.id,
            emailId,
        });
        try {
            switch (processType) {
                case 'sync':
                    return await this.syncEmails(emailAccountId, job);
                case 'classify':
                    return await this.classifyEmail(emailId, job);
                case 'extract':
                    return await this.extractEmailData(emailId, job);
                default:
                    throw new Error(`Unknown process type: ${processType}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`Error processing ${processType} job:`, error);
            // Update email status to failed if we have an emailId
            if (emailId) {
                try {
                    await database_1.prisma.processedEmail.update({
                        where: { id: emailId },
                        data: { processingStatus: 'FAILED' }
                    });
                    // Broadcast failure
                    const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
                    if (wsService) {
                        wsService.broadcastEmailUpdate({
                            type: 'failed',
                            emailId,
                            accountId: emailAccountId,
                            message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                        });
                    }
                }
                catch (dbError) {
                    logger_1.logger.error('Error updating email status to failed:', dbError);
                }
            }
            throw error;
        }
    }
    /**
     * Sync emails from Gmail for a specific account
     */
    async syncEmails(emailAccountId, job) {
        try {
            // Update job progress
            await job.updateProgress(10);
            // Get email account from database
            const emailAccount = await database_1.DatabaseOperations.findEmailAccountById(emailAccountId);
            if (!emailAccount) {
                throw new Error(`Email account ${emailAccountId} not found`);
            }
            // Create Gmail service instance with account credentials
            const gmailService = new gmailService_1.GmailService();
            gmailService.setCredentials({
                accessToken: emailAccount.accessToken,
                refreshToken: emailAccount.refreshToken,
                expiryDate: emailAccount.tokenExpiresAt?.getTime() ?? 0,
            });
            // Broadcast sync started
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'started',
                    emailId: `sync-${emailAccountId}`,
                    accountId: emailAccountId,
                    message: 'Starting email sync...',
                });
            }
            await job.updateProgress(20);
            // Fetch emails from Gmail
            const maxEmails = parseInt(process.env.MAX_EMAILS_PER_BATCH || '10');
            const emailsResult = await gmailService.listRecentEmails(maxEmails);
            const emails = emailsResult.messages;
            await job.updateProgress(50);
            let processedCount = 0;
            const errors = [];
            // Process each email
            for (const email of emails) {
                try {
                    // Check if email already exists in database
                    const existingEmail = await database_1.DatabaseOperations.findProcessedEmailByGmailId(email.id);
                    if (existingEmail) {
                        logger_1.logger.debug(`Email ${email.id} already processed, skipping`);
                        continue;
                    }
                    // Store email in database
                    const processedEmail = await database_1.DatabaseOperations.createProcessedEmailRecord({
                        gmailId: email.id,
                        emailAccountId: emailAccount.id,
                        subject: email.subject,
                        sender: email.from,
                        recipient: email.to,
                        bodyText: email.body,
                        bodyHtml: email.bodyHtml,
                        receivedAt: email.date,
                        threadId: email.threadId,
                        labelIds: email.labelIds,
                        hasAttachments: email.attachments && email.attachments.length > 0,
                        status: 'pending',
                    });
                    processedCount++;
                    // Queue classification job for financial emails
                    await this.queueClassificationJob(processedEmail.id);
                    // Update progress
                    const progress = 50 + ((processedCount / emails.length) * 40);
                    await job.updateProgress(Math.round(progress));
                }
                catch (error) {
                    const errorMsg = `Failed to process email ${email.id}: ${error}`;
                    logger_1.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }
            // Update last sync time
            await database_1.DatabaseOperations.updateEmailAccountSyncTime(emailAccountId);
            await job.updateProgress(100);
            // Broadcast sync completed
            const wsServiceComplete = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsServiceComplete) {
                wsServiceComplete.broadcastEmailUpdate({
                    type: 'completed',
                    emailId: `sync-${emailAccountId}`,
                    accountId: emailAccountId,
                    message: `Sync completed: ${processedCount} emails processed`,
                });
            }
            return {
                success: true,
                processedCount,
                errors: errors.length > 0 ? errors : [],
            };
        }
        catch (error) {
            // Broadcast sync failed
            const wsServiceError = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsServiceError) {
                wsServiceError.broadcastEmailUpdate({
                    type: 'failed',
                    emailId: `sync-${emailAccountId}`,
                    accountId: emailAccountId,
                    message: `Sync failed: ${error}`,
                });
            }
            throw error;
        }
    }
    /**
     * Classify a single email using AI
     */
    async classifyEmail(emailId, job) {
        try {
            await job.updateProgress(10);
            // Get email from database
            const email = await database_1.DatabaseOperations.findProcessedEmailById(emailId);
            if (!email) {
                throw new Error(`Email ${emailId} not found`);
            }
            // Update email status to processing
            await database_1.prisma.processedEmail.update({
                where: { id: emailId },
                data: { processingStatus: 'PROCESSING' }
            });
            // Broadcast classification started
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'classified',
                    emailId,
                    accountId: email.accountId,
                    message: 'Classifying email...',
                });
            }
            await job.updateProgress(30);
            // Classify email using OpenAI with timeout and retry handling
            let classification;
            try {
                classification = await Promise.race([
                    openaiService_1.openaiService.classifyEmail(email.subject || '', email.bodyText || email.bodyPreview || '', email.fromAddress || '', email.accountId // Pass accountId for tracking
                    ),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Classification timeout')), 30000) // 30 second timeout
                    )
                ]);
            }
            catch (classificationError) {
                logger_1.logger.error(`Classification failed for email ${emailId}:`, classificationError);
                // Fallback to simple classification to avoid complete failure
                classification = {
                    isFinancial: false,
                    confidence: 0.1,
                    category: 'UNCLASSIFIED',
                    language: 'en',
                    reasoning: `Classification failed: ${classificationError instanceof Error ? classificationError.message : 'Unknown error'}`
                };
            }
            await job.updateProgress(70);
            // Update email with classification results
            await database_1.prisma.processedEmail.update({
                where: { id: emailId },
                data: {
                    processingStatus: classification.isFinancial ? 'CLASSIFIED' : 'COMPLETED',
                    classification: this.mapCategoryToEnum(classification.category),
                    confidenceScore: classification.confidence,
                    language: classification.language
                }
            });
            await job.updateProgress(90);
            // If financial, queue extraction job
            // CRITICAL: CREDIT_CARD emails MUST ALWAYS have extraction attempted
            const shouldExtract = classification.isFinancial ||
                classification.category === 'credit_card' ||
                classification.category === 'CREDIT_CARD' ||
                this.mapCategoryToEnum(classification.category) === 'CREDIT_CARD';
            if (shouldExtract) {
                logger_1.logger.info(`Queueing extraction for ${emailId}: ${classification.category} (financial: ${classification.isFinancial})`);
                await this.queueExtractionJob(emailId);
            }
            else {
                logger_1.logger.debug(`Skipping extraction for ${emailId}: ${classification.category} (not financial)`);
            }
            await job.updateProgress(100);
            // Broadcast classification completed with results
            const wsService2 = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService2) {
                wsService2.broadcastEmailUpdate({
                    type: 'classified',
                    emailId,
                    accountId: email.accountId,
                    message: `Classification completed: ${classification.category} (${Math.round(classification.confidence * 100)}% confidence)`,
                    data: {
                        classification,
                        isFinancial: classification.isFinancial
                    }
                });
                // Send detailed processing update via private method
                this.sendProcessingUpdate(wsService2, {
                    emailId,
                    accountId: email.accountId,
                    type: 'classification_complete',
                    classification,
                    message: `Email classified as ${classification.isFinancial ? 'financial' : 'non-financial'}`
                });
            }
            return {
                success: true,
                emailId,
                classification,
            };
        }
        catch (error) {
            logger_1.logger.error(`Classification error for email ${emailId}:`, error);
            // Update email status to failed (only if emailId is valid)
            if (emailId) {
                try {
                    await database_1.prisma.processedEmail.update({
                        where: { id: emailId },
                        data: { processingStatus: 'FAILED' }
                    });
                }
                catch (updateError) {
                    logger_1.logger.error(`Failed to update email ${emailId} status to FAILED:`, updateError);
                }
            }
            else {
                logger_1.logger.error('Cannot update email status - emailId is undefined');
            }
            // Broadcast classification failed (only if emailId is valid)
            if (emailId) {
                try {
                    const email = await database_1.prisma.processedEmail.findUnique({
                        where: { id: emailId }
                    });
                    if (email) {
                        const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
                        if (wsService) {
                            wsService.broadcastEmailUpdate({
                                type: 'failed',
                                emailId,
                                accountId: email.accountId,
                                message: `Classification failed: ${error}`,
                            });
                        }
                    }
                }
                catch (broadcastError) {
                    logger_1.logger.error(`Failed to broadcast classification failure for email ${emailId}:`, broadcastError);
                }
            }
            throw error;
        }
    }
    /**
     * Extract financial data from a classified financial email
     */
    async extractEmailData(emailId, job) {
        try {
            await job.updateProgress(10);
            // Get email from database
            const email = await database_1.DatabaseOperations.findProcessedEmailById(emailId);
            if (!email) {
                throw new Error(`Email ${emailId} not found`);
            }
            // Broadcast extraction started
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'extracted',
                    emailId,
                    accountId: email.accountId,
                    message: 'Extracting financial data...',
                });
            }
            await job.updateProgress(30);
            // Extract financial data using OpenAI
            let extraction;
            try {
                extraction = await openaiService_1.openaiService.extractFinancialData(email.subject || '', email.bodyText || '', this.getClassificationString(email.classification) || 'other_financial', email.accountId // Pass accountId for tracking
                );
            }
            catch (extractionError) {
                logger_1.logger.error(`AI extraction failed for email ${emailId}:`, extractionError);
                // For CREDIT_CARD emails, create empty extraction record to ensure UI shows
                if (email.classification === 'CREDIT_CARD') {
                    extraction = {
                        amount: null,
                        currency: null,
                        date: null,
                        merchantName: null,
                        accountNumber: null,
                        transactionId: null,
                        transactionType: null,
                        description: null,
                        category: null,
                        bankName: null,
                        cardProcessor: null,
                        confidence: 0.0
                    };
                }
                else {
                    throw extractionError; // Re-throw for non-credit card emails
                }
            }
            await job.updateProgress(70);
            // Store extraction results
            // CRITICAL: For CREDIT_CARD emails, ALWAYS create extracted data record
            await database_1.prisma.extractedData.create({
                data: {
                    emailId: emailId,
                    transactionAmount: extraction.amount ?? null,
                    currency: extraction.currency ?? null,
                    transactionDate: extraction.date ? new Date(extraction.date) : null,
                    merchantName: extraction.merchantName ?? null,
                    merchantCategory: extraction.category ?? null,
                    accountNumber: extraction.accountNumber ?? null,
                    referenceNumber: extraction.transactionId ?? null,
                    transactionType: this.mapTransactionTypeToEnum(extraction.transactionType),
                    description: extraction.description ?? null,
                    extractionScore: extraction.confidence,
                    metadata: {
                        bankName: extraction.bankName ?? null,
                        cardProcessor: extraction.cardProcessor ?? null
                    }
                }
            });
            // Update email status
            await database_1.prisma.processedEmail.update({
                where: { id: emailId },
                data: { processingStatus: 'COMPLETED' }
            });
            await job.updateProgress(100);
            // Broadcast extraction completed with results
            const wsService2 = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService2) {
                wsService2.broadcastEmailUpdate({
                    type: 'completed',
                    emailId,
                    accountId: email.accountId,
                    message: `Data extraction completed: ${extraction.merchantName || 'Unknown'} - ${extraction.amount ? `${extraction.currency}${extraction.amount}` : 'No amount detected'}`,
                    data: {
                        extraction
                    }
                });
                // Send detailed processing update via private method  
                this.sendProcessingUpdate(wsService2, {
                    emailId,
                    accountId: email.accountId,
                    type: 'extraction_complete',
                    extraction,
                    message: `Financial data extracted from email`
                });
            }
            return {
                success: true,
                emailId,
                extraction,
            };
        }
        catch (error) {
            // Update email status to failed
            try {
                await database_1.prisma.processedEmail.update({
                    where: { id: emailId },
                    data: { processingStatus: 'FAILED' }
                });
            }
            catch (updateError) {
                logger_1.logger.error(`Failed to update email ${emailId} status to FAILED:`, updateError);
            }
            // Broadcast extraction failed
            try {
                const email = await database_1.prisma.processedEmail.findUnique({
                    where: { id: emailId }
                });
                if (email) {
                    const wsServiceError = (0, websocketService_1.getWebSocketServiceInstance)();
                    if (wsServiceError) {
                        wsServiceError.broadcastEmailUpdate({
                            type: 'failed',
                            emailId,
                            accountId: email.accountId,
                            message: `Data extraction failed: ${error}`,
                        });
                    }
                }
            }
            catch (broadcastError) {
                logger_1.logger.error(`Failed to broadcast extraction failure for email ${emailId}:`, broadcastError);
            }
            throw error;
        }
    }
    async queueClassificationJob(emailId) {
        const { QueueService } = await Promise.resolve().then(() => __importStar(require('../services/queueService')));
        const queueService = QueueService.getInstance();
        // Get the email account ID from the email record
        const email = await database_1.DatabaseOperations.findProcessedEmailById(emailId);
        if (!email) {
            throw new Error(`Email ${emailId} not found when queueing classification job`);
        }
        await queueService.addEmailProcessingJob({
            emailAccountId: email.accountId,
            emailId,
            processType: 'classify',
            priority: 5,
        });
    }
    /**
     * Map AI category to database enum
     */
    mapCategoryToEnum(category) {
        const categoryMap = {
            'banking': 'BANKING',
            'credit_card': 'CREDIT_CARD',
            'investment': 'INVESTMENT',
            'payment': 'PAYMENT',
            'subscription': 'PAYMENT', // Map subscription to PAYMENT
            'bill': 'BILL',
            'tax': 'TAX',
            'insurance': 'INSURANCE',
            'loan': 'LOAN',
            'other_financial': 'OTHER',
            'non_financial': 'UNCLASSIFIED'
        };
        return categoryMap[category] || 'UNCLASSIFIED';
    }
    /**
     * Map AI transaction type to database enum
     */
    mapTransactionTypeToEnum(transactionType) {
        if (!transactionType)
            return 'UNKNOWN';
        const typeMap = {
            'debit': 'DEBIT',
            'credit': 'CREDIT',
            'payment': 'PAYMENT',
            'transfer': 'TRANSFER',
            'fee': 'FEE',
            'interest': 'INTEREST',
            'dividend': 'DIVIDEND'
        };
        return typeMap[transactionType] || 'UNKNOWN';
    }
    /**
     * Get classification as string for AI processing
     */
    getClassificationString(classification) {
        if (typeof classification === 'string')
            return classification.toLowerCase();
        return 'other_financial';
    }
    /**
     * Send processing update via WebSocket (private method to avoid direct io access)
     */
    sendProcessingUpdate(wsService, data) {
        try {
            if (wsService && typeof wsService.broadcastEmailUpdate === 'function') {
                wsService.broadcastEmailUpdate({
                    type: 'processing_update',
                    ...data
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to send processing update:', error);
        }
    }
    async queueExtractionJob(emailId) {
        const { QueueService } = await Promise.resolve().then(() => __importStar(require('../services/queueService')));
        const queueService = QueueService.getInstance();
        // Get the email account ID from the email record
        const email = await database_1.DatabaseOperations.findProcessedEmailById(emailId);
        if (!email) {
            throw new Error(`Email ${emailId} not found when queueing extraction job`);
        }
        logger_1.logger.info(`Queueing extraction job for email ${emailId} (${email.classification})`);
        await queueService.addEmailProcessingJob({
            emailAccountId: email.accountId,
            emailId,
            processType: 'extract',
            priority: 3,
        });
    }
    async close() {
        if (this.worker) {
            await this.worker.close();
            this.isRunning = false;
            logger_1.logger.info('Email processing worker closed');
        }
    }
    get running() {
        return this.isRunning;
    }
    /**
     * Find and reprocess emails stuck at CLASSIFIED status
     */
    async processStuckEmails() {
        const errors = [];
        let processed = 0;
        try {
            // Find emails stuck at CLASSIFIED for more than 5 minutes
            const stuckEmails = await database_1.prisma.processedEmail.findMany({
                where: {
                    processingStatus: 'CLASSIFIED',
                    classification: {
                        in: ['CREDIT_CARD', 'BANKING', 'PAYMENT'] // Financial classifications that need extraction
                    },
                    updatedAt: {
                        lt: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
                    }
                },
                take: 10, // Process up to 10 at a time
                orderBy: {
                    updatedAt: 'asc'
                }
            });
            logger_1.logger.info(`Found ${stuckEmails.length} stuck emails to reprocess`);
            for (const email of stuckEmails) {
                try {
                    logger_1.logger.info(`Reprocessing stuck email ${email.id} (${email.classification})`);
                    // Queue extraction job directly
                    await this.queueExtractionJob(email.id);
                    processed++;
                }
                catch (error) {
                    const errorMsg = `Failed to reprocess email ${email.id}: ${error}`;
                    logger_1.logger.error(errorMsg);
                    errors.push(errorMsg);
                }
            }
            return { processed, errors };
        }
        catch (error) {
            const errorMsg = `Error finding stuck emails: ${error}`;
            logger_1.logger.error(errorMsg);
            return { processed, errors: [errorMsg] };
        }
    }
}
exports.EmailProcessor = EmailProcessor;
// Export singleton instance
exports.emailProcessor = new EmailProcessor();
//# sourceMappingURL=emailProcessor.js.map