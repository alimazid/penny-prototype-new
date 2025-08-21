export interface SampleEmail {
    id: string;
    subject: string;
    from: string;
    to: string;
    date: Date;
    body: string;
    bodyHtml?: string;
    threadId?: string;
    labelIds: string[];
    attachments?: Array<{
        filename: string;
        size: number;
    }>;
}
export declare class SampleEmailGenerator {
    private emailCounter;
    /**
     * Generate a collection of sample financial emails for testing
     */
    generateSampleEmails(count?: number): SampleEmail[];
    private generateEmailByType;
    private generateBankingEmail;
    private generateCreditCardEmail;
    private generateInvestmentEmail;
    private generatePaymentEmail;
    private generateSubscriptionEmail;
    private generateBillEmail;
    private generateTaxEmail;
    private generateInsuranceEmail;
    private generateLoanEmail;
    private generateNonFinancialEmail;
    private generateSpanishQikEmail;
    private generateSpanishNotificacionEmail;
    private generateSpanishBHDEmail;
    private getRandomDateInPast;
    private formatDate;
    private addDays;
    private subtractDays;
    private generateOrderNumber;
    private generateOrderItems;
    private generateUsageDetails;
}
export declare const sampleEmailGenerator: SampleEmailGenerator;
//# sourceMappingURL=sampleEmails.d.ts.map