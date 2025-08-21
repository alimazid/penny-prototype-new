"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseOperations = exports.runTransaction = exports.disconnectDatabase = exports.checkDatabaseHealth = exports.initializeDatabase = exports.prisma = exports.OpenAIMetrics = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
// Create Prisma client instance
const prisma = new client_1.PrismaClient({
    log: [
        {
            emit: 'event',
            level: 'query',
        },
        {
            emit: 'event',
            level: 'error',
        },
        {
            emit: 'event',
            level: 'info',
        },
        {
            emit: 'event',
            level: 'warn',
        },
    ],
    errorFormat: 'pretty',
});
exports.prisma = prisma;
// Log database queries in development
if (process.env.NODE_ENV === 'development') {
    prisma.$on('query', (e) => {
        logger_1.logger.debug('Database Query:', {
            query: e.query,
            params: e.params,
            duration: e.duration + 'ms',
        });
    });
}
// Log database errors
prisma.$on('error', (e) => {
    logger_1.logger.error('Database Error:', e);
});
// Log database info
prisma.$on('info', (e) => {
    logger_1.logger.info('Database Info:', e.message);
});
// Log database warnings
prisma.$on('warn', (e) => {
    logger_1.logger.warn('Database Warning:', e.message);
});
// Database connection helper
let isConnected = false;
const initializeDatabase = async () => {
    try {
        if (isConnected) {
            return;
        }
        // Test the connection
        await prisma.$connect();
        // Run a simple query to verify connection
        await prisma.$queryRaw `SELECT 1`;
        isConnected = true;
        logger_1.logger.info('✅ Database connection established');
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to connect to database:', error);
        throw error;
    }
};
exports.initializeDatabase = initializeDatabase;
// Database health check
const checkDatabaseHealth = async () => {
    try {
        await prisma.$queryRaw `SELECT 1`;
        return true;
    }
    catch (error) {
        logger_1.logger.error('Database health check failed:', error);
        return false;
    }
};
exports.checkDatabaseHealth = checkDatabaseHealth;
// Graceful disconnect
const disconnectDatabase = async () => {
    try {
        await prisma.$disconnect();
        isConnected = false;
        logger_1.logger.info('📊 Database disconnected');
    }
    catch (error) {
        logger_1.logger.error('Error disconnecting from database:', error);
    }
};
exports.disconnectDatabase = disconnectDatabase;
// Database transaction helper
const runTransaction = async (fn) => {
    return await prisma.$transaction(fn);
};
exports.runTransaction = runTransaction;
// Common database operations for the prototype
const DatabaseOperations = {
    // User operations
    async createUser(data) {
        return await prisma.user.create({
            data: {
                email: data.email,
                displayName: data.displayName ?? null,
                language: data.language || 'en',
                currency: data.currency || 'USD',
                timezone: data.timezone || 'UTC',
            },
        });
    },
    async findUserByEmail(email) {
        return await prisma.user.findUnique({
            where: { email },
            include: {
                emailAccounts: true,
            },
        });
    },
    // Email account operations
    async createEmailAccount(data) {
        return await prisma.emailAccount.create({
            data,
        });
    },
    async updateEmailAccountTokens(accountId, tokens) {
        return await prisma.emailAccount.update({
            where: { id: accountId },
            data: {
                ...tokens,
                lastSyncAt: new Date(),
                errorCount: 0,
            },
        });
    },
    // Processed email operations
    async createProcessedEmail(data) {
        return await prisma.processedEmail.create({
            data: {
                ...data,
                toAddresses: data.toAddresses,
                gmailLabels: data.gmailLabels || [],
                language: data.language || 'en',
            },
        });
    },
    async updateEmailClassification(emailId, classification, confidenceScore) {
        return await prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                classification,
                confidenceScore,
                processingStatus: 'CLASSIFIED',
            },
        });
    },
    async updateEmailProcessingStatus(emailId, status, errorMessage) {
        return await prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                processingStatus: status,
                errorMessage: errorMessage ?? null,
                updatedAt: new Date(),
            },
        });
    },
    // Extracted data operations
    async createExtractedData(data) {
        return await prisma.extractedData.create({
            data: {
                ...data,
                metadata: data.metadata || {},
            },
        });
    },
    // Audit log operations
    async createAuditLog(data) {
        return await prisma.auditLog.create({
            data: {
                ...data,
                metadata: data.metadata || {},
            },
        });
    },
    // Performance metrics
    async recordPerformanceMetric(data) {
        return await prisma.performanceMetric.create({
            data: {
                ...data,
                metricUnit: data.metricUnit || 'ms',
                category: data.category || 'processing',
                tags: data.tags || {},
            },
        });
    },
    // Queue job tracking
    async createQueueJob(data) {
        return await prisma.queueJob.create({
            data: {
                ...data,
                data: data.data || {},
                maxAttempts: data.maxAttempts || 3,
            },
        });
    },
    async updateQueueJobStatus(jobId, status, data) {
        const updateData = { status };
        if (data?.progress !== undefined)
            updateData.progress = data.progress;
        if (data?.result !== undefined)
            updateData.result = data.result;
        if (data?.error !== undefined)
            updateData.error = data.error;
        if (data?.attempts !== undefined)
            updateData.attempts = data.attempts;
        if (status === 'ACTIVE')
            updateData.startedAt = new Date();
        if (status === 'COMPLETED')
            updateData.completedAt = new Date();
        if (status === 'FAILED')
            updateData.failedAt = new Date();
        return await prisma.queueJob.update({
            where: { jobId },
            data: updateData,
        });
    },
    // Additional operations needed by email processor
    async findEmailAccountById(accountId) {
        return await prisma.emailAccount.findUnique({
            where: { id: accountId },
            include: { user: true },
        });
    },
    async findProcessedEmailByGmailId(gmailId) {
        return await prisma.processedEmail.findUnique({
            where: { gmailId },
        });
    },
    async findProcessedEmailById(emailId) {
        return await prisma.processedEmail.findUnique({
            where: { id: emailId },
        });
    },
    async createProcessedEmailRecord(data) {
        return await prisma.processedEmail.create({
            data: {
                gmailId: data.gmailId,
                accountId: data.emailAccountId,
                messageId: `msg_${data.gmailId}`,
                threadId: data.threadId ?? null,
                subject: data.subject || '',
                fromAddress: data.sender || '',
                toAddresses: data.recipient ? [data.recipient] : [],
                receivedAt: data.receivedAt || new Date(),
                contentHash: `hash_${data.gmailId}`,
                bodyPreview: data.bodyText?.substring(0, 500) ?? null,
                bodyText: data.bodyText ?? null, // Store full email content for AI processing
                hasAttachments: data.hasAttachments || false,
                gmailLabels: data.labelIds || [],
                processingStatus: 'PENDING',
            },
        });
    },
    async updateEmailAccountSyncTime(accountId) {
        return await prisma.emailAccount.update({
            where: { id: accountId },
            data: { lastSyncAt: new Date() },
        });
    },
    async updateProcessedEmailClassification(emailId, data) {
        return await prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                classification: data.category,
                language: data.language,
                confidenceScore: data.confidence,
                processingStatus: data.status === 'classified' ? 'CLASSIFIED' : 'COMPLETED',
            },
        });
    },
    async updateProcessedEmailExtraction(emailId, data) {
        // Also create extracted data record
        if (data.amount || data.merchantName) {
            await prisma.extractedData.create({
                data: {
                    emailId,
                    transactionAmount: data.amount ?? null,
                    currency: data.currency ?? null,
                    transactionDate: data.date ? new Date(data.date) : null,
                    merchantName: data.merchantName ?? null,
                    merchantCategory: data.extractedCategory ?? null,
                    accountNumber: data.accountNumber ?? null,
                    transactionType: data.transactionType,
                    description: data.description ?? null,
                    referenceNumber: data.transactionId ?? null,
                    extractionScore: data.extractionConfidence,
                },
            });
        }
        return await prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                processingStatus: 'COMPLETED',
            },
        });
    },
    async updateProcessedEmailStatus(emailId, status) {
        return await prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                processingStatus: status.toUpperCase(),
            },
        });
    },
};
exports.DatabaseOperations = DatabaseOperations;
// OpenAI call tracking utilities
exports.OpenAIMetrics = {
    async recordAPICall(accountId, operation, model = 'gpt-4o-mini') {
        try {
            await prisma.performanceMetric.create({
                data: {
                    metricName: 'openai_api_call',
                    metricValue: 1,
                    metricUnit: 'calls',
                    category: 'ai_processing',
                    tags: {
                        accountId,
                        operation,
                        model,
                        timestamp: new Date().toISOString()
                    }
                }
            });
            logger_1.logger.debug(`Recorded OpenAI ${operation} call for account ${accountId}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to record OpenAI API call metric:', error);
        }
    },
    async getAccountCallCount(accountId) {
        try {
            const result = await prisma.performanceMetric.aggregate({
                _sum: {
                    metricValue: true
                },
                where: {
                    metricName: 'openai_api_call',
                    category: 'ai_processing',
                    tags: {
                        path: ['accountId'],
                        equals: accountId
                    }
                }
            });
            return Math.floor(Number(result._sum.metricValue || 0));
        }
        catch (error) {
            logger_1.logger.error('Failed to get OpenAI call count for account:', error);
            return 0;
        }
    },
    async clearAccountMetrics(accountId) {
        try {
            const deleted = await prisma.performanceMetric.deleteMany({
                where: {
                    metricName: 'openai_api_call',
                    category: 'ai_processing',
                    tags: {
                        path: ['accountId'],
                        equals: accountId
                    }
                }
            });
            logger_1.logger.info(`Cleared ${deleted.count} OpenAI metrics for account ${accountId}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to clear OpenAI metrics for account:', error);
        }
    },
    async clearAllMetrics() {
        try {
            const deleted = await prisma.performanceMetric.deleteMany({
                where: {
                    metricName: 'openai_api_call',
                    category: 'ai_processing'
                }
            });
            logger_1.logger.info(`Cleared ${deleted.count} OpenAI metrics for all accounts`);
        }
        catch (error) {
            logger_1.logger.error('Failed to clear all OpenAI metrics:', error);
        }
    }
};
//# sourceMappingURL=database.js.map