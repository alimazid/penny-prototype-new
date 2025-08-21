import express, { Router } from 'express';
import { PerformanceMonitor } from '../utils/performance';
import { DatabaseOperations, prisma, OpenAIMetrics } from '../utils/database';
import { logger } from '../utils/logger';
import { checkDatabaseHealth } from '../utils/database';
import { checkRedisHealth } from '../utils/redis';
import { sampleEmailGenerator } from '../utils/sampleEmails';
import { QueueService } from '../services/queueService';

const router: Router = express.Router();

// Performance metrics endpoint
router.get('/metrics', async (_req, res) => {
  try {
    const metrics = PerformanceMonitor.getAllMetrics();
    const systemMetrics = PerformanceMonitor.getSystemMetrics();
    
    res.json({
      performance: metrics,
      system: systemMetrics,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching metrics:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Performance report
router.get('/performance/report', async (_req, res) => {
  try {
    const report = PerformanceMonitor.generateReport();
    res.json(report);
  } catch (error) {
    logger.error('Error generating performance report:', error);
    res.status(500).json({ error: 'Failed to generate performance report' });
  }
});

// System status
router.get('/status', async (_req, res) => {
  try {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth()
    ]);
    
    const status = {
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: redisHealthy ? 'healthy' : 'unhealthy',
        api: 'healthy'
      },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    const hasUnhealthyServices = Object.values(status.services).some(s => s === 'unhealthy');
    if (hasUnhealthyServices) {
      status.status = 'degraded';
    }
    
    res.status(hasUnhealthyServices ? 503 : 200).json(status);
  } catch (error) {
    logger.error('Error checking system status:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Failed to check system status'
    });
  }
});

// Database statistics
router.get('/stats/database', async (_req, res) => {
  try {
    const [userCount, accountCount, emailCount, extractedCount] = await Promise.all([
      prisma.user.count(),
      prisma.emailAccount.count(),
      prisma.processedEmail.count(),
      prisma.extractedData.count()
    ]);
    
    res.json({
      users: userCount,
      emailAccounts: accountCount,
      processedEmails: emailCount,
      extractedData: extractedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching database stats:', error);
    res.status(500).json({ error: 'Failed to fetch database statistics' });
  }
});

// Recent activity
router.get('/activity/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    
    const [recentEmails, recentAuditLogs] = await Promise.all([
      prisma.processedEmail.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          account: {
            include: { user: true }
          }
        }
      }),
      prisma.auditLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' }
      })
    ]);
    
    res.json({
      recentEmails,
      recentActivity: recentAuditLogs,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching recent activity:', error);
    res.status(500).json({ error: 'Failed to fetch recent activity' });
  }
});

