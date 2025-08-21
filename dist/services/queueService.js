"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../utils/redis");
const logger_1 = require("../utils/logger");
class QueueService {
    static instance;
    emailQueue = null;
    isInitialized = false;
    constructor() { }
    static getInstance() {
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
            logger_1.logger.info('Initializing queue service...');
            // Create email processing queue with dedicated BullMQ Redis connection
            this.emailQueue = new bullmq_1.Queue('email-processing', {
                connection: redis_1.redisConnection,
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
            logger_1.logger.info('Queue service initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize queue service:', error);
            throw error;
        }
    }
    setupQueueEventListeners() {
        if (!this.emailQueue)
            return;
        // Queue events only - worker events are handled by EmailProcessor
        this.emailQueue.on('waiting', (job) => {
            logger_1.logger.debug(`Job ${job.id} is waiting in queue`);
        });
        this.emailQueue.on('active', (job) => {
            logger_1.logger.debug(`Job ${job.id} started processing`);
        });
        this.emailQueue.on('completed', (job) => {
            logger_1.logger.debug(`Job ${job.id} completed`);
        });
        this.emailQueue.on('failed', (job, error) => {
            logger_1.logger.error(`Job ${job?.id} failed in queue:`, error);
        });
    }
    async addEmailProcessingJob(data) {
        if (!this.emailQueue) {
            logger_1.logger.error('Queue not initialized');
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
            logger_1.logger.info(`Added ${data.processType} job: ${job.id} for email: ${data.emailId || 'sync-' + data.emailAccountId}`);
            return job;
        }
        catch (error) {
            logger_1.logger.error('Error adding email processing job:', error);
            return null;
        }
    }
    async getQueueStats() {
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
        }
        catch (error) {
            logger_1.logger.error('Error getting queue stats:', error);
            return { error: 'Failed to get queue stats' };
        }
    }
    isReady() {
        return this.isInitialized && this.emailQueue !== null;
    }
    async close() {
        try {
            if (this.emailQueue) {
                await this.emailQueue.close();
                this.emailQueue = null;
            }
            logger_1.logger.info('Queue service closed');
        }
        catch (error) {
            logger_1.logger.error('Error closing queue service:', error);
        }
        finally {
            this.isInitialized = false;
            logger_1.logger.info('Queue service closed');
        }
    }
}
exports.QueueService = QueueService;
//# sourceMappingURL=queueService.js.map