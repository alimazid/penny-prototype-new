import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Create Prisma client instance
const prisma = new PrismaClient({
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

// Log database queries in development
if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug('Database Query:', {
      query: e.query,
      params: e.params,
      duration: e.duration + 'ms',
    });
  });
}

// Log database errors
prisma.$on('error', (e) => {
  logger.error('Database Error:', e);
});

// Log database info
prisma.$on('info', (e) => {
  logger.info('Database Info:', e.message);
});

// Log database warnings
prisma.$on('warn', (e) => {
  logger.warn('Database Warning:', e.message);
});

// Database connection helper
let isConnected = false;

const initializeDatabase = async (): Promise<void> => {
  try {
    if (isConnected) {
      return;
    }

    // Test the connection
    await prisma.$connect();
    
    // Run a simple query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    
    isConnected = true;
    logger.info('✅ Database connection established');
  } catch (error) {
    logger.error('❌ Failed to connect to database:', error);
    throw error;
  }
};

// Database health check
const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
};

// Graceful disconnect
const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    isConnected = false;
    logger.info('📊 Database disconnected');
  } catch (error) {
    logger.error('Error disconnecting from database:', error);
  }
};

// Database transaction helper
const runTransaction = async <T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> => {
  return await prisma.$transaction(fn);
};

