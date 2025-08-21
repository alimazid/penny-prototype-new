import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { OpenAIMetrics } from '../utils/database';
import { promptService } from './promptService';

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

export class OpenAIService {
  private client: OpenAI;
  private isConfigured: boolean = false;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      logger.warn('OpenAI API key not configured. AI features will be disabled.');
      this.isConfigured = false;
      return;
    }

    try {
      this.client = new OpenAI({
        apiKey,
        organization: process.env.OPENAI_ORGANIZATION_ID,
      });
      this.isConfigured = true;
      logger.info('OpenAI service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI service:', error);
      this.isConfigured = false;
    }
  }

  public get configured(): boolean {
    return this.isConfigured;
  }

  /**
   * Classify an email to determine if it's financial and categorize it
   */
  async classifyEmail(
    subject: string,
    body: string,
    sender: string,
    accountId?: string
  ): Promise<EmailClassificationResult> {
    if (!this.isConfigured) {
      // Fallback classification for development
      return this.fallbackClassification(subject, body, sender);
    }

    try {
      const model = process.env.AI_CLASSIFICATION_MODEL || 'gpt-4o-mini';
      const prompts = await promptService.getClassificationPrompts(model, 'v1');
      
      // Render the user prompt with variables
      const userPrompt = promptService.renderPrompt(prompts.user, {
        sender,
        subject,
        body: body.substring(0, 2000) + '...',
        supportedLanguages: process.env.SUPPORTED_LANGUAGES || 'en,es',
        supportedCurrencies: process.env.SUPPORTED_CURRENCIES || 'USD,EUR,GBP,DOP'
      });
      
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: prompts.system
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
        max_tokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
      });

      // Track the API call for the account
      if (accountId) {
        await OpenAIMetrics.recordAPICall(accountId, 'classification', model);
      }

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No response from OpenAI');
      }

      return this.parseClassificationResult(result);
    } catch (error) {
      logger.error('Error classifying email with OpenAI:', error);
      // Fallback to rule-based classification
      return this.fallbackClassification(subject, body, sender);
    }
  }

  /**
   * Extract financial data from a classified financial email
   */
  async extractFinancialData(
    subject: string,
    body: string,
    category: string,
    accountId?: string
  ): Promise<FinancialDataExtraction> {
    if (!this.isConfigured) {
      return this.fallbackExtraction(subject, body);
    }

    try {
      const model = process.env.AI_EXTRACTION_MODEL || 'gpt-4o-mini';
      const prompts = await promptService.getExtractionPrompts(model, 'v1');
      
      // Special handling for credit card transactions
      const isCreditCard = category === 'credit_card';
      const requiredFieldsNote = isCreditCard && prompts.creditCardRequirements 
        ? '\n\n' + prompts.creditCardRequirements
        : '';
      
      // Render the user prompt with variables
      const userPrompt = promptService.renderPrompt(prompts.user, {
        category,
        subject,
        body: body.substring(0, 3000) + '...',
        requiredFieldsNote
      });
      
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: prompts.system
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: parseFloat(process.env.AI_TEMPERATURE || '0.1'),
        max_tokens: parseInt(process.env.AI_MAX_TOKENS || '1500'),
      });

      // Track the API call for the account
      if (accountId) {
        await OpenAIMetrics.recordAPICall(accountId, 'extraction', model);
      }

      const result = response.choices[0]?.message?.content;
      if (!result) {
        throw new Error('No response from OpenAI');
      }

      const extractedData = this.parseExtractionResult(result);
      
      // Validate required fields for credit card transactions
      if (category === 'credit_card') {
        const validatedData = this.validateCreditCardExtraction(extractedData);
        return validatedData;
      }

      return extractedData;
    } catch (error) {
      logger.error('Error extracting financial data with OpenAI:', error);
      return this.fallbackExtraction(subject, body);
    }
  }

  /**
   * @deprecated Use promptService.getClassificationPrompts() instead
   */
  private buildClassificationPrompt(subject: string, body: string, sender: string): string {
    // Legacy method - keeping for backward compatibility
    // New code should use promptService
    throw new Error('buildClassificationPrompt is deprecated. Use promptService.getClassificationPrompts() instead.');
  }

  /**
   * @deprecated Use promptService.getExtractionPrompts() instead
   */
  private buildExtractionPrompt(subject: string, body: string, category: string): string {
    // Legacy method - keeping for backward compatibility
    // New code should use promptService
    throw new Error('buildExtractionPrompt is deprecated. Use promptService.getExtractionPrompts() instead.');
  }

  private parseClassificationResult(result: string): EmailClassificationResult {
    try {
      // Try to extract JSON from the response if it's embedded in text
      let jsonString = result.trim();
      
      // Look for JSON block markers
      const jsonMatch = jsonString.match(/```json\s*(.*?)\s*```/s) || 
                       jsonString.match(/```\s*(.*?)\s*```/s) ||
                       jsonString.match(/\{.*\}/s);
      
      if (jsonMatch) {
        jsonString = jsonMatch[1] || jsonMatch[0];
      }
      
      // Try to find just the JSON object
      const braceStart = jsonString.indexOf('{');
      const braceEnd = jsonString.lastIndexOf('}');
      
      if (braceStart >= 0 && braceEnd > braceStart) {
        jsonString = jsonString.substring(braceStart, braceEnd + 1);
      }
      
      const parsed = JSON.parse(jsonString);
      return {
        isFinancial: Boolean(parsed.isFinancial),
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
        category: String(parsed.category || 'unknown'),
        subcategory: parsed.subcategory ? String(parsed.subcategory) : undefined,
        language: String(parsed.language || 'en'),
        currency: parsed.currency ? String(parsed.currency) : undefined,
        reasoning: String(parsed.reasoning || 'AI classification'),
      };
    } catch (error) {
      logger.error('Error parsing classification result:', error);
      logger.error('Raw result:', result.substring(0, 500));
      return {
        isFinancial: false,
        confidence: 0,
        category: 'error',
        language: 'en',
        reasoning: 'Failed to parse AI response',
      };
    }
  }

  private parseExtractionResult(result: string): FinancialDataExtraction {
    try {
      // Try to extract JSON from the response if it's embedded in text
      let jsonString = result.trim();
      
      // Look for JSON block markers
      const jsonMatch = jsonString.match(/```json\s*(.*?)\s*```/s) || 
                       jsonString.match(/```\s*(.*?)\s*```/s) ||
                       jsonString.match(/\{.*\}/s);
      
      if (jsonMatch) {
        jsonString = jsonMatch[1] || jsonMatch[0];
      }
      
      // Try to find just the JSON object
      const braceStart = jsonString.indexOf('{');
      const braceEnd = jsonString.lastIndexOf('}');
      
      if (braceStart >= 0 && braceEnd > braceStart) {
        jsonString = jsonString.substring(braceStart, braceEnd + 1);
      }
      
      const parsed = JSON.parse(jsonString);
      return {
        amount: parsed.amount ? Number(parsed.amount) : undefined,
        currency: parsed.currency ? String(parsed.currency) : undefined,
        date: parsed.date ? String(parsed.date) : undefined,
        merchantName: parsed.merchantName ? String(parsed.merchantName) : undefined,
        accountNumber: parsed.accountNumber ? String(parsed.accountNumber) : undefined,
        transactionId: parsed.transactionId ? String(parsed.transactionId) : undefined,
        transactionType: parsed.transactionType ? parsed.transactionType : undefined,
        description: parsed.description ? String(parsed.description) : undefined,
        category: parsed.category ? String(parsed.category) : undefined,
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      };
    } catch (error) {
      logger.error('Error parsing extraction result:', error);
      logger.error('Raw result:', result.substring(0, 500));
      
      // Enhanced fallback for non-JSON responses - try to extract data from plain text
      logger.warn('Attempting fallback text parsing for non-JSON response');
      return this.fallbackTextExtraction(result);
    }
  }

  /**
   * Fallback classification using simple rules (for development/testing)
   */
  private fallbackClassification(subject: string, body: string, sender: string): EmailClassificationResult {
    const text = `${subject} ${body} ${sender}`.toLowerCase();
    
    // Financial keywords
    const financialKeywords = [
      'payment', 'transaction', 'receipt', 'invoice', 'bill', 'charge',
      'deposit', 'withdrawal', 'transfer', 'balance', 'statement',
      'bank', 'credit', 'debit', 'card', 'account', 'purchase',
      'subscription', 'refund', 'fee', 'interest', 'loan', 'mortgage',
      'insurance', 'tax', 'investment', 'trading', 'portfolio'
    ];

    // Currency patterns
    const currencyPattern = /[\$€£¥₹₽]/;
    const amountPattern = /\d+[.,]\d{2}/;

    const hasFinancialKeywords = financialKeywords.some(keyword => text.includes(keyword));
    const hasCurrency = currencyPattern.test(text);
    const hasAmount = amountPattern.test(text);

    const isFinancial = hasFinancialKeywords && (hasCurrency || hasAmount);
    const confidence = isFinancial ? 0.7 : 0.3;

    // Simple categorization
    let category = 'non_financial';
    if (isFinancial) {
      if (text.includes('bank') || text.includes('statement')) category = 'banking';
      else if (text.includes('credit') || text.includes('card')) category = 'credit_card';
      else if (text.includes('payment') || text.includes('purchase')) category = 'payment';
      else if (text.includes('subscription')) category = 'subscription';
      else if (text.includes('bill') || text.includes('invoice')) category = 'bill';
      else category = 'other_financial';
    }

    return {
      isFinancial,
      confidence,
      category,
      language: 'en',
      reasoning: 'Fallback rule-based classification',
    };
  }

  /**
   * Fallback extraction using simple patterns (enhanced for Spanish)
   */
  private fallbackExtraction(subject: string, body: string): FinancialDataExtraction {
    const text = `${subject} ${body}`;
    
    // Enhanced amount patterns including Dominican Peso formats
    const amountMatch = text.match(/(?:RD\$|DOP\$|\$)\s?(\d{1,3}(?:[.,]\d{3})*[.,]?\d{0,2})/) ||
                       text.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s?(?:RD\$|DOP|pesos)/) ||
                       text.match(/[\$€£¥₹₽](\d{1,3}(?:[.,]\d{3})*[.,]\d{2})/);
    
    // Enhanced currency detection including Spanish patterns
    const currencyMatch = text.match(/RD\$|DOP\$|\$\s?DOP/) ? ['DOP'] :
                         text.match(/[\$](?!\s?DOP)/) ? ['USD'] :
                         text.match(/[€]/) ? ['EUR'] :
                         text.match(/\b(USD|EUR|GBP|JPY|CAD|AUD|DOP)\b/i);
    
    // Enhanced date patterns for Spanish formats
    const dateMatch = text.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/) ||
                     text.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/) ||
                     text.match(/\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/);
    
    // Extract merchant name from Spanish patterns
    const merchantMatch = text.match(/(?:en|establecimiento|comercio):\s?([A-Za-z\s]+)/) ||
                         text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:RD\$|\$|DOP)/);
    
    // Extract account number from Spanish patterns
    const accountMatch = text.match(/(?:terminada en|últimos dígitos|ending in)\s*(\d{4})/) ||
                        text.match(/\*{4}\s*(\d{4})/);
    
    return {
      amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : undefined,
      currency: currencyMatch ? (Array.isArray(currencyMatch) ? currencyMatch[0] : currencyMatch).toUpperCase() : undefined,
      date: dateMatch ? this.normalizeDateFormat(dateMatch[0]) : undefined,
      merchantName: merchantMatch ? merchantMatch[1].trim() : undefined,
      accountNumber: accountMatch ? `****${accountMatch[1]}` : undefined,
      transactionType: this.extractTransactionType(text),
      confidence: 0.5,
    };
  }

  /**
   * Extract transaction type from Spanish text
   */
  private extractTransactionType(text: string): 'debit' | 'credit' | 'payment' | 'transfer' | 'fee' | 'interest' | undefined {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('compra') || lowerText.includes('consumo') || lowerText.includes('transacción')) {
      return 'payment';
    }
    if (lowerText.includes('retiro') || lowerText.includes('extracción')) {
      return 'debit';
    }
    if (lowerText.includes('depósito') || lowerText.includes('abono')) {
      return 'credit';
    }
    if (lowerText.includes('transferencia')) {
      return 'transfer';
    }
    if (lowerText.includes('comisión') || lowerText.includes('cargo')) {
      return 'fee';
    }
    
    return undefined;
  }

  /**
   * Normalize date format to ISO 8601
   */
  private normalizeDateFormat(dateStr: string): string {
    // Handle DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dmyMatch) {
      const [, day, month, year] = dmyMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Handle YYYY/MM/DD or YYYY-MM-DD
    const ymdMatch = dateStr.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (ymdMatch) {
      const [, year, month, day] = ymdMatch;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateStr; // Return as-is if no pattern matches
  }

  private mapCurrencySymbol(symbol: string): string {
    const symbolMap: Record<string, string> = {
      '$': 'USD',
      'RD$': 'DOP',  // Dominican Peso symbol
      'DOP$': 'DOP', // Alternative Dominican Peso
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
      '₹': 'INR',
      '₽': 'RUB',
      'MX$': 'MXN',  // Mexican Peso
      'R$': 'BRL',   // Brazilian Real
    };
    return symbolMap[symbol] || symbol.toUpperCase();
  }

  /**
   * Validate that credit card transactions have all required fields (relaxed for Spanish)
   */
  private validateCreditCardExtraction(data: FinancialDataExtraction): FinancialDataExtraction {
    const requiredFields = ['amount', 'currency', 'merchantName', 'date', 'accountNumber'];
    const missingFields: string[] = [];
    let score = 0;

    // More lenient validation for Spanish/Dominican emails
    
    // Amount validation (more flexible)
    if (!data.amount || data.amount <= 0) {
      missingFields.push('amount');
    } else {
      score += 2; // High weight for amount
    }
    
    // Currency validation (accept common Dominican patterns)
    if (!data.currency) {
      missingFields.push('currency');
    } else if (['DOP', 'USD', 'EUR'].includes(data.currency.toUpperCase())) {
      score += 2; // High weight for valid currency
    } else {
      score += 1; // Partial credit for any currency detected
    }
    
    // Merchant name validation (accept any reasonable name)
    if (!data.merchantName || data.merchantName.trim().length < 2) {
      missingFields.push('merchantName');
    } else {
      score += 1.5; // Merchant name present
    }
    
    // Date validation (accept various formats)
    if (!data.date || data.date.trim().length === 0) {
      missingFields.push('date');
    } else {
      score += 1; // Date present
    }
    
    // Account number validation (very lenient, accept last 4 digits)
    if (!data.accountNumber) {
      missingFields.push('accountNumber');
    } else if (data.accountNumber.match(/\d{4}/)) {
      score += 1; // Has 4 digits somewhere
    } else {
      score += 0.5; // Some account info present
    }

    // Calculate confidence based on completeness score
    const maxScore = 7.5; // Maximum possible score
    const completenessRatio = score / maxScore;
    
    // Adjust confidence based on how many fields we successfully extracted
    let adjustedConfidence = data.confidence;
    
    if (missingFields.length === 0) {
      // All fields present - boost confidence
      adjustedConfidence = Math.max(data.confidence, 0.8);
    } else if (missingFields.length <= 2) {
      // Most fields present - moderate confidence
      adjustedConfidence = Math.max(data.confidence * completenessRatio, 0.5);
    } else if (missingFields.length <= 3) {
      // Some fields present - lower confidence but still usable
      adjustedConfidence = Math.max(data.confidence * completenessRatio, 0.3);
    } else {
      // Too many missing fields - very low confidence
      adjustedConfidence = Math.min(data.confidence, 0.2);
    }

    if (missingFields.length > 0) {
      logger.info(`Credit card extraction missing ${missingFields.length} fields: ${missingFields.join(', ')} - adjusted confidence: ${adjustedConfidence.toFixed(2)}`);
    }

    return {
      ...data,
      confidence: Math.min(Math.max(adjustedConfidence, 0.1), 1.0), // Ensure confidence is between 0.1 and 1.0
    };
  }

  /**
   * Fallback extraction from non-JSON OpenAI responses
   */
  private fallbackTextExtraction(text: string): FinancialDataExtraction {
    logger.info('Using fallback text extraction for OpenAI response');
    
    // Try to extract key information from plain text response
    const amount = this.extractAmountFromText(text);
    const currency = this.extractCurrencyFromText(text);
    const merchantName = this.extractMerchantFromText(text);
    const date = this.extractDateFromText(text);
    const accountNumber = this.extractAccountFromText(text);
    
    // Calculate confidence based on how many fields we extracted
    let confidence = 0.1; // Base confidence for fallback
    if (amount !== undefined) confidence += 0.2;
    if (currency !== undefined) confidence += 0.2; 
    if (merchantName !== undefined) confidence += 0.2;
    if (date !== undefined) confidence += 0.2;
    if (accountNumber !== undefined) confidence += 0.2;
    
    return {
      amount,
      currency,
      date,
      merchantName,
      accountNumber,
      transactionType: 'payment', // Default for credit card transactions
      confidence: Math.min(confidence, 0.8), // Cap at 0.8 for fallback extraction
    };
  }

  private extractAmountFromText(text: string): number | undefined {
    // Look for Dominican Peso patterns and USD patterns
    const dopPattern = /(?:RD\$|DOP)\s?(\d{1,3}(?:[.,]\d{3})*[.,]?\d{0,2})/i;
    const usdPattern = /\$\s?(\d{1,3}(?:[.,]\d{3})*[.,]?\d{2})/;
    const numberPattern = /(\d{1,3}(?:[.,]\d{3})*[.,]?\d{0,2})/;
    
    const dopMatch = text.match(dopPattern);
    if (dopMatch) {
      return parseFloat(dopMatch[1].replace(/,/g, ''));
    }
    
    const usdMatch = text.match(usdPattern);
    if (usdMatch) {
      return parseFloat(usdMatch[1].replace(/,/g, ''));
    }
    
    const numberMatch = text.match(numberPattern);
    if (numberMatch) {
      return parseFloat(numberMatch[1].replace(/,/g, ''));
    }
    
    return undefined;
  }

  private extractCurrencyFromText(text: string): string | undefined {
    if (text.match(/RD\$|DOP/i)) return 'DOP';
    if (text.match(/\$|USD/)) return 'USD';
    if (text.match(/EUR|€/i)) return 'EUR';
    return undefined;
  }

  private extractMerchantFromText(text: string): string | undefined {
    // Look for patterns like "at MERCHANT", "establecimiento MERCHANT", etc.
    const merchantPatterns = [
      /(?:at|establecimiento|comercio|merchant)\s+([A-Z][A-Za-z\s]+)/i,
      /([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)\s*(?:RD\$|\$|DOP)/,
    ];
    
    for (const pattern of merchantPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return undefined;
  }

  private extractDateFromText(text: string): string | undefined {
    const datePatterns = [
      /(\d{4}-\d{2}-\d{2})/,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/,
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return this.normalizeDateFormat(match[1]);
      }
    }
    return undefined;
  }

  private extractAccountFromText(text: string): string | undefined {
    const accountPatterns = [
      /(?:terminada en|ending in|últimos dígitos)\s*(\d{4})/i,
      /\*{4}\s*(\d{4})/,
      /#\s*(\d{4})/,
    ];
    
    for (const pattern of accountPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();