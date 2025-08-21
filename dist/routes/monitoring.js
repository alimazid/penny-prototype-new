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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const emailMonitoringService_1 = require("../services/emailMonitoringService");
const database_1 = require("../utils/database");
const logger_1 = require("../utils/logger");
const router = express_1.default.Router();
// Start monitoring an email account
router.post('/start', async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }
        // Verify account exists and is connected
        const account = await database_1.prisma.emailAccount.findUnique({
            where: { id: accountId },
            include: { user: true }
        });
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }
        if (!account.isConnected) {
            return res.status(400).json({
                success: false,
                message: 'Account is not connected'
            });
        }
        // Start monitoring
        const result = await emailMonitoringService_1.emailMonitoringService.startMonitoring(accountId);
        if (result.success) {
            logger_1.logger.info(`Started monitoring account ${account.gmailAddress} via API`);
        }
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Error starting monitoring via API:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start monitoring'
        });
    }
});
// Stop monitoring an email account
router.post('/stop', async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }
        // Stop monitoring
        const result = await emailMonitoringService_1.emailMonitoringService.stopMonitoring(accountId);
        if (result.success) {
            logger_1.logger.info(`Stopped monitoring account ${accountId} via API`);
        }
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Error stopping monitoring via API:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop monitoring'
        });
    }
});
// Trigger manual sync for a monitored account
router.post('/sync', async (req, res) => {
    try {
        const { accountId } = req.body;
        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }
        // Check if account is being monitored
        const activeSessions = emailMonitoringService_1.emailMonitoringService.getActiveMonitoringSessions();
        const session = activeSessions.find(s => s.accountId === accountId);
        if (!session) {
            return res.status(400).json({
                success: false,
                message: 'Account is not currently being monitored'
            });
        }
        // Trigger manual sync
        const result = await emailMonitoringService_1.emailMonitoringService.triggerManualSync(accountId);
        if (result.success) {
            logger_1.logger.info(`Manual sync triggered for account ${accountId} via API`);
        }
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Error triggering manual sync via API:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to trigger manual sync'
        });
    }
});
// Get monitoring status for all accounts
router.get('/status', async (_req, res) => {
    try {
        const activeSessions = emailMonitoringService_1.emailMonitoringService.getActiveMonitoringSessions();
        // Get account details for each active session
        const statusPromises = activeSessions.map(async (session) => {
            const account = await database_1.prisma.emailAccount.findUnique({
                where: { id: session.accountId },
                include: { user: true }
            });
            return {
                accountId: session.accountId,
                gmailAddress: session.gmailAddress,
                active: session.active,
                lastChecked: session.lastChecked,
                user: account?.user.displayName || 'Unknown'
            };
        });
        const status = await Promise.all(statusPromises);
        res.json({
            success: true,
            activeSessions: status,
            totalActive: activeSessions.length
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting monitoring status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get monitoring status'
        });
    }
});
// Get monitoring status for a specific account
router.get('/status/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        // Check if monitoring is active for this account
        const isMonitoring = emailMonitoringService_1.emailMonitoringService.isMonitoring(accountId);
        const monitoringSession = emailMonitoringService_1.emailMonitoringService.getMonitoringSession(accountId);
        res.json({
            success: true,
            isMonitoring,
            startedAt: monitoringSession?.lastChecked || null,
            accountId: isMonitoring ? accountId : null,
            checkInterval: emailMonitoringService_1.emailMonitoringService.getCheckInterval()
        });
    }
    catch (error) {
        logger_1.logger.error('Error checking monitoring status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check monitoring status',
            isMonitoring: false
        });
    }
});
// Get emails for a specific account
router.get('/emails/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        const limit = parseInt(req.query.limit) || 20;
        // Get emails for this account
        const emails = await database_1.prisma.processedEmail.findMany({
            where: { accountId: accountId },
            take: limit,
            orderBy: { receivedAt: 'desc' },
            include: {
                extractedData: true
            }
        });
        res.json({
            success: true,
            emails: emails.map(email => ({
                id: email.id,
                subject: email.subject,
                sender: email.fromAddress,
                recipients: email.toAddresses,
                receivedAt: email.receivedAt,
                bodyPreview: email.bodyPreview,
                processingStatus: email.processingStatus,
                classification: email.classification,
                confidenceScore: email.confidenceScore,
                extractedData: email.extractedData ? {
                    amount: email.extractedData.transactionAmount,
                    currency: email.extractedData.currency,
                    date: email.extractedData.transactionDate,
                    merchantName: email.extractedData.merchantName,
                    merchantCategory: email.extractedData.merchantCategory,
                    accountNumber: email.extractedData.accountNumber,
                    transactionType: email.extractedData.transactionType,
                    description: email.extractedData.description,
                    referenceNumber: email.extractedData.referenceNumber,
                    transactionId: email.extractedData.referenceNumber, // Alias for compatibility
                    balance: email.extractedData.balance,
                    metadata: email.extractedData.metadata,
                    confidence: email.extractedData.extractionScore,
                    isValidated: email.extractedData.isValidated,
                    validatedBy: email.extractedData.validatedBy,
                    validatedAt: email.extractedData.validatedAt
                } : null,
                hasAttachments: email.hasAttachments,
                gmailId: email.gmailId,
                language: email.language,
                errorMessage: email.errorMessage
            })),
            totalCount: emails.length
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching emails for account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch emails'
        });
    }
});
// Update monitoring settings
router.post('/settings', async (req, res) => {
    try {
        const { checkInterval } = req.body;
        if (checkInterval && typeof checkInterval === 'number') {
            emailMonitoringService_1.emailMonitoringService.setCheckInterval(checkInterval);
            logger_1.logger.info(`Updated monitoring check interval to ${checkInterval}ms via API`);
        }
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Error updating monitoring settings:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update settings'
        });
    }
});
// Process a specific email through AI pipeline
router.post('/process-email/:emailId', async (req, res) => {
    try {
        const { emailId } = req.params;
        // Get the email from database
        const email = await database_1.prisma.processedEmail.findUnique({
            where: { id: emailId },
            include: { account: true }
        });
        if (!email) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        // Import services dynamically to avoid circular dependencies
        const { openaiService } = await Promise.resolve().then(() => __importStar(require('../services/openaiService')));
        // Update status to processing
        await database_1.prisma.processedEmail.update({
            where: { id: emailId },
            data: { processingStatus: 'PROCESSING' }
        });
        try {
            // Get full email content if not available
            let emailBody = email.bodyText;
            if (!emailBody) {
                logger_1.logger.info(`Email ${emailId} missing bodyText, fetching from Gmail...`);
                // Import Gmail service and fetch full content
                const { GmailService } = await Promise.resolve().then(() => __importStar(require('../services/gmailService')));
                const gmailService = GmailService.withCredentials({
                    accessToken: email.account.accessToken,
                    refreshToken: email.account.refreshToken,
                    expiryDate: email.account.tokenExpiresAt?.getTime(),
                });
                try {
                    const fullEmailDetails = await gmailService.getEmailMessage(email.gmailId);
                    emailBody = fullEmailDetails.body || email.bodyPreview || '';
                    // Update database with full email content
                    await database_1.prisma.processedEmail.update({
                        where: { id: emailId },
                        data: {
                            bodyText: emailBody,
                            bodyPreview: emailBody.substring(0, 500)
                        }
                    });
                    logger_1.logger.info(`Updated email ${emailId} with full bodyText (${emailBody.length} chars)`);
                }
                catch (gmailError) {
                    logger_1.logger.error(`Failed to fetch email content from Gmail for ${emailId}:`, gmailError);
                    emailBody = email.bodyPreview || '';
                }
            }
            // Perform AI classification using full email content
            const classification = await openaiService.classifyEmail(email.subject, emailBody, email.fromAddress);
            let extractedData = null;
            let classificationEnum = 'UNCLASSIFIED';
            // Map classification to enum
            if (classification.isFinancial) {
                switch (classification.category.toLowerCase()) {
                    case 'banking':
                        classificationEnum = 'BANKING';
                        break;
                    case 'credit_card':
                    case 'credit card':
                        classificationEnum = 'CREDIT_CARD';
                        break;
                    case 'investment':
                        classificationEnum = 'INVESTMENT';
                        break;
                    case 'payment':
                        classificationEnum = 'PAYMENT';
                        break;
                    case 'bill':
                        classificationEnum = 'BILL';
                        break;
                    case 'insurance':
                        classificationEnum = 'INSURANCE';
                        break;
                    case 'tax':
                        classificationEnum = 'TAX';
                        break;
                    case 'loan':
                        classificationEnum = 'LOAN';
                        break;
                    default:
                        classificationEnum = 'OTHER';
                }
                // Extract financial data using full email content
                extractedData = await openaiService.extractFinancialData(email.subject, emailBody, classification.category);
            }
            // Update email with classification results
            await database_1.prisma.processedEmail.update({
                where: { id: emailId },
                data: {
                    classification: classificationEnum,
                    confidenceScore: classification.confidence,
                    processingStatus: 'COMPLETED',
                    language: classification.language || 'en'
                }
            });
            // Create or update extracted data record if we have financial data
            // CRITICAL: CREDIT_CARD emails MUST ALWAYS have extracted data record
            if (extractedData || classificationEnum === 'CREDIT_CARD') {
                await database_1.prisma.extractedData.upsert({
                    where: {
                        emailId: emailId
                    },
                    create: {
                        emailId: emailId,
                        transactionAmount: extractedData?.amount || null,
                        currency: extractedData?.currency || null,
                        transactionDate: extractedData?.date ? new Date(extractedData.date) : null,
                        merchantName: extractedData?.merchantName || null,
                        merchantCategory: extractedData?.category || null,
                        accountNumber: extractedData?.accountNumber || null,
                        referenceNumber: extractedData?.transactionId || null,
                        transactionType: extractedData?.transactionType === 'credit' ? 'CREDIT' : extractedData?.transactionType === 'debit' ? 'DEBIT' : 'UNKNOWN',
                        description: extractedData?.description || (extractedData?.merchantName ? `Transaction at ${extractedData.merchantName}` : null),
                        extractionScore: extractedData?.confidence || 0.0
                    },
                    update: {
                        transactionAmount: extractedData?.amount || null,
                        currency: extractedData?.currency || null,
                        transactionDate: extractedData?.date ? new Date(extractedData.date) : null,
                        merchantName: extractedData?.merchantName || null,
                        merchantCategory: extractedData?.category || null,
                        accountNumber: extractedData?.accountNumber || null,
                        referenceNumber: extractedData?.transactionId || null,
                        transactionType: extractedData?.transactionType === 'credit' ? 'CREDIT' : extractedData?.transactionType === 'debit' ? 'DEBIT' : 'UNKNOWN',
                        description: extractedData?.description || (extractedData?.merchantName ? `Transaction at ${extractedData.merchantName}` : null),
                        extractionScore: extractedData?.confidence || 0.0,
                        updatedAt: new Date()
                    }
                });
            }
            logger_1.logger.info(`Successfully processed email ${emailId} - Classification: ${classificationEnum}`);
            res.json({
                success: true,
                message: 'Email processed successfully',
                classification: classificationEnum,
                confidence: classification.confidence,
                extractedData: extractedData
            });
        }
        catch (processingError) {
            // Update status to failed
            await database_1.prisma.processedEmail.update({
                where: { id: emailId },
                data: {
                    processingStatus: 'FAILED',
                    errorMessage: processingError instanceof Error ? processingError.message : 'Processing failed'
                }
            });
            throw processingError;
        }
    }
    catch (error) {
        logger_1.logger.error('Error processing email manually:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process email',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Process all pending emails for an account
router.post('/process-pending/:accountId', async (req, res) => {
    try {
        const { accountId } = req.params;
        // Get all pending emails for this account
        const pendingEmails = await database_1.prisma.processedEmail.findMany({
            where: {
                accountId: accountId,
                processingStatus: { in: ['PENDING', 'FAILED'] }
            },
            take: 20 // Limit to 20 emails at once to avoid timeout
        });
        if (pendingEmails.length === 0) {
            return res.json({
                success: true,
                message: 'No pending emails to process',
                processedCount: 0
            });
        }
        let processedCount = 0;
        const errors = [];
        // Process each email
        for (const email of pendingEmails) {
            try {
                // Make internal API call to process individual email
                const response = await fetch(`http://localhost:3000/api/monitoring/process-email/${email.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (response.ok) {
                    processedCount++;
                }
                else {
                    const errorResult = await response.json();
                    errors.push(`${email.id}: ${errorResult.message || 'Unknown error'}`);
                }
            }
            catch (error) {
                errors.push(`${email.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }
        logger_1.logger.info(`Batch processing completed: ${processedCount}/${pendingEmails.length} emails processed`);
        res.json({
            success: true,
            message: `Processed ${processedCount} out of ${pendingEmails.length} emails`,
            processedCount,
            totalEmails: pendingEmails.length,
            errors: errors.length > 0 ? errors : undefined
        });
    }
    catch (error) {
        logger_1.logger.error('Error processing pending emails:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process pending emails',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
// Clear error message from email
router.post('/clear-error/:emailId', async (req, res) => {
    try {
        const { emailId } = req.params;
        await database_1.prisma.processedEmail.update({
            where: { id: emailId },
            data: {
                errorMessage: null,
                processingStatus: 'COMPLETED' // Also fix the status
            }
        });
        res.json({
            success: true,
            message: 'Error message cleared and status updated'
        });
    }
    catch (error) {
        logger_1.logger.error('Error clearing error message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear error message'
        });
    }
});
// Get single email data (for refreshing)
router.get('/email/:emailId', async (req, res) => {
    try {
        const { emailId } = req.params;
        const email = await database_1.prisma.processedEmail.findUnique({
            where: { id: emailId },
            include: { extractedData: true }
        });
        if (!email) {
            return res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
        res.json({
            success: true,
            email: {
                id: email.id,
                subject: email.subject,
                sender: email.fromAddress,
                recipients: email.toAddresses,
                receivedAt: email.receivedAt,
                bodyPreview: email.bodyPreview,
                processingStatus: email.processingStatus,
                classification: email.classification,
                confidenceScore: email.confidenceScore,
                extractedData: email.extractedData ? {
                    amount: email.extractedData.transactionAmount,
                    currency: email.extractedData.currency,
                    date: email.extractedData.transactionDate,
                    merchantName: email.extractedData.merchantName,
                    merchantCategory: email.extractedData.merchantCategory,
                    accountNumber: email.extractedData.accountNumber,
                    transactionType: email.extractedData.transactionType,
                    description: email.extractedData.description,
                    referenceNumber: email.extractedData.referenceNumber,
                    transactionId: email.extractedData.referenceNumber, // Alias for compatibility
                    balance: email.extractedData.balance,
                    metadata: email.extractedData.metadata,
                    confidence: email.extractedData.extractionScore,
                    isValidated: email.extractedData.isValidated,
                    validatedBy: email.extractedData.validatedBy,
                    validatedAt: email.extractedData.validatedAt
                } : null,
                hasAttachments: email.hasAttachments,
                gmailId: email.gmailId,
                language: email.language,
                errorMessage: email.errorMessage
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching single email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch email data'
        });
    }
});
// Process stuck emails (emails that got stuck at CLASSIFIED status)
router.post('/process-stuck-emails', async (_req, res) => {
    try {
        const { emailProcessor } = await Promise.resolve().then(() => __importStar(require('../workers/emailProcessor')));
        const result = await emailProcessor.processStuckEmails();
        res.json({
            success: true,
            message: `Processed ${result.processed} stuck emails`,
            processed: result.processed,
            errors: result.errors
        });
    }
    catch (error) {
        logger_1.logger.error('Error processing stuck emails:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process stuck emails',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});
exports.default = router;
//# sourceMappingURL=monitoring.js.map