// Common database operations for the prototype
const DatabaseOperations = {
  // User operations
  async createUser(data: {
    email: string;
    displayName?: string;
    language?: string;
    currency?: string;
    timezone?: string;
  }) {
    return await prisma.user.create({
      data: {
        email: data.email,
        displayName: data.displayName,
        language: data.language || 'en',
        currency: data.currency || 'USD',
        timezone: data.timezone || 'UTC',
      },
    });
  },

  async findUserByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
      include: {
        emailAccounts: true,
      },
    });
  },

  // Email account operations
  async createEmailAccount(data: {
    userId: string;
    gmailAddress: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt?: Date;
  }) {
    return await prisma.emailAccount.create({
      data,
    });
  },

  async updateEmailAccountTokens(
    accountId: string,
    tokens: {
      accessToken: string;
      refreshToken: string;
      tokenExpiresAt?: Date;
    }
  ) {
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
  async createProcessedEmail(data: {
    accountId: string;
    gmailId: string;
    messageId: string;
    threadId?: string;
    subject: string;
    fromAddress: string;
    toAddresses: string[];
    receivedAt: Date;
    contentHash: string;
    bodyPreview?: string;
    bodyText?: string;
    hasAttachments?: boolean;
    language?: string;
    gmailLabels?: string[];
  }) {
    return await prisma.processedEmail.create({
      data: {
        ...data,
        toAddresses: data.toAddresses,
        gmailLabels: data.gmailLabels || [],
        language: data.language || 'en',
      },
    });
  },

  async updateEmailClassification(
    emailId: string,
    classification: any,
    confidenceScore: number
  ) {
    return await prisma.processedEmail.update({
      where: { id: emailId },
      data: {
        classification,
        confidenceScore,
        processingStatus: 'CLASSIFIED',
      },
    });
  },

  async updateEmailProcessingStatus(
    emailId: string,
    status: any,
    errorMessage?: string
  ) {
    return await prisma.processedEmail.update({
      where: { id: emailId },
      data: {
        processingStatus: status,
        errorMessage,
        updatedAt: new Date(),
      },
    });
  },

  // Extracted data operations
  async createExtractedData(data: {
    emailId: string;
    transactionAmount?: number;
    currency?: string;
    amountUSD?: number;
    exchangeRate?: number;
    transactionDate?: Date;
    merchantName?: string;
    merchantCategory?: string;
    accountNumber?: string;
    transactionType?: any;
    description?: string;
    referenceNumber?: string;
    balance?: number;
    metadata?: any;
    extractionScore?: number;
  }) {
    return await prisma.extractedData.create({
      data: {
        ...data,
        metadata: data.metadata || {},
      },
    });
  },

  // Audit log operations
  async createAuditLog(data: {
    userId?: string;
    emailId?: string;
    action: any;
    entityType?: string;
    entityId?: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
  }) {
    return await prisma.auditLog.create({
      data: {
        ...data,
        metadata: data.metadata || {},
      },
    });
  },

  // Performance metrics
  async recordPerformanceMetric(data: {
    metricName: string;
    metricValue: number;
    metricUnit?: string;
    category?: string;
    tags?: any;
  }) {
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
  async createQueueJob(data: {
    jobId: string;
    queueName: string;
    jobType: string;
    priority?: number;
    data?: any;
    maxAttempts?: number;
  }) {
    return await prisma.queueJob.create({
      data: {
        ...data,
        data: data.data || {},
        maxAttempts: data.maxAttempts || 3,
      },
    });
  },

  async updateQueueJobStatus(
    jobId: string,
    status: any,
    data?: {
      progress?: number;
      result?: any;
      error?: string;
      attempts?: number;
    }
  ) {
    const updateData: any = { status };
    
    if (data?.progress !== undefined) updateData.progress = data.progress;
    if (data?.result !== undefined) updateData.result = data.result;
    if (data?.error !== undefined) updateData.error = data.error;
    if (data?.attempts !== undefined) updateData.attempts = data.attempts;

    if (status === 'ACTIVE') updateData.startedAt = new Date();
    if (status === 'COMPLETED') updateData.completedAt = new Date();
    if (status === 'FAILED') updateData.failedAt = new Date();

    return await prisma.queueJob.update({
      where: { jobId },
      data: updateData,
    });
  },

  // Additional operations needed by email processor
  async findEmailAccountById(accountId: string) {
    return await prisma.emailAccount.findUnique({
      where: { id: accountId },
      include: { user: true },
    });
  },

  async findProcessedEmailByGmailId(gmailId: string) {
    return await prisma.processedEmail.findUnique({
      where: { gmailId },
    });
  },

  async findProcessedEmailById(emailId: string) {
    return await prisma.processedEmail.findUnique({
      where: { id: emailId },
    });
  },

  async createProcessedEmail(data: {
    gmailId: string;
    emailAccountId: string;
    subject?: string;
    sender?: string;
    recipient?: string;
    bodyText?: string;
    bodyHtml?: string;
    receivedAt?: Date;
    threadId?: string;
    labelIds?: string[];
    hasAttachments?: boolean;
    status?: string;
  }) {
    return await prisma.processedEmail.create({
      data: {
        gmailId: data.gmailId,
        accountId: data.emailAccountId,
        messageId: `msg_${data.gmailId}`,
        threadId: data.threadId,
        subject: data.subject || '',
        fromAddress: data.sender || '',
        toAddresses: data.recipient ? [data.recipient] : [],
        receivedAt: data.receivedAt || new Date(),
        contentHash: `hash_${data.gmailId}`,
        bodyPreview: data.bodyText?.substring(0, 500),
        bodyText: data.bodyText, // Store full email content for AI processing
        hasAttachments: data.hasAttachments || false,
        gmailLabels: data.labelIds || [],
        processingStatus: 'PENDING',
      },
    });
  },

  async updateEmailAccountSyncTime(accountId: string) {
    return await prisma.emailAccount.update({
      where: { id: accountId },
      data: { lastSyncAt: new Date() },
    });
  },

  async updateProcessedEmailClassification(emailId: string, data: {
    isFinancial: boolean;
    category: string;
    subcategory?: string;
    confidence: number;
    language: string;
    currency?: string;
    aiReasoning: string;
    status: string;
  }) {
    return await prisma.processedEmail.update({
      where: { id: emailId },
      data: {
        classification: {
          isFinancial: data.isFinancial,
          category: data.category,
          subcategory: data.subcategory,
          language: data.language,
          currency: data.currency,
          reasoning: data.aiReasoning,
        },
        confidenceScore: data.confidence,
        processingStatus: data.status === 'classified' ? 'CLASSIFIED' : 'COMPLETED',
      },
    });
  },

  async updateProcessedEmailExtraction(emailId: string, data: {
    amount?: number;
    currency?: string;
    date?: string;
    merchantName?: string;
    accountNumber?: string;
    transactionId?: string;
    transactionType?: string;
    description?: string;
    extractedCategory?: string;
    extractionConfidence: number;
    status: string;
  }) {
    // Also create extracted data record
    if (data.amount || data.merchantName) {
      await prisma.extractedData.create({
        data: {
          emailId,
          transactionAmount: data.amount,
          currency: data.currency,
          transactionDate: data.date ? new Date(data.date) : undefined,
          merchantName: data.merchantName,
          merchantCategory: data.extractedCategory,
          accountNumber: data.accountNumber,
          transactionType: data.transactionType as any,
          description: data.description,
          referenceNumber: data.transactionId,
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

  async updateProcessedEmailStatus(emailId: string, status: string) {
    return await prisma.processedEmail.update({
      where: { id: emailId },
      data: {
        processingStatus: status.toUpperCase() as any,
      },
    });
  },
};

// OpenAI call tracking utilities
export const OpenAIMetrics = {
  async recordAPICall(accountId: string, operation: 'classification' | 'extraction', model: string = 'gpt-4o-mini') {
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
      logger.debug(`Recorded OpenAI ${operation} call for account ${accountId}`);
    } catch (error) {
      logger.error('Failed to record OpenAI API call metric:', error);
    }
  },

  async getAccountCallCount(accountId: string): Promise<number> {
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
    } catch (error) {
      logger.error('Failed to get OpenAI call count for account:', error);
      return 0;
    }
  },

  async clearAccountMetrics(accountId: string) {
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
      logger.info(`Cleared ${deleted.count} OpenAI metrics for account ${accountId}`);
    } catch (error) {
      logger.error('Failed to clear OpenAI metrics for account:', error);
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
      logger.info(`Cleared ${deleted.count} OpenAI metrics for all accounts`);
    } catch (error) {
      logger.error('Failed to clear all OpenAI metrics:', error);
    }
  }
};

export {
  prisma,
  initializeDatabase,
  checkDatabaseHealth,
  disconnectDatabase,
  runTransaction,
  DatabaseOperations,
};