import { Job, Worker } from 'bullmq';
import { GmailService } from '../services/gmailService';
import { openaiService } from '../services/openaiService';
import { DatabaseOperations, prisma } from '../utils/database';
import { getWebSocketServiceInstance } from '../services/websocketService';
import { logger } from '../utils/logger';
import { redisConnection } from '../utils/redis';

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

export class EmailProcessor {
  private worker: Worker;
  private isRunning: boolean = false;

  constructor() {
    this.worker = new Worker(
      'email-processing',
      this.processJob.bind(this),
      {
        connection: redisConnection,
        concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '2'),
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      }
    );

    this.worker.on('ready', () => {
      logger.info('Email processing worker ready');
      this.isRunning = true;
    });

    this.worker.on('error', (error) => {
      logger.error('Email processing worker error:', error);
    });

    this.worker.on('failed', (job, error) => {
      logger.error(`Email processing job ${job?.id} failed:`, error);
    });

    this.worker.on('completed', (job, result) => {
      logger.info(`Email processing job ${job.id} completed:`, result);
    });
  }

  private async processJob(job: Job<EmailProcessingJob>): Promise<EmailProcessingResult> {
    const { emailAccountId, emailId, processType } = job.data;

    logger.info(`Processing ${processType} job for account ${emailAccountId}`, {
      jobId: job.id,
      emailId,
    });

    try {
      switch (processType) {
        case 'sync':
          return await this.syncEmails(emailAccountId, job);
        case 'classify':
          return await this.classifyEmail(emailId!, job);
        case 'extract':
          return await this.extractEmailData(emailId!, job);
        default:
          throw new Error(`Unknown process type: ${processType}`);
      }
    } catch (error) {
      logger.error(`Error processing ${processType} job:`, error);
      
      // Update email status to failed if we have an emailId
      if (emailId) {
        try {
          await prisma.processedEmail.update({
            where: { id: emailId },
            data: { processingStatus: 'FAILED' }
          });
          
          // Broadcast failure
          const wsService = getWebSocketServiceInstance();
          if (wsService) {
            wsService.broadcastEmailUpdate({
              type: 'failed',
              emailId,
              accountId: emailAccountId,
              message: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            });
          }
        } catch (dbError) {
          logger.error('Error updating email status to failed:', dbError);
        }
      }
      
      throw error;
    }
  }

  /**
   * Sync emails from Gmail for a specific account
   */
  private async syncEmails(emailAccountId: string, job: Job): Promise<EmailProcessingResult> {
    try {
      // Update job progress
      await job.updateProgress(10);
      
      // Get email account from database
      const emailAccount = await DatabaseOperations.findEmailAccountById(emailAccountId);
      if (!emailAccount) {
        throw new Error(`Email account ${emailAccountId} not found`);
      }

      // Create Gmail service instance with account credentials
      const gmailService = new GmailService();
      gmailService.setCredentials({
        accessToken: emailAccount.accessToken,
        refreshToken: emailAccount.refreshToken,
        expiryDate: emailAccount.tokenExpiresAt?.getTime() ?? 0,
      });

      // Broadcast sync started
      const wsService = getWebSocketServiceInstance();
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
      const errors: string[] = [];

      // Process each email
      for (const email of emails) {
        try {
          // Check if email already exists in database
          const existingEmail = await DatabaseOperations.findProcessedEmailByGmailId(email.id);
          if (existingEmail) {
            logger.debug(`Email ${email.id} already processed, skipping`);
            continue;
          }

          // Store email in database
          const processedEmail = await DatabaseOperations.createProcessedEmail({
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

        } catch (error) {
          const errorMsg = `Failed to process email ${email.id}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      // Update last sync time
      await DatabaseOperations.updateEmailAccountSyncTime(emailAccountId);

      await job.updateProgress(100);

      // Broadcast sync completed
      const wsServiceComplete = getWebSocketServiceInstance();
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

    } catch (error) {
      // Broadcast sync failed
      const wsServiceError = getWebSocketServiceInstance();
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
  private async classifyEmail(emailId: string, job: Job): Promise<EmailProcessingResult> {
    try {
      await job.updateProgress(10);

      // Get email from database
      const email = await DatabaseOperations.findProcessedEmailById(emailId);
      if (!email) {
        throw new Error(`Email ${emailId} not found`);
      }

      // Update email status to processing
      await prisma.processedEmail.update({
        where: { id: emailId },
        data: { processingStatus: 'PROCESSING' }
      });

      // Broadcast classification started
      const wsService = getWebSocketServiceInstance();
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
          openaiService.classifyEmail(
            email.subject || '',
            email.bodyText || email.bodyPreview || '',
            email.fromAddress || '',
            email.accountId // Pass accountId for tracking
          ),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Classification timeout')), 30000) // 30 second timeout
          )
        ]);
      } catch (classificationError) {
        logger.error(`Classification failed for email ${emailId}:`, classificationError);
        
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
      await prisma.processedEmail.update({
        where: { id: emailId },
        data: { 
          processingStatus: classification.isFinancial ? 'CLASSIFIED' : 'COMPLETED',
          classification: this.mapCategoryToEnum(classification.category) as any,
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
        logger.info(`Queueing extraction for ${emailId}: ${classification.category} (financial: ${classification.isFinancial})`);
        await this.queueExtractionJob(emailId);
      } else {
        logger.debug(`Skipping extraction for ${emailId}: ${classification.category} (not financial)`);
      }

      await job.updateProgress(100);

      // Broadcast classification completed with results
      const wsService2 = getWebSocketServiceInstance();
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

    } catch (error) {
      logger.error(`Classification error for email ${emailId}:`, error);
      
      // Update email status to failed (only if emailId is valid)
      if (emailId) {
        try {
          await prisma.processedEmail.update({
            where: { id: emailId },
            data: { processingStatus: 'FAILED' }
          });
        } catch (updateError) {
          logger.error(`Failed to update email ${emailId} status to FAILED:`, updateError);
        }
      } else {
        logger.error('Cannot update email status - emailId is undefined');
      }

      // Broadcast classification failed (only if emailId is valid)
      if (emailId) {
        try {
          const email = await prisma.processedEmail.findUnique({
            where: { id: emailId }
          });
          if (email) {
            const wsService = getWebSocketServiceInstance();
            if (wsService) {
              wsService.broadcastEmailUpdate({
                type: 'failed',
                emailId,
                accountId: email.accountId,
                message: `Classification failed: ${error}`,
              });
            }
          }
        } catch (broadcastError) {
          logger.error(`Failed to broadcast classification failure for email ${emailId}:`, broadcastError);
        }
      }

      throw error;
    }
  }

  /**
   * Extract financial data from a classified financial email
   */
  private async extractEmailData(emailId: string, job: Job): Promise<EmailProcessingResult> {
    try {
      await job.updateProgress(10);

      // Get email from database
      const email = await DatabaseOperations.findProcessedEmailById(emailId);
      if (!email) {
        throw new Error(`Email ${emailId} not found`);
      }

      // Broadcast extraction started
      const wsService = getWebSocketServiceInstance();
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
        extraction = await openaiService.extractFinancialData(
          email.subject || '',
          email.bodyText || '',
          this.getClassificationString(email.classification) || 'other_financial',
          email.accountId // Pass accountId for tracking
        );
      } catch (extractionError) {
        logger.error(`AI extraction failed for email ${emailId}:`, extractionError);
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
            confidence: 0.0
          };
        } else {
          throw extractionError; // Re-throw for non-credit card emails
        }
      }

      await job.updateProgress(70);

      // Store extraction results
      // CRITICAL: For CREDIT_CARD emails, ALWAYS create extracted data record
      await prisma.extractedData.create({
        data: {
          emailId: emailId,
          transactionAmount: extraction.amount ?? null,
          currency: extraction.currency ?? null,
          transactionDate: extraction.date ? new Date(extraction.date) : null,
          merchantName: extraction.merchantName ?? null,
          merchantCategory: extraction.category ?? null,
          accountNumber: extraction.accountNumber ?? null,
          referenceNumber: extraction.transactionId ?? null,
          transactionType: this.mapTransactionTypeToEnum(extraction.transactionType) as any,
          description: extraction.description ?? null,
          extractionScore: extraction.confidence
        }
      });

      // Update email status
      await prisma.processedEmail.update({
        where: { id: emailId },
        data: { processingStatus: 'COMPLETED' }
      });

      await job.updateProgress(100);

      // Broadcast extraction completed with results
      const wsService2 = getWebSocketServiceInstance();
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

    } catch (error) {
      // Update email status to failed
      try {
        await prisma.processedEmail.update({
          where: { id: emailId },
          data: { processingStatus: 'FAILED' }
        });
      } catch (updateError) {
        logger.error(`Failed to update email ${emailId} status to FAILED:`, updateError);
      }

      // Broadcast extraction failed
      try {
        const email = await prisma.processedEmail.findUnique({
          where: { id: emailId }
        });
        if (email) {
          const wsServiceError = getWebSocketServiceInstance();
          if (wsServiceError) {
            wsServiceError.broadcastEmailUpdate({
              type: 'failed',
              emailId,
              accountId: email.accountId,
              message: `Data extraction failed: ${error}`,
            });
          }
        }
      } catch (broadcastError) {
        logger.error(`Failed to broadcast extraction failure for email ${emailId}:`, broadcastError);
      }

      throw error;
    }
  }

  private async queueClassificationJob(emailId: string): Promise<void> {
    const { QueueService } = await import('../services/queueService');
    const queueService = QueueService.getInstance();
    
    // Get the email account ID from the email record
    const email = await DatabaseOperations.findProcessedEmailById(emailId);
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
  private mapCategoryToEnum(category: string): string {
    const categoryMap: Record<string, string> = {
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
  private mapTransactionTypeToEnum(transactionType?: string | null): string {
    if (!transactionType) return 'UNKNOWN';
    
    const typeMap: Record<string, string> = {
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
  private getClassificationString(classification: any): string {
    if (typeof classification === 'string') return classification.toLowerCase();
    return 'other_financial';
  }

  /**
   * Send processing update via WebSocket (private method to avoid direct io access)
   */
  private sendProcessingUpdate(wsService: any, data: any): void {
    try {
      if (wsService && typeof wsService.broadcastEmailUpdate === 'function') {
        wsService.broadcastEmailUpdate({
          type: 'processing_update',
          ...data
        });
      }
    } catch (error) {
      logger.error('Failed to send processing update:', error);
    }
  }

  private async queueExtractionJob(emailId: string): Promise<void> {
    const { QueueService } = await import('../services/queueService');
    const queueService = QueueService.getInstance();
    
    // Get the email account ID from the email record
    const email = await DatabaseOperations.findProcessedEmailById(emailId);
    if (!email) {
      throw new Error(`Email ${emailId} not found when queueing extraction job`);
    }
    
    logger.info(`Queueing extraction job for email ${emailId} (${email.classification})`);
    
    await queueService.addEmailProcessingJob({
      emailAccountId: email.accountId,
      emailId,
      processType: 'extract',
      priority: 3,
    });
  }

  public async close(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.isRunning = false;
      logger.info('Email processing worker closed');
    }
  }

  public get running(): boolean {
    return this.isRunning;
  }

  /**
   * Find and reprocess emails stuck at CLASSIFIED status
   */
  public async processStuckEmails(): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    try {
      // Find emails stuck at CLASSIFIED for more than 5 minutes
      const stuckEmails = await prisma.processedEmail.findMany({
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

      logger.info(`Found ${stuckEmails.length} stuck emails to reprocess`);

      for (const email of stuckEmails) {
        try {
          logger.info(`Reprocessing stuck email ${email.id} (${email.classification})`);
          
          // Queue extraction job directly
          await this.queueExtractionJob(email.id);
          processed++;
          
        } catch (error) {
          const errorMsg = `Failed to reprocess email ${email.id}: ${error}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }

      return { processed, errors };

    } catch (error) {
      const errorMsg = `Error finding stuck emails: ${error}`;
      logger.error(errorMsg);
      return { processed, errors: [errorMsg] };
    }
  }
}

// Export singleton instance
export const emailProcessor = new EmailProcessor();