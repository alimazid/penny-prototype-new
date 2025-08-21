import express, { Router } from 'express';
import { GmailService } from '../services/gmailService';
import { DatabaseOperations, prisma } from '../utils/database';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance';

const router: Router = express.Router();

// Get processed emails
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const emails = await prisma.processedEmail.findMany({
      take: limit,
      skip: offset,
      orderBy: { receivedAt: 'desc' },
      include: {
        extractedData: true,
        account: {
          include: { user: true }
        }
      }
    });
    
    res.json({
      emails,
      pagination: {
        limit,
        offset,
        total: await prisma.processedEmail.count()
      }
    });
  } catch (error) {
    logger.error('Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// Get email by ID
router.get('/:id', async (req, res) => {
  try {
    const emailId = req.params.id;
    
    const email = await prisma.processedEmail.findUnique({
      where: { id: emailId },
      include: {
        extractedData: true,
        account: {
          include: { user: true }
        }
      }
    });
    
    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }
    
    res.json(email);
  } catch (error) {
    logger.error('Error fetching email:', error);
    res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// Trigger email sync for an account
router.post('/sync/:accountId', async (req, res) => {
  try {
    const accountId = req.params.accountId;
    
    const account = await prisma.emailAccount.findUnique({
      where: { id: accountId }
    });
    
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Create Gmail service with stored credentials
    const gmailService = GmailService.withCredentials({
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiryDate: account.tokenExpiresAt?.getTime() || Date.now() + 3600000,
    });
    
    // Validate credentials
    const isValid = await gmailService.validateCredentials();
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials, re-authentication required' });
    }
    
    const timer = PerformanceMonitor.timer('email.sync');
    
    // Fetch ALL recent emails (let AI classify them)
    const { messages } = await gmailService.listRecentEmails(20, undefined, 1); // Get 20 emails from last 1 day
    
    logger.info(`Found ${messages.length} recent emails for account ${accountId}`);
    
    // Process each email (simplified for prototype)
    const processedEmails = [];
    for (const message of messages) {
      try {
        const emailDetails = await gmailService.getEmailMessage(message.id);
        
        // Check if already processed
        const existing = await prisma.processedEmail.findFirst({
          where: { gmailId: emailDetails.id }
        });
        
        if (!existing) {
          const processedEmail = await DatabaseOperations.createProcessedEmail({
            accountId: account.id,
            gmailId: emailDetails.id,
            messageId: emailDetails.messageId,
            threadId: emailDetails.threadId,
            subject: emailDetails.subject,
            fromAddress: emailDetails.from,
            toAddresses: emailDetails.to,
            receivedAt: emailDetails.date,
            contentHash: gmailService.generateContentHash(emailDetails),
            bodyPreview: emailDetails.bodyPreview,
            hasAttachments: emailDetails.hasAttachments,
            gmailLabels: emailDetails.labels,
          });
          
          processedEmails.push(processedEmail);
        }
      } catch (emailError) {
        logger.error(`Error processing email ${message.id}:`, emailError);
      }
    }
    
    await timer.end({ success: true, emailCount: processedEmails.length });
    
    res.json({
      message: 'Email sync completed',
      processed: processedEmails.length,
      total: messages.length
    });
    
  } catch (error) {
    logger.error('Error syncing emails:', error);
    res.status(500).json({ error: 'Failed to sync emails' });
  }
});

// Get email statistics
router.get('/stats/summary', async (_req, res) => {
  try {
    const stats = await prisma.processedEmail.aggregate({
      _count: {
        id: true
      },
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    });
    
    const classifiedCount = await prisma.processedEmail.count({
      where: {
        processingStatus: {
          in: ['CLASSIFIED', 'COMPLETED'] // Count all successfully classified emails
        },
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    });
    
    const extractedCount = await prisma.extractedData.count({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        }
      }
    });
    
    res.json({
      totalEmails: stats._count.id,
      classifiedEmails: classifiedCount,
      extractedData: extractedCount,
      period: 'last30Days'
    });
  } catch (error) {
    logger.error('Error fetching email stats:', error);
    res.status(500).json({ error: 'Failed to fetch email statistics' });
  }
});

export default router;