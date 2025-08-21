"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const logger_1 = require("../utils/logger");
const gmailService_1 = require("../services/gmailService");
const database_1 = require("../utils/database");
const router = express_1.default.Router();
// Gmail Pub/Sub webhook endpoint
router.post('/gmail', async (req, res) => {
    try {
        // Verify webhook signature if secret is configured
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (webhookSecret) {
            const signature = req.headers['x-goog-signature'];
            if (signature) {
                const expectedSignature = crypto_1.default
                    .createHmac('sha1', webhookSecret)
                    .update(JSON.stringify(req.body))
                    .digest('hex');
                if (signature !== expectedSignature) {
                    logger_1.logger.warn('Invalid webhook signature');
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }
        }
        const message = req.body.message;
        if (!message || !message.data) {
            logger_1.logger.warn('Invalid Pub/Sub message format');
            return res.status(400).json({ error: 'Invalid message format' });
        }
        // Decode the Pub/Sub message
        const decodedData = Buffer.from(message.data, 'base64').toString();
        const notification = JSON.parse(decodedData);
        logger_1.logger.info('Received Gmail notification:', {
            emailAddress: notification.emailAddress,
            historyId: notification.historyId,
        });
        // Find the email account
        const account = await database_1.prisma.emailAccount.findFirst({
            where: {
                gmailAddress: notification.emailAddress,
                isConnected: true
            }
        });
        if (!account) {
            logger_1.logger.warn(`No active account found for ${notification.emailAddress}`);
            return res.status(404).json({ error: 'Account not found' });
        }
        // Create Gmail service with stored credentials
        const gmailService = gmailService_1.GmailService.withCredentials({
            accessToken: account.accessToken,
            refreshToken: account.refreshToken,
            expiryDate: account.tokenExpiresAt?.getTime(),
        });
        // Get history since last known historyId
        const lastHistoryId = account.syncSettings?.lastHistoryId;
        if (lastHistoryId) {
            try {
                const history = await gmailService.getHistory(lastHistoryId);
                logger_1.logger.info(`Processing ${history.messages.length} new messages`);
                // Process new messages
                for (const message of history.messages) {
                    try {
                        // Check if this is a financial email by fetching details
                        const emailDetails = await gmailService.getEmailMessage(message.id);
                        // Simple financial email detection (could be enhanced with AI)
                        const isFinancial = /payment|transaction|invoice|receipt|statement|bill|bank|paypal|stripe/i
                            .test(emailDetails.subject + ' ' + emailDetails.bodyPreview);
                        if (isFinancial) {
                            // Check if already processed
                            const existing = await database_1.prisma.processedEmail.findFirst({
                                where: { gmailId: emailDetails.id }
                            });
                            if (!existing) {
                                await database_1.DatabaseOperations.createProcessedEmail({
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
                                logger_1.logger.info('Processed new financial email:', emailDetails.subject);
                            }
                        }
                    }
                    catch (messageError) {
                        logger_1.logger.error(`Error processing message ${message.id}:`, messageError);
                    }
                }
                // Update last history ID
                await database_1.prisma.emailAccount.update({
                    where: { id: account.id },
                    data: {
                        syncSettings: { lastHistoryId: history.historyId },
                        lastSyncAt: new Date()
                    }
                });
            }
            catch (historyError) {
                logger_1.logger.error('Error processing Gmail history:', historyError);
            }
        }
        else {
            // First time - just update the history ID
            await database_1.prisma.emailAccount.update({
                where: { id: account.id },
                data: {
                    syncSettings: { lastHistoryId: notification.historyId },
                    lastSyncAt: new Date()
                }
            });
        }
        res.status(200).json({ message: 'Webhook processed successfully' });
    }
    catch (error) {
        logger_1.logger.error('Webhook processing error:', error);
        res.status(500).json({ error: 'Failed to process webhook' });
    }
});
// Test webhook endpoint
router.post('/test', (req, res) => {
    logger_1.logger.info('Test webhook received:', req.body);
    res.json({
        message: 'Test webhook received successfully',
        timestamp: new Date().toISOString(),
        body: req.body
    });
});
// Webhook health check
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        webhookUrl: process.env.WEBHOOK_BASE_URL
    });
});
exports.default = router;
//# sourceMappingURL=webhooks.js.map