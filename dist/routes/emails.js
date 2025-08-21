"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const gmailService_1 = require("../services/gmailService");
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const performance_1 = require("../utils/performance");
const router = express_1.default.Router();
// Get processed emails
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const emails = await database_1.prisma.processedEmail.findMany({
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
                total: await database_1.prisma.processedEmail.count()
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching emails:', error);
        res.status(500).json({ error: 'Failed to fetch emails' });
    }
});
// Get email by ID
router.get('/:id', async (req, res) => {
    try {
        const emailId = req.params.id;
        const email = await database_1.prisma.processedEmail.findUnique({
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
    }
    catch (error) {
        logger_1.logger.error('Error fetching email:', error);
        res.status(500).json({ error: 'Failed to fetch email' });
    }
});
// Trigger email sync for an account
router.post('/sync/:accountId', async (req, res) => {
    try {
        const accountId = req.params.accountId;
        const account = await database_1.prisma.emailAccount.findUnique({
            where: { id: accountId }
        });
        if (!account) {
            return res.status(404).json({ error: 'Account not found' });
        }
        // Create Gmail service with stored credentials
        const gmailService = gmailService_1.GmailService.withCredentials({
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
            expiryDate: account.tokenExpiresAt?.getTime() || Date.now() + 3600000,
        });
        // Validate credentials
        const isValid = await gmailService.validateCredentials();
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials, re-authentication required' });
        }
        const timer = performance_1.PerformanceMonitor.timer('email.sync');
        // Fetch ALL recent emails (let AI classify them)
        const { messages } = await gmailService.listRecentEmails(20, undefined, 1); // Get 20 emails from last 1 day
        logger_1.logger.info(`Found ${messages.length} recent emails for account ${accountId}`);
        // Process each email (simplified for prototype)
        const processedEmails = [];
        for (const message of messages) {
            try {
                const emailDetails = await gmailService.getEmailMessage(message.id);
                // Check if already processed
                const existing = await database_1.prisma.processedEmail.findFirst({
                    where: { gmailId: emailDetails.id }
                });
                if (!existing) {
                    const processedEmail = await database_1.DatabaseOperations.createProcessedEmail({
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
            }
            catch (emailError) {
                logger_1.logger.error(`Error processing email ${message.id}:`, emailError);
            }
        }
        await timer.end({ success: true, emailCount: processedEmails.length });
        res.json({
            message: 'Email sync completed',
            processed: processedEmails.length,
            total: messages.length
        });
    }
    catch (error) {
        logger_1.logger.error('Error syncing emails:', error);
        res.status(500).json({ error: 'Failed to sync emails' });
    }
});
// Get email statistics
router.get('/stats/summary', async (_req, res) => {
    try {
        const stats = await database_1.prisma.processedEmail.aggregate({
            _count: {
                id: true
            },
            where: {
                createdAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                }
            }
        });
        const classifiedCount = await database_1.prisma.processedEmail.count({
            where: {
                processingStatus: {
                    in: ['CLASSIFIED', 'COMPLETED'] // Count all successfully classified emails
                },
                createdAt: {
                    gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                }
            }
        });
        const extractedCount = await database_1.prisma.extractedData.count({
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
    }
    catch (error) {
        logger_1.logger.error('Error fetching email stats:', error);
        res.status(500).json({ error: 'Failed to fetch email statistics' });
    }
});
exports.default = router;
//# sourceMappingURL=emails.js.map