// Account-specific queue statistics
router.get('/queue/stats', async (req, res) => {
  try {
    const accountId = req.query.accountId as string;
    
    if (!accountId) {
      return res.status(400).json({ 
        error: 'accountId parameter is required',
        message: 'Please specify which email account to get statistics for'
      });
    }

    // Verify account exists
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId }
    });

    if (!account) {
      return res.status(404).json({ 
        error: 'Account not found',
        message: 'The specified email account does not exist'
      });
    }

    const { QueueService } = await import('../services/queueService');
    const queueService = QueueService.getInstance();
    const queueStats = await queueService.getQueueStats();
    
    // Get account-specific processing stats from database
    const accountFilter = { accountId };
    
    const [totalEmails, classifiedEmails, extractedEmails, financialEmails, openaiCalls] = await Promise.all([
      // Total emails received for this account
      prisma.processedEmail.count({
        where: accountFilter
      }),
      // Successfully classified emails for this account
      prisma.processedEmail.count({
        where: {
          ...accountFilter,
          processingStatus: {
            in: ['CLASSIFIED', 'COMPLETED']
          }
        }
      }),
      // Emails with extracted data for this account
      prisma.processedEmail.count({
        where: {
          ...accountFilter,
          extractedData: {
            isNot: null
          }
        }
      }),
      // Financial emails for this account
      prisma.processedEmail.count({
        where: {
          ...accountFilter,
          classification: {
            in: ['BANKING', 'CREDIT_CARD', 'INVESTMENT', 'PAYMENT', 'BILL', 'INSURANCE', 'TAX', 'LOAN']
          }
        }
      }),
      // OpenAI API calls for this account
      OpenAIMetrics.getAccountCallCount(accountId)
    ]);
    
    res.json({
      accountId,
      accountEmail: account.gmailAddress,
      // Account-specific counters
      emailsReceived: totalEmails,
      aiClassified: classifiedEmails,
      financialEmails: financialEmails, // Moved before dataExtracted per user request
      dataExtracted: extractedEmails,
      openaiCalls: openaiCalls,
      
      // Global queue status for monitoring
      queue: {
        waiting: queueStats.waiting || 0,
        active: queueStats.active || 0,
        completed: queueStats.completed || 0,
        failed: queueStats.failed || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching account-specific queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
});

// Configuration info (non-sensitive)
router.get('/config', (req, res) => {
  try {
    res.json({
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      features: {
        aiClassification: !!process.env.OPENAI_API_KEY,
        gmailIntegration: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
        webhooks: !!process.env.WEBHOOK_BASE_URL,
        realTimeUpdates: true
      },
      settings: {
        maxEmailsPerBatch: process.env.MAX_EMAILS_PER_BATCH || '10',
        processingTimeout: process.env.PROCESSING_TIMEOUT_SECONDS || '30',
        supportedLanguages: (process.env.SUPPORTED_LANGUAGES || 'en').split(','),
        supportedCurrencies: (process.env.SUPPORTED_CURRENCIES || 'USD').split(',')
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch configuration' });
  }
});

// Development/Testing endpoints
router.get('/testing/env', (req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    isDevelopment: process.env.NODE_ENV === 'development',
    timestamp: new Date().toISOString()
  });
});

// Test OpenAI service directly
router.post('/testing/test-openai', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development mode' });
  }
  
  try {
    const { subject, body, sender } = req.body;
    
    // Use sample data if not provided
    const testSubject = subject || "Transaction Alert: $45.99 at Amazon";
    const testBody = body || `Dear Customer,

A transaction has been processed on your Bank of America account ending in 1234.

Transaction Details:
Amount: $45.99
Merchant: Amazon
Date: 7/26/2025
Time: 10:35 AM
Available Balance: $3,456.78

If you did not authorize this transaction, please contact us immediately.

Best regards,
Bank of America Customer Service`;
    const testSender = sender || "alerts@bankofamerica.com";

    // Test classification
    const { openaiService } = await import('../services/openaiService');
    const classification = await openaiService.classifyEmail(testSubject, testBody, testSender);

    let extraction = null;
    if (classification.isFinancial) {
      // Test extraction
      extraction = await openaiService.extractFinancialData(testSubject, testBody, classification.category);
    }

    res.json({
      success: true,
      testEmail: {
        subject: testSubject,
        body: testBody.substring(0, 200) + "...",
        sender: testSender
      },
      classification,
      extraction,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error testing OpenAI service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test OpenAI service',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Generate sample emails for testing (moved outside conditional for testing)
router.post('/testing/generate-emails', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development mode' });
  }
    try {
      const count = parseInt(req.body.count as string) || 20;
      
      // Create a test user and email account if they don't exist
      let testUser = await DatabaseOperations.findUserByEmail('test@example.com');
      if (!testUser) {
        testUser = await DatabaseOperations.createUser({
          email: 'test@example.com',
          displayName: 'Test User',
          language: 'en',
          currency: 'USD',
          timezone: 'UTC'
        });
      }

      let testAccount = await prisma.emailAccount.findFirst({
        where: { userId: testUser.id }
      });
      
      if (!testAccount) {
        testAccount = await DatabaseOperations.createEmailAccount({
          userId: testUser.id,
          gmailAddress: 'test@example.com',
          accessToken: 'test_access_token',
          refreshToken: 'test_refresh_token'
        });
      }

      // Generate sample emails
      const sampleEmails = sampleEmailGenerator.generateSampleEmails(count);
      const createdEmails = [];

      // Import WebSocket service for broadcasting updates
      const { getWebSocketServiceInstance } = await import('../services/websocketService');
      const wsService = getWebSocketServiceInstance();

      for (const email of sampleEmails) {
        const processedEmail = await DatabaseOperations.createProcessedEmail({
          gmailId: email.id,
          emailAccountId: testAccount.id,
          subject: email.subject,
          sender: email.from,
          recipient: email.to,
          bodyText: email.body,
          bodyHtml: email.bodyHtml,
          receivedAt: email.date,
          threadId: email.threadId,
          labelIds: email.labelIds,
          hasAttachments: !!email.attachments?.length
        });

        createdEmails.push(processedEmail);

        // Broadcast email update via WebSocket
        if (wsService) {
          wsService.broadcastEmailUpdate({
            type: 'completed',
            emailId: processedEmail.id,
            accountId: testAccount.id,
            message: `Generated sample email: ${email.subject}`,
            data: {
              subject: email.subject,
              sender: email.from,
              receivedAt: email.date
            }
          });
        }
      }

      logger.info(`Generated ${createdEmails.length} sample emails for testing`);

      res.json({
        success: true,
        message: `Generated ${createdEmails.length} sample emails`,
        emails: createdEmails.map(e => ({
          id: e.id,
          subject: e.subject,
          sender: e.fromAddress,
          receivedAt: e.receivedAt
        })),
        timestamp: new Date().toISOString()
      });

  } catch (error) {
    logger.error('Error generating sample emails:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate sample emails',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Process sample emails through the AI pipeline
router.post('/testing/process-emails', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development mode' });
  }
    try {
      const emailIds = req.body.emailIds as string[];
      const processAll = req.body.processAll as boolean;
      
      let emailsToProcess: string[] = [];

      if (processAll) {
        // Get all pending emails
        const pendingEmails = await prisma.processedEmail.findMany({
          where: { 
            processingStatus: 'PENDING'
          },
          select: { id: true }
        });
        emailsToProcess = pendingEmails.map(e => e.id);
      } else if (emailIds && emailIds.length > 0) {
        emailsToProcess = emailIds;
      } else {
        return res.status(400).json({
          success: false,
          error: 'Please provide emailIds or set processAll to true'
        });
      }

      if (emailsToProcess.length === 0) {
        return res.json({
          success: true,
          message: 'No emails to process',
          processedCount: 0
        });
      }

      // Queue classification jobs for each email
      const queueService = QueueService.getInstance();
      const queuedJobs = [];

      for (const emailId of emailsToProcess) {
        try {
          const job = await queueService.addEmailProcessingJob({
            emailAccountId: '', // Will be populated from email record
            emailId,
            processType: 'classify',
            priority: 5
          });
          queuedJobs.push(job);
        } catch (error) {
          logger.error(`Failed to queue job for email ${emailId}:`, error);
        }
      }

      logger.info(`Queued ${queuedJobs.length} email processing jobs`);

      res.json({
        success: true,
        message: `Queued ${queuedJobs.length} emails for processing`,
        queuedJobs: queuedJobs.map(job => ({
          id: job.id,
          emailId: job.data.emailId,
          status: 'queued'
        })),
        timestamp: new Date().toISOString()
      });

  } catch (error) {
    logger.error('Error processing sample emails:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process emails',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Clear test data (optionally account-specific)
router.delete('/testing/clear-data', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development mode' });
  }
    try {
      const accountId = req.query.accountId as string;
      
      if (accountId) {
        // Clear data for specific account only
        console.log(`Clearing data for account: ${accountId}`);
        
        // Delete in correct order due to foreign key constraints
        await prisma.extractedData.deleteMany({
          where: {
            email: {
              accountId: accountId
            }
          }
        });
        
        await prisma.processedEmail.deleteMany({
          where: { accountId: accountId }
        });
        
        // Clear OpenAI metrics for this account
        await OpenAIMetrics.clearAccountMetrics(accountId);
        
        logger.info(`Cleared test data for account ${accountId}`);
        
        res.json({
          success: true,
          message: `Test data cleared for account ${accountId}`,
          accountId: accountId,
          timestamp: new Date().toISOString()
        });
      } else {
        // Clear all data (original behavior)
        console.log('Clearing all test data');
        
        // Delete in correct order due to foreign key constraints
        await prisma.extractedData.deleteMany({});
        await prisma.processedEmail.deleteMany({});
        await prisma.emailAccount.deleteMany({});
        await prisma.user.deleteMany({});
        await prisma.auditLog.deleteMany({});
        await prisma.performanceMetric.deleteMany({});
        await prisma.queueJob.deleteMany({});
        
        // Clear all OpenAI metrics
        await OpenAIMetrics.clearAllMetrics();

        logger.info('Cleared all test data from database');

        res.json({
          success: true,
          message: 'All test data cleared successfully',
          timestamp: new Date().toISOString()
        });
      }

  } catch (error) {
    logger.error('Error clearing test data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear test data',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create test Gmail account for development
router.post('/testing/create-gmail-account', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({ error: 'This endpoint is only available in development mode' });
  }
  
  try {
    const { email = 'amiramazid24@gmail.com', userName = 'Test User' } = req.body;
    
    // Create or find test user
    let user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          displayName: userName,
        }
      });
    }
    
    // Check if account already exists
    const existingAccount = await prisma.emailAccount.findUnique({
      where: { 
        userId_gmailAddress: {
          userId: user.id,
          gmailAddress: email
        }
      }
    });
    
    if (existingAccount) {
      return res.json({
        success: true,
        message: 'Gmail account already exists',
        account: {
          id: existingAccount.id,
          email: existingAccount.gmailAddress,
          isConnected: existingAccount.isConnected
        }
      });
    }
    
    // Create email account
    const account = await prisma.emailAccount.create({
      data: {
        userId: user.id,
        gmailAddress: email,
        accessToken: 'test-access-token-' + Date.now(),
        refreshToken: 'test-refresh-token-' + Date.now(),
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        isConnected: true,
      }
    });
    
    logger.info(`Created test Gmail account: ${email}`);
    
    res.json({
      success: true,
      message: 'Test Gmail account created successfully',
      account: {
        id: account.id,
        email: account.gmailAddress,
        isConnected: account.isConnected
      }
    });
    
  } catch (error) {
    logger.error('Error creating test Gmail account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create test Gmail account',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;