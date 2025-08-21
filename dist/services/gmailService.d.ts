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
export declare class GmailService {
    private oauth2Client;
    private gmail;
    constructor();
    generateAuthUrl(userId: string): string;
    getTokensFromCode(code: string): Promise<GmailCredentials>;
    setCredentials(credentials: GmailCredentials): void;
    refreshAccessToken(): Promise<GmailCredentials>;
    getUserProfile(): Promise<{
        email: string;
        messagesTotal: number;
        threadsTotal: number;
    }>;
    listFinancialEmails(maxResults?: number, pageToken?: string): Promise<{
        messages: {
            id: string;
            threadId: string;
        }[];
        nextPageToken?: string;
        resultSizeEstimate: number;
    }>;
    listRecentEmails(maxResults?: number, pageToken?: string, daysBack?: number): Promise<{
        messages: {
            id: string;
            threadId: string;
        }[];
        nextPageToken?: string;
        resultSizeEstimate: number;
    }>;
    getEmailMessage(messageId: string): Promise<EmailMessage>;
    private extractEmailBody;
    private hasAttachments;
    private stripHtml;
    createLabel(name: string, color?: string): Promise<string>;
    addLabelToEmail(messageId: string, labelId: string): Promise<void>;
    removeLabelFromEmail(messageId: string, labelId: string): Promise<void>;
    getLabels(): Promise<Array<{
        id: string;
        name: string;
        type: string;
    }>>;
    setupPushNotifications(topicName: string): Promise<{
        historyId: string;
    }>;
    stopPushNotifications(): Promise<void>;
    getHistory(historyId: string): Promise<{
        messages: Array<{
            id: string;
            threadId: string;
        }>;
        historyId: string;
    }>;
    generateContentHash(email: EmailMessage): string;
    validateCredentials(): Promise<boolean>;
    static withCredentials(credentials: GmailCredentials): GmailService;
}
//# sourceMappingURL=gmailService.d.ts.map