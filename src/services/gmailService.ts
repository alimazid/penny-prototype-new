import { google, gmail_v1 } from 'googleapis';
// import { OAuth2Client } from 'google-auth-library';
import { logger } from '../utils/logger';
import { PerformanceMonitor } from '../utils/performance';
import { DatabaseOperations } from '../utils/database';
import crypto from 'crypto';

export interface EmailMessage {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string[];
  date: Date;
  body: string;
  bodyPreview: string;
  hasAttachments: boolean;
  labels: string[];
  snippet: string;
}

export interface GmailCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate?: number;
}

export class GmailService {
  private oauth2Client: any;
  private gmail: gmail_v1.Gmail;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    this.gmail = google.gmail({ version: 'v1', auth: this.oauth2Client });
  }

  // Generate OAuth URL for user authorization
  generateAuthUrl(userId: string): string {
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
  async getTokensFromCode(code: string): Promise<GmailCredentials> {
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
    } catch (error) {
      logger.error('Error exchanging code for tokens:', error);
      throw new Error('Failed to exchange authorization code for tokens');
    }
  }

  // Set credentials for API calls
  setCredentials(credentials: GmailCredentials): void {
    this.oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiryDate,
    });
  }

  // Refresh access token using refresh token
  async refreshAccessToken(): Promise<GmailCredentials> {
    try {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      return {
        accessToken: credentials.access_token!,
        refreshToken: credentials.refresh_token!,
        expiryDate: credentials.expiry_date || undefined,
      };
    } catch (error) {
      logger.error('Error refreshing access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  // Get user's Gmail profile
  async getUserProfile(): Promise<{ email: string; messagesTotal: number; threadsTotal: number }> {
    try {
      const timer = PerformanceMonitor.timer('gmail.get_profile');
      
      const [profileResponse, labelsResponse] = await Promise.all([
        this.gmail.users.getProfile({ userId: 'me' }),
        this.gmail.users.labels.list({ userId: 'me' })
      ]);

      await timer.end({ success: true });

      return {
        email: profileResponse.data.emailAddress!,
        messagesTotal: profileResponse.data.messagesTotal || 0,
        threadsTotal: profileResponse.data.threadsTotal || 0,
      };
    } catch (error) {
      logger.error('Error getting Gmail profile:', error);
      throw new Error('Failed to get Gmail profile');
    }
  }

  // List messages with financial keywords
  async listFinancialEmails(
    maxResults: number = 50,
    pageToken?: string
  ): Promise<{
    messages: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate: number;
  }> {
    try {
      const timer = PerformanceMonitor.timer('gmail.list_financial_emails');
      
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
        messages: (response.data.messages || []).map(msg => ({
          id: msg.id || '',
          threadId: msg.threadId || ''
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    } catch (error) {
      logger.error('Error listing financial emails:', error);
      throw new Error('Failed to list financial emails');
    }
  }

  // List all recent emails (not just financial ones)
  async listRecentEmails(
    maxResults: number = 50,
    pageToken?: string,
    daysBack: number = 7
  ): Promise<{
    messages: { id: string; threadId: string }[];
    nextPageToken?: string;
    resultSizeEstimate: number;
  }> {
    try {
      const timer = PerformanceMonitor.timer('gmail.list_recent_emails');
      
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
        messages: (response.data.messages || []).map(msg => ({
          id: msg.id || '',
          threadId: msg.threadId || ''
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    } catch (error) {
      logger.error('Error listing recent emails:', error);
      throw new Error('Failed to list recent emails');
    }
  }

  // Get detailed email message
  async getEmailMessage(messageId: string): Promise<EmailMessage> {
    try {
      const timer = PerformanceMonitor.timer('gmail.get_email_message');
      
      const response = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const message = response.data;
      const headers = message.payload?.headers || [];
      
      // Extract headers
      const getHeader = (name: string) => 
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

      const subject = getHeader('subject');
      const from = getHeader('from');
      const to = getHeader('to').split(',').map(email => email.trim());
      const dateHeader = getHeader('date');
      const messageIdHeader = getHeader('message-id');

      // Extract body content with enhanced debugging
      const body = this.extractEmailBody(message.payload);
      
      // Enhanced content debugging and validation
      this.debugEmailContent(messageId, subject, body, message.payload);
      
      // Check for attachments
      const hasAttachments = this.hasAttachments(message.payload);

      await timer.end({ success: true, hasAttachments });

      return {
        id: message.id!,
        threadId: message.threadId!,
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
    } catch (error) {
      logger.error(`Error getting email message ${messageId}:`, error);
      throw new Error(`Failed to get email message: ${messageId}`);
    }
  }

  // Extract email body from payload
  private extractEmailBody(payload: any): string {
    if (!payload) return '';

    // Debug MIME type detection
    logger.debug('=== EMAIL CONTENT EXTRACTION ===');
    logger.debug('Payload MIME type:', payload.mimeType);
    logger.debug('Has body data:', !!payload.body?.data);
    logger.debug('Has parts:', !!payload.parts);

    // Single part message - now with MIME type checking
    if (payload.body?.data) {
      const rawContent = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      
      if (payload.mimeType === 'text/plain') {
        logger.debug('Single-part plain text email detected');
        return rawContent;
      } else if (payload.mimeType === 'text/html') {
        logger.debug('Single-part HTML email detected - applying HTML conversion');
        return this.convertHtmlToText(rawContent);
      } else {
        logger.debug('Single-part email with unknown MIME type:', payload.mimeType);
        // Try to detect if it's HTML by content
        if (rawContent.includes('<html') || rawContent.includes('<!DOCTYPE')) {
          logger.debug('Content appears to be HTML - applying HTML conversion');
          return this.convertHtmlToText(rawContent);
        }
        return rawContent;
      }
    }

    // Multi-part message with improved prioritization
    if (payload.parts) {
      let plainTextBody = '';
      let htmlBody = '';
      
      // First pass: collect all available content types
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          plainTextBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data) {
          htmlBody += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Recursive for nested parts
          const nestedContent = this.extractEmailBody(part);
          if (nestedContent) {
            plainTextBody += '\n' + nestedContent;
          }
        }
      }
      
      // Prioritize plain text, fall back to HTML conversion
      if (plainTextBody.trim()) {
        logger.debug('Using plain text content from multipart email');
        return plainTextBody.trim();
      } else if (htmlBody.trim()) {
        logger.debug('No plain text found - converting HTML content');
        return this.convertHtmlToText(htmlBody);
      }
    }

    logger.debug('No extractable content found in email payload');
    return '';
  }

  // Check if email has attachments
  private hasAttachments(payload: any): boolean {
    if (!payload) return false;

    if (payload.parts) {
      return payload.parts.some((part: any) => 
        part.filename && part.filename.length > 0
      );
    }

    return false;
  }

  // Advanced HTML to text conversion for financial emails
  private convertHtmlToText(html: string): string {
    if (!html) return '';

    logger.debug('Converting HTML to text, input length:', html.length);

    // Remove unwanted elements that don't contain useful content
    let cleanHtml = html
      // Remove scripts, styles, and meta tags
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      
      // Remove email headers and tracking elements
      .replace(/<head[^>]*>.*?<\/head>/gi, '')
      .replace(/<img[^>]*>/gi, '') // Remove tracking pixels
      
      // Convert structural elements to text equivalents
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<hr[^>]*>/gi, '\n---\n');

    // Handle table structures (common in financial emails)
    cleanHtml = this.convertTablesToText(cleanHtml);
    
    // Remove all remaining HTML tags
    cleanHtml = cleanHtml.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    cleanHtml = this.decodeHtmlEntities(cleanHtml);
    
    // Clean up whitespace and formatting
    cleanHtml = this.cleanupTextFormatting(cleanHtml);
    
    // Remove email footers and disclaimers (financial emails have lots of legal text)
    cleanHtml = this.removeEmailFooters(cleanHtml);

    logger.debug('HTML conversion complete, output length:', cleanHtml.length);
    logger.debug('Converted content preview:', cleanHtml.substring(0, 200) + '...');
    
    return cleanHtml;
  }

  // Convert HTML tables to readable text format
  private convertTablesToText(html: string): string {
    // Replace table rows with line breaks and cells with tabs/spaces
    return html
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, '\t')
      .replace(/<\/th>/gi, '\t')
      .replace(/<table[^>]*>/gi, '\n--- TABLE START ---\n')
      .replace(/<\/table>/gi, '\n--- TABLE END ---\n')
      .replace(/<tbody[^>]*>/gi, '')
      .replace(/<\/tbody>/gi, '')
      .replace(/<thead[^>]*>/gi, '')
      .replace(/<\/thead>/gi, '')
      .replace(/<tr[^>]*>/gi, '')
      .replace(/<td[^>]*>/gi, '')
      .replace(/<th[^>]*>/gi, '');
  }

  // Decode common HTML entities
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&cent;/g, '¢')
      .replace(/&pound;/g, '£')
      .replace(/&yen;/g, '¥')
      .replace(/&euro;/g, '€')
      .replace(/&copy;/g, '©')
      .replace(/&reg;/g, '®')
      .replace(/&#(\d+);/g, (match, num) => String.fromCharCode(parseInt(num, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  }

  // Clean up text formatting and spacing
  private cleanupTextFormatting(text: string): string {
    return text
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove excessive whitespace
      .replace(/[ \t]+/g, ' ')
      // Limit consecutive line breaks
      .replace(/\n{3,}/g, '\n\n')
      // Trim lines
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  // Remove common email footers and disclaimers
  private removeEmailFooters(text: string): string {
    const lines = text.split('\n');
    const cleanLines: string[] = [];
    let skipRemaining = false;

    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Detect footer patterns (financial emails have lots of legal disclaimers)
      if (
        lowerLine.includes('unsubscribe') ||
        lowerLine.includes('confidential') ||
        lowerLine.includes('disclaimer') ||
        lowerLine.includes('privacy policy') ||
        lowerLine.includes('terms of service') ||
        lowerLine.includes('legal notice') ||
        lowerLine.includes('this email was sent') ||
        lowerLine.includes('if you no longer wish') ||
        (lowerLine.includes('©') && (lowerLine.includes('bank') || lowerLine.includes('financial')))
      ) {
        skipRemaining = true;
        break;
      }
      
      cleanLines.push(line);
    }

    return cleanLines.join('\n').trim();
  }

  // Enhanced email content debugging and validation
  private debugEmailContent(messageId: string, subject: string, extractedBody: string, payload: any): void {
    // Only debug emails that might be problematic (HTML content or QIK emails)
    const isQikEmail = subject.toLowerCase().includes('qik') || 
                       (payload.headers || []).some((h: any) => 
                         h.name?.toLowerCase() === 'from' && h.value?.includes('qik.do'));
    
    const hasHtmlContent = this.payloadContainsHtml(payload);
    
    if (isQikEmail || hasHtmlContent || extractedBody.length < 50) {
      logger.debug('=== ENHANCED EMAIL CONTENT DEBUG ===');
      logger.debug('Message ID:', messageId);
      logger.debug('Subject:', subject);
      logger.debug('Is QIK email:', isQikEmail);
      logger.debug('Contains HTML:', hasHtmlContent);
      logger.debug('Extracted body length:', extractedBody.length);
      logger.debug('Extracted body preview:', extractedBody.substring(0, 300) + '...');
      
      // Show original HTML if present
      if (hasHtmlContent) {
        const originalHtml = this.extractRawHtml(payload);
        logger.debug('Original HTML length:', originalHtml.length);
        logger.debug('Original HTML preview:', originalHtml.substring(0, 300) + '...');
      }
      
      // Content quality validation
      const qualityMetrics = this.validateContentQuality(extractedBody, subject);
      logger.debug('Content quality metrics:', qualityMetrics);
      
      if (qualityMetrics.suspiciousContent) {
        logger.warn('🚨 SUSPICIOUS EMAIL CONTENT DETECTED');
        logger.warn('Quality score:', qualityMetrics.qualityScore);
        logger.warn('Issues found:', qualityMetrics.issues);
      }
    }
  }

  // Check if payload contains HTML content
  private payloadContainsHtml(payload: any): boolean {
    if (payload.mimeType === 'text/html') return true;
    
    if (payload.parts) {
      return payload.parts.some((part: any) => 
        part.mimeType === 'text/html' || this.payloadContainsHtml(part));
    }
    
    if (payload.body?.data) {
      const content = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      return content.includes('<html') || content.includes('<!DOCTYPE');
    }
    
    return false;
  }

  // Extract raw HTML for debugging purposes
  private extractRawHtml(payload: any): string {
    if (payload.mimeType === 'text/html' && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
        if (part.parts) {
          const nested = this.extractRawHtml(part);
          if (nested) return nested;
        }
      }
    }
    
    return '';
  }

  // Validate content quality and detect issues
  private validateContentQuality(content: string, subject: string): {
    qualityScore: number;
    suspiciousContent: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    let qualityScore = 1.0;

    // Check for extremely short content
    if (content.length < 20) {
      issues.push('CONTENT_TOO_SHORT');
      qualityScore -= 0.3;
    }

    // Check for HTML artifacts that weren't properly converted
    if (content.includes('<!DOCTYPE') || content.includes('<html')) {
      issues.push('UNCONVERTED_HTML');
      qualityScore -= 0.4;
    }

    // Check for excessive HTML entities
    const entityCount = (content.match(/&[a-zA-Z]+;/g) || []).length;
    if (entityCount > 10) {
      issues.push('EXCESSIVE_HTML_ENTITIES');
      qualityScore -= 0.2;
    }

    // Check for financial content mismatch
    const isFinancialSubject = subject.toLowerCase().includes('credit') || 
                               subject.toLowerCase().includes('debit') ||
                               subject.toLowerCase().includes('transaction') ||
                               subject.toLowerCase().includes('payment');
    
    if (isFinancialSubject && !this.containsFinancialKeywords(content)) {
      issues.push('MISSING_FINANCIAL_CONTENT');
      qualityScore -= 0.3;
    }

    // Check for suspicious repeated patterns (indicating conversion failure)
    const repeatedPatterns = content.match(/(.{10,})\1{2,}/g);
    if (repeatedPatterns && repeatedPatterns.length > 0) {
      issues.push('REPEATED_CONTENT_PATTERNS');
      qualityScore -= 0.2;
    }

    return {
      qualityScore: Math.max(0, qualityScore),
      suspiciousContent: qualityScore < 0.7 || issues.length > 1,
      issues
    };
  }

  // Check if content contains expected financial keywords
  private containsFinancialKeywords(content: string): boolean {
    const lowerContent = content.toLowerCase();
    const financialKeywords = [
      'amount', 'transaction', 'payment', 'charge', 'debit', 'credit',
      'merchant', 'account', 'balance', 'purchase', 'card', 'money',
      'total', 'fee', 'cost', 'price', 'dollar', 'peso', 'currency'
    ];
    
    return financialKeywords.some(keyword => lowerContent.includes(keyword));
  }

  // Create Gmail label for categorization
  async createLabel(name: string, color?: string): Promise<string> {
    try {
      const timer = PerformanceMonitor.timer('gmail.create_label');
      
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
      
      return response.data.id!;
    } catch (error) {
      logger.error(`Error creating label ${name}:`, error);
      throw new Error(`Failed to create label: ${name}`);
    }
  }

  // Add label to email
  async addLabelToEmail(messageId: string, labelId: string): Promise<void> {
    try {
      const timer = PerformanceMonitor.timer('gmail.add_label');
      
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });

      await timer.end({ success: true, messageId, labelId });
    } catch (error) {
      logger.error(`Error adding label to email ${messageId}:`, error);
      throw new Error(`Failed to add label to email: ${messageId}`);
    }
  }

  // Remove label from email
  async removeLabelFromEmail(messageId: string, labelId: string): Promise<void> {
    try {
      const timer = PerformanceMonitor.timer('gmail.remove_label');
      
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });

      await timer.end({ success: true, messageId, labelId });
    } catch (error) {
      logger.error(`Error removing label from email ${messageId}:`, error);
      throw new Error(`Failed to remove label from email: ${messageId}`);
    }
  }

  // Get all labels
  async getLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    try {
      const timer = PerformanceMonitor.timer('gmail.get_labels');
      
      const response = await this.gmail.users.labels.list({
        userId: 'me',
      });

      await timer.end({ success: true, labelCount: response.data.labels?.length || 0 });

      return (response.data.labels || []).map(label => ({
        id: label.id!,
        name: label.name!,
        type: label.type!,
      }));
    } catch (error) {
      logger.error('Error getting labels:', error);
      throw new Error('Failed to get labels');
    }
  }

  // Setup Gmail push notifications
  async setupPushNotifications(topicName: string): Promise<{ historyId: string }> {
    try {
      const timer = PerformanceMonitor.timer('gmail.setup_push_notifications');
      
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
        historyId: response.data.historyId!,
      };
    } catch (error) {
      logger.error('Error setting up push notifications:', error);
      throw new Error('Failed to setup push notifications');
    }
  }

  // Stop Gmail push notifications
  async stopPushNotifications(): Promise<void> {
    try {
      const timer = PerformanceMonitor.timer('gmail.stop_push_notifications');
      
      await this.gmail.users.stop({
        userId: 'me',
      });

      await timer.end({ success: true });
    } catch (error) {
      logger.error('Error stopping push notifications:', error);
      throw new Error('Failed to stop push notifications');
    }
  }

  // Get history of changes since historyId
  async getHistory(historyId: string): Promise<{
    messages: Array<{ id: string; threadId: string }>;
    historyId: string;
  }> {
    try {
      const timer = PerformanceMonitor.timer('gmail.get_history');
      
      const response = await this.gmail.users.history.list({
        userId: 'me',
        startHistoryId: historyId,
        historyTypes: ['messageAdded'],
      });

      const messages: Array<{ id: string; threadId: string }> = [];
      
      if (response.data.history) {
        for (const historyItem of response.data.history) {
          if (historyItem.messagesAdded) {
            for (const messageAdded of historyItem.messagesAdded) {
              if (messageAdded.message) {
                messages.push({
                  id: messageAdded.message.id!,
                  threadId: messageAdded.message.threadId!,
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
        historyId: response.data.historyId!,
      };
    } catch (error) {
      logger.error('Error getting history:', error);
      throw new Error('Failed to get Gmail history');
    }
  }

  // Generate content hash for duplicate detection
  generateContentHash(email: EmailMessage): string {
    const content = `${email.from}|${email.subject}|${email.date.toISOString()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  // Utility method to check if credentials are valid
  async validateCredentials(): Promise<boolean> {
    try {
      await this.getUserProfile();
      return true;
    } catch (error) {
      logger.warn('Gmail credentials validation failed:', error);
      return false;
    }
  }

  // Create a new instance with specific credentials
  static withCredentials(credentials: GmailCredentials): GmailService {
    const service = new GmailService();
    service.setCredentials(credentials);
    return service;
  }
}