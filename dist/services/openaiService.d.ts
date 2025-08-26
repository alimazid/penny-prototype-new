export interface EmailClassificationResult {
    isFinancial: boolean;
    confidence: number;
    category: string;
    subcategory?: string;
    language: string;
    currency?: string;
    reasoning: string;
}
export interface FinancialDataExtraction {
    amount?: number;
    currency?: string;
    date?: string;
    merchantName?: string;
    accountNumber?: string;
    transactionId?: string;
    transactionType?: 'debit' | 'credit' | 'payment' | 'transfer' | 'fee' | 'interest';
    description?: string;
    category?: string;
    confidence: number;
}
export declare class OpenAIService {
    private client;
    private isConfigured;
    constructor();
    get configured(): boolean;
    /**
     * Classify an email to determine if it's financial and categorize it
     */
    classifyEmail(subject: string, body: string, sender: string, accountId?: string): Promise<EmailClassificationResult>;
    /**
     * Extract financial data from a classified financial email
     */
    extractFinancialData(subject: string, body: string, category: string, accountId?: string): Promise<FinancialDataExtraction>;
    /**
     * @deprecated Use promptService.getClassificationPrompts() instead
     */
    private buildClassificationPrompt;
    /**
     * @deprecated Use promptService.getExtractionPrompts() instead
     */
    private buildExtractionPrompt;
    private parseClassificationResult;
    private parseExtractionResult;
    /**
     * Fallback classification using simple rules (for development/testing)
     */
    private fallbackClassification;
    /**
     * Fallback extraction using simple patterns (enhanced for Spanish)
     */
    private fallbackExtraction;
    /**
     * Extract transaction type from Spanish text
     */
    private extractTransactionType;
    /**
     * Normalize date format to ISO 8601
     */
    private normalizeDateFormat;
    private mapCurrencySymbol;
    /**
     * Validate that credit card transactions have all required fields (relaxed for Spanish)
     */
    private validateCreditCardExtraction;
    /**
     * Fallback extraction from non-JSON OpenAI responses
     */
    private fallbackTextExtraction;
    private extractAmountFromText;
    private extractCurrencyFromText;
    private extractMerchantFromText;
    private extractDateFromText;
    private extractAccountFromText;
    /**
     * General validation to flag high confidence but suspicious extractions
     */
    private validateGeneralExtraction;
}
export declare const openaiService: OpenAIService;
//# sourceMappingURL=openaiService.d.ts.map