"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emailMonitoringService = exports.EmailMonitoringService = void 0;
const gmailService_1 = require("./gmailService");
const database_1 = require("../utils/database");
const queueService_1 = require("./queueService");
const websocketService_1 = require("./websocketService");
const logger_1 = require("../utils/logger");
class EmailMonitoringService {
    static instance;
    activeSessions = new Map();
    checkInterval = 30000; // 30 seconds
    queueService;
    constructor() {
        this.queueService = queueService_1.QueueService.getInstance();
    }
    static getInstance() {
        if (!EmailMonitoringService.instance) {
            EmailMonitoringService.instance = new EmailMonitoringService();
        }
        return EmailMonitoringService.instance;
    }
    // Start monitoring a Gmail account for new emails
    async startMonitoring(accountId) {
        try {
            // Check if already monitoring this account
            if (this.activeSessions.has(accountId)) {
                return { success: false, message: 'Account is already being monitored' };
            }
            // Get account details from database
            const account = await database_1.prisma.emailAccount.findUnique({
                where: { id: accountId },
                include: { user: true }
            });
            if (!account) {
                return { success: false, message: 'Account not found' };
            }
            if (!account.isConnected) {
                return { success: false, message: 'Account is not connected' };
            }
            // Create Gmail service with stored credentials
            const gmailService = gmailService_1.GmailService.withCredentials({
                accessToken: account.accessToken,
                refreshToken: account.refreshToken,
                expiryDate: account.tokenExpiresAt?.getTime(),
            });
            // Validate credentials (skip for test tokens in development)
            const isTestToken = account.accessToken.startsWith('test-access-token-');
            if (!isTestToken) {
                const isValid = await gmailService.validateCredentials();
                if (!isValid) {
                    return { success: false, message: 'Invalid credentials, re-authentication required' };
                }
            }
            else {
                logger_1.logger.info('Skipping credential validation for test account');
            }
            // Create monitoring session
            const session = {
                accountId,
                gmailAddress: account.gmailAddress,
                intervalId: null,
                lastChecked: new Date(),
                active: true
            };
            // Start polling interval
            session.intervalId = setInterval(async () => {
                await this.checkForNewEmails(session, gmailService);
            }, this.checkInterval);
            this.activeSessions.set(accountId, session);
            logger_1.logger.info(`Started monitoring account ${account.gmailAddress} (${accountId})`);
            // Broadcast monitoring started
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'started',
                    emailId: '',
                    accountId,
                    message: `Started monitoring ${account.gmailAddress}`,
                    data: { gmailAddress: account.gmailAddress }
                });
            }
            // Do an initial check
            await this.checkForNewEmails(session, gmailService);
            return { success: true, message: `Started monitoring ${account.gmailAddress}` };
        }
        catch (error) {
            logger_1.logger.error('Error starting email monitoring:', error);
            return { success: false, message: 'Failed to start monitoring' };
        }
    }
    // Stop monitoring a Gmail account
    async stopMonitoring(accountId) {
        try {
            const session = this.activeSessions.get(accountId);
            if (!session) {
                return { success: false, message: 'Account is not being monitored' };
            }
            // Clear interval
            if (session.intervalId) {
                clearInterval(session.intervalId);
            }
            // Remove from active sessions
            this.activeSessions.delete(accountId);
            logger_1.logger.info(`Stopped monitoring account ${session.gmailAddress} (${accountId})`);
            // Broadcast monitoring stopped
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'completed',
                    emailId: '',
                    accountId,
                    message: `Stopped monitoring ${session.gmailAddress}`,
                    data: { gmailAddress: session.gmailAddress }
                });
            }
            return { success: true, message: `Stopped monitoring ${session.gmailAddress}` };
        }
        catch (error) {
            logger_1.logger.error('Error stopping email monitoring:', error);
            return { success: false, message: 'Failed to stop monitoring' };
        }
    }
    // Trigger manual sync for a monitored account
    async triggerManualSync(accountId) {
        try {
            const session = this.activeSessions.get(accountId);
            if (!session) {
                return { success: false, message: 'Account is not being monitored' };
            }
            // Get account details from database
            const account = await database_1.prisma.emailAccount.findUnique({
                where: { id: accountId },
                include: { user: true }
            });
            if (!account) {
                return { success: false, message: 'Account not found' };
            }
            // Create Gmail service with stored credentials
            const gmailService = gmailService_1.GmailService.withCredentials({
                accessToken: account.accessToken,
                refreshToken: account.refreshToken,
                expiryDate: account.tokenExpiresAt?.getTime(),
            });
            logger_1.logger.info(`Manual sync triggered for account ${session.gmailAddress} (${accountId})`);
            // Broadcast sync started
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'started',
                    emailId: '',
                    accountId,
                    message: `Manual sync started for ${session.gmailAddress}`,
                    data: { gmailAddress: session.gmailAddress }
                });
            }
            // Perform the email check
            await this.checkForNewEmails(session, gmailService);
            return { success: true, message: `Manual sync completed for ${session.gmailAddress}` };
        }
        catch (error) {
            logger_1.logger.error('Error triggering manual sync:', error);
            return { success: false, message: 'Failed to trigger manual sync' };
        }
    }
    // Check for new emails in a monitored account
    async checkForNewEmails(session, gmailService) {
        try {
            logger_1.logger.debug(`Checking for new emails in ${session.gmailAddress}`);
            // Get account from database to check last history ID
            const account = await database_1.prisma.emailAccount.findUnique({
                where: { id: session.accountId }
            });
            if (!account) {
                logger_1.logger.error(`Account ${session.accountId} not found during monitoring`);
                return;
            }
            // If we have a history ID, check for changes since then
            if (account.syncSettings?.lastHistoryId) {
                try {
                    const history = await gmailService.getHistory(account.syncSettings.lastHistoryId);
                    if (history.messages.length > 0) {
                        logger_1.logger.info(`Found ${history.messages.length} new messages for ${session.gmailAddress}`);
                        // Broadcast that we found new emails
                        const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
                        if (wsService) {
                            wsService.broadcastEmailUpdate({
                                type: 'started',
                                emailId: '',
                                accountId: session.accountId,
                                message: `Found ${history.messages.length} new emails`,
                                data: { count: history.messages.length }
                            });
                        }
                        // Process each new message
                        for (const message of history.messages) {
                            await this.processNewEmail(message.id, session, gmailService);
                        }
                        // Update last history ID
                        await database_1.prisma.emailAccount.update({
                            where: { id: session.accountId },
                            data: {
                                syncSettings: { lastHistoryId: history.historyId },
                                lastSyncAt: new Date()
                            }
                        });
                    }
                }
                catch (historyError) {
                    logger_1.logger.error('Error getting Gmail history:', historyError);
                    // Fall back to listing recent emails
                    await this.fallbackEmailCheck(session, gmailService);
                }
            }
            else {
                // First time - just get recent financial emails
                await this.fallbackEmailCheck(session, gmailService);
            }
            session.lastChecked = new Date();
        }
        catch (error) {
            logger_1.logger.error(`Error checking emails for ${session.gmailAddress}:`, error);
        }
    }
    // Fallback method to check for recent emails when history is unavailable
    async fallbackEmailCheck(session, gmailService) {
        try {
            const { messages } = await gmailService.listRecentEmails(15, undefined, 1); // Get 15 emails from last 1 day
            logger_1.logger.info(`Fallback check: found ${messages.length} recent emails for ${session.gmailAddress}`);
            for (const message of messages) {
                // Check if we already have this email
                const existing = await database_1.prisma.processedEmail.findFirst({
                    where: { gmailId: message.id }
                });
                if (!existing) {
                    await this.processNewEmail(message.id, session, gmailService);
                }
            }
        }
        catch (error) {
            logger_1.logger.error('Error in fallback email check:', error);
        }
    }
    // Process a newly discovered email
    async processNewEmail(messageId, session, gmailService) {
        try {
            // Get full email details
            const emailDetails = await gmailService.getEmailMessage(messageId);
            // Check if already processed
            const existing = await database_1.prisma.processedEmail.findFirst({
                where: { gmailId: emailDetails.id }
            });
            if (existing) {
                logger_1.logger.debug(`Email ${messageId} already processed`);
                return;
            }
            // Create processed email record
            const processedEmail = await database_1.DatabaseOperations.createProcessedEmailRecord({
                emailAccountId: session.accountId,
                gmailId: emailDetails.id,
                messageId: emailDetails.messageId,
                threadId: emailDetails.threadId,
                subject: emailDetails.subject,
                sender: emailDetails.from,
                recipient: emailDetails.to.join(', '),
                bodyText: emailDetails.body,
                bodyHtml: '', // We'll enhance this later if needed
                receivedAt: emailDetails.date,
                contentHash: gmailService.generateContentHash(emailDetails),
                bodyPreview: emailDetails.bodyPreview,
                hasAttachments: emailDetails.hasAttachments,
                labelIds: emailDetails.labels,
                processingStatus: 'PENDING'
            });
            logger_1.logger.info(`Created processed email record for: ${emailDetails.subject}`);
            // Broadcast new email discovery
            const wsService = (0, websocketService_1.getWebSocketServiceInstance)();
            if (wsService) {
                wsService.broadcastEmailUpdate({
                    type: 'started',
                    emailId: processedEmail.id,
                    accountId: session.accountId,
                    message: `New email: ${emailDetails.subject}`,
                    data: {
                        subject: emailDetails.subject,
                        sender: emailDetails.from,
                        receivedAt: emailDetails.date
                    }
                });
            }
            // Queue for AI processing
            await this.queueService.addEmailProcessingJob({
                emailAccountId: session.accountId,
                emailId: processedEmail.id,
                processType: 'classify',
                priority: 1 // High priority for real-time monitoring
            });
            logger_1.logger.info(`Queued email ${processedEmail.id} for AI processing`);
        }
        catch (error) {
            logger_1.logger.error(`Error processing new email ${messageId}:`, error);
        }
    }
    // Get status of all active monitoring sessions
    getActiveMonitoringSessions() {
        return Array.from(this.activeSessions.values());
    }
    // Check if an account is being monitored
    isMonitoring(accountId) {
        return this.activeSessions.has(accountId);
    }
    // Get monitoring session for an account
    getMonitoringSession(accountId) {
        return this.activeSessions.get(accountId);
    }
    // Stop all monitoring sessions (for graceful shutdown)
    async stopAllMonitoring() {
        const promises = Array.from(this.activeSessions.keys()).map(accountId => this.stopMonitoring(accountId));
        await Promise.all(promises);
        logger_1.logger.info('Stopped all email monitoring sessions');
    }
    // Update monitoring interval
    setCheckInterval(intervalMs) {
        this.checkInterval = Math.max(10000, intervalMs); // Minimum 10 seconds
        logger_1.logger.info(`Updated monitoring check interval to ${this.checkInterval}ms`);
    }
}
exports.EmailMonitoringService = EmailMonitoringService;
// Export singleton instance
exports.emailMonitoringService = EmailMonitoringService.getInstance();
//# sourceMappingURL=emailMonitoringService.js.map