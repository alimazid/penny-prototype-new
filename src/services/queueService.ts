import { Queue, Job } from 'bullmq';
import { redisConnection } from '../utils/redis';
import { logger } from '../utils/logger';
// import { prisma } from '../utils/database';
// import { getWebSocketServiceInstance } from './websocketService';

export interface EmailProcessingJobData {
  emailAccountId: string;
  emailId?: string;
  processType: 'sync' | 'classify' | 'extract';
  priority?: number;
}

export class QueueService {
  private static instance: QueueService;
  private emailQueue: Queue | null = null;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  async initialize() {
    try {
      if (this.isInitialized) {
        return;
      }

      logger.info('Initializing queue service...');

      // Create email processing queue with dedicated BullMQ Redis connection
      this.emailQueue = new Queue('email-processing', {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: parseInt(process.env.RETRY_ATTEMPTS || '3'),
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        },
      });

      // Note: Worker is handled by EmailProcessor in workers/emailProcessor.ts
      // This service only manages the queue, not processing
      
      // Set up queue event listeners only
      this.setupQueueEventListeners();

      this.isInitialized = true;
      logger.info('Queue service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize queue service:', error);
      throw error;
    }
  }

  private setupQueueEventListeners() {
    if (!this.emailQueue) return;

    // Queue events only - worker events are handled by EmailProcessor
    this.emailQueue.on('waiting', (job) => {
      logger.debug(`Job ${job.id} is waiting in queue`);
    });

    this.emailQueue.on('active', (job) => {
      logger.debug(`Job ${job.id} started processing`);
    });

    this.emailQueue.on('completed', (job) => {
      logger.debug(`Job ${job.id} completed`);
    });

    this.emailQueue.on('failed', (job, error) => {
      logger.error(`Job ${job?.id} failed in queue:`, error);
    });
  }

  async addEmailProcessingJob(data: EmailProcessingJobData): Promise<Job<EmailProcessingJobData> | null> {
    if (!this.emailQueue) {
      logger.error('Queue not initialized');
      return null;
    }

    try {
      // Create job in database first
      const jobId = `${data.processType}-${data.emailId || data.emailAccountId}-${Date.now()}`;
      await DatabaseOperations.createQueueJob({
        jobId,
        queueName: 'email-processing',
        jobType: data.processType.toUpperCase(),
        priority: data.priority || 0,
        data: data,
      });

      const job = await this.emailQueue.add('process-email', data, {
        priority: data.priority || 0,
        delay: 0,
      });

      logger.info(`Added ${data.processType} job: ${job.id} for email: ${data.emailId || 'sync-' + data.emailAccountId}`);
      return job;
    } catch (error) {
      logger.error('Error adding email processing job:', error);
      return null;
    }
  }

  async getQueueStats(): Promise<any> {
    if (!this.emailQueue) {
      return { error: 'Queue not initialized' };
    }

    try {
      const waiting = await this.emailQueue.getWaiting();
      const active = await this.emailQueue.getActive();
      const completed = await this.emailQueue.getCompleted();
      const failed = await this.emailQueue.getFailed();

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      };
    } catch (error) {
      logger.error('Error getting queue stats:', error);
      return { error: 'Failed to get queue stats' };
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.emailQueue !== null;
  }

  async close(): Promise<void> {
    try {
      if (this.emailQueue) {
        await this.emailQueue.close();
        this.emailQueue = null;
      }
      logger.info('Queue service closed');
    } catch (error) {
      logger.error('Error closing queue service:', error);
    } finally {
      this.isInitialized = false;
      logger.info('Queue service closed');
    }
  }
}