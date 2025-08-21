"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GmailService = void 0;
const googleapis_1 = require("googleapis");
const logger_1 = require("../utils/logger");
const performance_1 = require("../utils/performance");
const crypto_1 = __importDefault(require("crypto"));
class GmailService {
    oauth2Client;
    gmail;
    constructor() {
        this.oauth2Client = new googleapis_1.google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
        this.gmail = googleapis_1.google.gmail({ version: 'v1', auth: this.oauth2Client });
    }
    // Generate OAuth URL for user authorization
    generateAuthUrl(userId) {
        const scopes = [
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.labels',
            'https://www.googleapis.com/auth/gmail.modify'
        ];
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            state: userId, // Pass user ID for callback handling
            prompt: 'consent', // Force consent screen to get refresh token
        });
    }
    // Exchange authorization code for tokens
    async getTokensFromCode(code) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            if (!tokens.access_token || !tokens.refresh_token) {
                throw new Error('Failed to obtain required tokens');
            }
            return {
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token,
                expiryDate: tokens.expiry_date || undefined,
            };
        }
        catch (error) {
            logger_1.logger.error('Error exchanging code for tokens:', error);
            throw new Error('Failed to exchange authorization code for tokens');
        }
    }
    // Set credentials for API calls
    setCredentials(credentials) {
        this.oauth2Client.setCredentials({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
            expiry_date: credentials.expiryDate,
        });
    }
    // Refresh access token using refresh token
    async refreshAccessToken() {
        try {
            const { credentials } = await this.oauth2Client.refreshAccessToken();
            return {
                accessToken: credentials.access_token,
                refreshToken: credentials.refresh_token,
                expiryDate: credentials.expiry_date || undefined,
            };
        }
        catch (error) {
            logger_1.logger.error('Error refreshing access token:', error);
            throw new Error('Failed to refresh access token');
        }
    }
    // Get user's Gmail profile
    async getUserProfile() {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.get_profile');
            const [profileResponse, labelsResponse] = await Promise.all([
                this.gmail.users.getProfile({ userId: 'me' }),
                this.gmail.users.labels.list({ userId: 'me' })
            ]);
            await timer.end({ success: true });
            return {
                email: profileResponse.data.emailAddress,
                messagesTotal: profileResponse.data.messagesTotal || 0,
                threadsTotal: profileResponse.data.threadsTotal || 0,
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting Gmail profile:', error);
            throw new Error('Failed to get Gmail profile');
        }
    }
    // List messages with financial keywords
    async listFinancialEmails(maxResults = 50, pageToken) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.list_financial_emails');
            // Financial email query - looks for common financial terms
            const query = [
                'from:(*bank* OR *paypal* OR *stripe* OR *venmo* OR *cashapp* OR *zelle*)',
                'OR subject:(payment OR transaction OR invoice OR receipt OR statement OR bill)',
                'OR subject:(withdraw* OR deposit* OR transfer* OR charge* OR refund*)',
                'OR from:(*@amazon.com OR *@apple.com OR *@microsoft.com OR *@netflix.com)',
                'OR from:(*@discover.com OR *@chase.com OR *@wellsfargo.com OR *@bankofamerica.com)',
                'OR from:(*@citi.com OR *@americanexpress.com OR *@capitalone.com)'
            ].join(' ');
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults,
                pageToken,
            });
            await timer.end({
                success: true,
                resultCount: response.data.messages?.length || 0
            });
            return {
                messages: response.data.messages || [],
                nextPageToken: response.data.nextPageToken || undefined,
                resultSizeEstimate: response.data.resultSizeEstimate || 0,
            };
        }
        catch (error) {
            logger_1.logger.error('Error listing financial emails:', error);
            throw new Error('Failed to list financial emails');
        }
    }
    // List all recent emails (not just financial ones)
    async listRecentEmails(maxResults = 50, pageToken, daysBack = 7) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.list_recent_emails');
            // Calculate date filter for recent emails
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysBack);
            const dateFilter = cutoffDate.toISOString().split('T')[0].replace(/-/g, '/');
            // Query for recent emails (last N days)
            const query = `after:${dateFilter}`;
            const response = await this.gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults,
                pageToken,
            });
            await timer.end({
                success: true,
                resultCount: response.data.messages?.length || 0
            });
            return {
                messages: response.data.messages || [],
                nextPageToken: response.data.nextPageToken || undefined,
                resultSizeEstimate: response.data.resultSizeEstimate || 0,
            };
        }
        catch (error) {
            logger_1.logger.error('Error listing recent emails:', error);
            throw new Error('Failed to list recent emails');
        }
    }
    // Get detailed email message
    async getEmailMessage(messageId) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.get_email_message');
            const response = await this.gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
            });
            const message = response.data;
            const headers = message.payload?.headers || [];
            // Extract headers
            const getHeader = (name) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';
            const subject = getHeader('subject');
            const from = getHeader('from');
            const to = getHeader('to').split(',').map(email => email.trim());
            const dateHeader = getHeader('date');
            const messageIdHeader = getHeader('message-id');
            // Extract body content
            const body = this.extractEmailBody(message.payload);
            // Check for attachments
            const hasAttachments = this.hasAttachments(message.payload);
            await timer.end({ success: true, hasAttachments });
            return {
                id: message.id,
                threadId: message.threadId,
                messageId: messageIdHeader,
                subject,
                from,
                to,
                date: new Date(dateHeader),
                body,
                bodyPreview: message.snippet || '',
                hasAttachments,
                labels: message.labelIds || [],
                snippet: message.snippet || '',
            };
        }
        catch (error) {
            logger_1.logger.error(`Error getting email message ${messageId}:`, error);
            throw new Error(`Failed to get email message: ${messageId}`);
        }
    }
    // Extract email body from payload
    extractEmailBody(payload) {
        if (!payload)
            return '';
        // Single part message
        if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        // Multi-part message
        if (payload.parts) {
            let body = '';
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    body += Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
                else if (part.mimeType === 'text/html' && part.body?.data && !body) {
                    // Use HTML as fallback if no plain text
                    const htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    body = this.stripHtml(htmlBody);
                }
                else if (part.parts) {
                    // Recursive for nested parts
                    body += this.extractEmailBody(part);
                }
            }
            return body;
        }
        return '';
    }
    // Check if email has attachments
    hasAttachments(payload) {
        if (!payload)
            return false;
        if (payload.parts) {
            return payload.parts.some((part) => part.filename && part.filename.length > 0);
        }
        return false;
    }
    // Strip HTML tags from content
    stripHtml(html) {
        return html
            .replace(/<script[^>]*>.*?<\/script>/gi, '')
            .replace(/<style[^>]*>.*?<\/style>/gi, '')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .trim();
    }
    // Create Gmail label for categorization
    async createLabel(name, color) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.create_label');
            const response = await this.gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                    name,
                    messageListVisibility: 'show',
                    labelListVisibility: 'labelShow',
                    color: color ? {
                        backgroundColor: color,
                        textColor: '#ffffff'
                    } : undefined,
                },
            });
            await timer.end({ success: true, labelName: name });
            return response.data.id;
        }
        catch (error) {
            logger_1.logger.error(`Error creating label ${name}:`, error);
            throw new Error(`Failed to create label: ${name}`);
        }
    }
    // Add label to email
    async addLabelToEmail(messageId, labelId) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.add_label');
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds: [labelId],
                },
            });
            await timer.end({ success: true, messageId, labelId });
        }
        catch (error) {
            logger_1.logger.error(`Error adding label to email ${messageId}:`, error);
            throw new Error(`Failed to add label to email: ${messageId}`);
        }
    }
    // Remove label from email
    async removeLabelFromEmail(messageId, labelId) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.remove_label');
            await this.gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: [labelId],
                },
            });
            await timer.end({ success: true, messageId, labelId });
        }
        catch (error) {
            logger_1.logger.error(`Error removing label from email ${messageId}:`, error);
            throw new Error(`Failed to remove label from email: ${messageId}`);
        }
    }
    // Get all labels
    async getLabels() {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.get_labels');
            const response = await this.gmail.users.labels.list({
                userId: 'me',
            });
            await timer.end({ success: true, labelCount: response.data.labels?.length || 0 });
            return (response.data.labels || []).map(label => ({
                id: label.id,
                name: label.name,
                type: label.type,
            }));
        }
        catch (error) {
            logger_1.logger.error('Error getting labels:', error);
            throw new Error('Failed to get labels');
        }
    }
    // Setup Gmail push notifications
    async setupPushNotifications(topicName) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.setup_push_notifications');
            const response = await this.gmail.users.watch({
                userId: 'me',
                requestBody: {
                    topicName,
                    labelIds: ['INBOX'], // Watch inbox for new messages
                    labelFilterAction: 'include',
                },
            });
            await timer.end({ success: true, topicName });
            return {
                historyId: response.data.historyId,
            };
        }
        catch (error) {
            logger_1.logger.error('Error setting up push notifications:', error);
            throw new Error('Failed to setup push notifications');
        }
    }
    // Stop Gmail push notifications
    async stopPushNotifications() {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.stop_push_notifications');
            await this.gmail.users.stop({
                userId: 'me',
            });
            await timer.end({ success: true });
        }
        catch (error) {
            logger_1.logger.error('Error stopping push notifications:', error);
            throw new Error('Failed to stop push notifications');
        }
    }
    // Get history of changes since historyId
    async getHistory(historyId) {
        try {
            const timer = performance_1.PerformanceMonitor.timer('gmail.get_history');
            const response = await this.gmail.users.history.list({
                userId: 'me',
                startHistoryId: historyId,
                historyTypes: ['messageAdded'],
            });
            const messages = [];
            if (response.data.history) {
                for (const historyItem of response.data.history) {
                    if (historyItem.messagesAdded) {
                        for (const messageAdded of historyItem.messagesAdded) {
                            if (messageAdded.message) {
                                messages.push({
                                    id: messageAdded.message.id,
                                    threadId: messageAdded.message.threadId,
                                });
                            }
                        }
                    }
                }
            }
            await timer.end({
                success: true,
                messageCount: messages.length,
                startHistoryId: historyId
            });
            return {
                messages,
                historyId: response.data.historyId,
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting history:', error);
            throw new Error('Failed to get Gmail history');
        }
    }
    // Generate content hash for duplicate detection
    generateContentHash(email) {
        const content = `${email.from}|${email.subject}|${email.date.toISOString()}`;
        return crypto_1.default.createHash('sha256').update(content).digest('hex');
    }
    // Utility method to check if credentials are valid
    async validateCredentials() {
        try {
            await this.getUserProfile();
            return true;
        }
        catch (error) {
            logger_1.logger.warn('Gmail credentials validation failed:', error);
            return false;
        }
    }
    // Create a new instance with specific credentials
    static withCredentials(credentials) {
        const service = new GmailService();
        service.setCredentials(credentials);
        return service;
    }
}
exports.GmailService = GmailService;
//# sourceMappingURL=gmailService.js.map