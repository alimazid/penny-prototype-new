import { logger } from './logger';

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
  attachments?: Array<{ filename: string; size: number }>;
}

export class SampleEmailGenerator {
  private emailCounter = 1;

  /**
   * Generate a collection of sample financial emails for testing
   */
  generateSampleEmails(count: number = 20): SampleEmail[] {
    const emails: SampleEmail[] = [];
    const emailTypes = [
      'banking_transaction',
      'credit_card_statement', 
      'spanish_qik_credit_card',  // New Spanish templates
      'spanish_notificacion_consumo',
      'spanish_bhd_transacciones',
      'investment_update',
      'payment_confirmation',
      'subscription_renewal',
      'bill_notification',
      'tax_document',
      'insurance_communication',
      'loan_payment',
      'non_financial'
    ];

    for (let i = 0; i < count; i++) {
      const type = emailTypes[i % emailTypes.length];
      const email = this.generateEmailByType(type);
      emails.push(email);
    }

    logger.info(`Generated ${emails.length} sample emails for testing`);
    return emails;
  }

  private generateEmailByType(type: string): SampleEmail {
    const baseId = `sample_${this.emailCounter++}`;
    const date = this.getRandomDateInPast(30); // Last 30 days

    switch (type) {
      case 'banking_transaction':
        return this.generateBankingEmail(baseId, date);
      case 'credit_card_statement':
        return this.generateCreditCardEmail(baseId, date);
      case 'spanish_qik_credit_card':
        return this.generateSpanishQikEmail(baseId, date);
      case 'spanish_notificacion_consumo':
        return this.generateSpanishNotificacionEmail(baseId, date);
      case 'spanish_bhd_transacciones':
        return this.generateSpanishBHDEmail(baseId, date);
      case 'investment_update':
        return this.generateInvestmentEmail(baseId, date);
      case 'payment_confirmation':
        return this.generatePaymentEmail(baseId, date);
      case 'subscription_renewal':
        return this.generateSubscriptionEmail(baseId, date);
      case 'bill_notification':
        return this.generateBillEmail(baseId, date);
      case 'tax_document':
        return this.generateTaxEmail(baseId, date);
      case 'insurance_communication':
        return this.generateInsuranceEmail(baseId, date);
      case 'loan_payment':
        return this.generateLoanEmail(baseId, date);
      case 'non_financial':
        return this.generateNonFinancialEmail(baseId, date);
      default:
        return this.generateBankingEmail(baseId, date);
    }
  }

  private generateBankingEmail(id: string, date: Date): SampleEmail {
    const amounts = ['$250.00', '$1,234.56', '$45.99', '$2,500.00', '$89.12'];
    const merchants = ['Amazon', 'Grocery Store', 'Gas Station', 'Restaurant', 'ATM Withdrawal'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];

    return {
      id,
      subject: `Transaction Alert: ${amount} at ${merchant}`,
      from: 'alerts@bankofamerica.com',
      to: 'user@example.com',
      date,
      body: `Dear Customer,

A transaction has been processed on your Bank of America account ending in 1234.

Transaction Details:
Amount: ${amount}
Merchant: ${merchant}
Date: ${date.toLocaleDateString()}
Time: ${date.toLocaleTimeString()}
Available Balance: $3,456.78

If you did not authorize this transaction, please contact us immediately.

Best regards,
Bank of America Customer Service`,
      labelIds: ['INBOX'],
    };
  }

  private generateCreditCardEmail(id: string, date: Date): SampleEmail {
    const amounts = ['$89.99', '$156.23', '$2,345.67', '$45.00', '$678.90'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    return {
      id,
      subject: 'Your Chase Credit Card Statement is Ready',
      from: 'statements@chase.com',
      to: 'user@example.com',
      date,
      body: `Your Chase Freedom Credit Card statement is now available.

Statement Period: ${this.formatDate(this.subtractDays(date, 30))} - ${this.formatDate(date)}

Account Summary:
Previous Balance: $1,234.56
Payments/Credits: $1,234.56
Purchases: ${amount}
Cash Advances: $0.00
Balance Transfers: $0.00
Interest Charged: $0.00
Fees Charged: $0.00

New Balance: ${amount}
Minimum Payment Due: ${(parseFloat(amount.replace('$', '')) * 0.02).toFixed(2)}
Payment Due Date: ${this.formatDate(this.addDays(date, 25))}

Available Credit: $4,567.89

View your statement online at chase.com`,
      labelIds: ['INBOX', 'CATEGORY_PERSONAL'],
    };
  }

  private generateInvestmentEmail(id: string, date: Date): SampleEmail {
    const gains = ['+$234.56', '+$1,234.67', '-$123.45', '+$567.89', '+$45.23'];
    const gain = gains[Math.floor(Math.random() * gains.length)];

    return {
      id,
      subject: 'Portfolio Update - Your Daily Summary',
      from: 'updates@fidelity.com',
      to: 'user@example.com',
      date,
      body: `Good ${date.getHours() < 12 ? 'Morning' : 'Evening'},

Here's your portfolio summary for ${this.formatDate(date)}:

Portfolio Value: $45,678.90
Day's Change: ${gain} (${gain.includes('-') ? '-' : '+'}1.23%)

Top Performers:
• AAPL: +2.34%
• MSFT: +1.56%
• GOOGL: +0.89%

Recent Activity:
• Dividend received: VTIAX - $23.45
• Automatic investment: $500.00 into Target Date Fund

Your portfolio is up 8.9% year-to-date.

Login to view detailed performance and make changes to your investments.

Fidelity Investments`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
    };
  }

  private generatePaymentEmail(id: string, date: Date): SampleEmail {
    const merchants = ['Amazon', 'Netflix', 'Spotify', 'Uber', 'DoorDash'];
    const amounts = ['$12.99', '$89.99', '$156.78', '$23.45', '$67.89'];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    return {
      id,
      subject: `Payment Confirmation - ${merchant}`,
      from: `receipts@${merchant.toLowerCase()}.com`,
      to: 'user@example.com',
      date,
      body: `Thank you for your purchase!

Order Details:
Order #: ${this.generateOrderNumber()}
Date: ${this.formatDate(date)}
Amount: ${amount}
Payment Method: Visa ending in 1234

Items:
${this.generateOrderItems(merchant)}

Billing Address:
123 Main Street
Anytown, ST 12345

Your order will be processed within 1-2 business days.

Questions? Visit our help center or contact customer service.

Best regards,
${merchant} Team`,
      labelIds: ['INBOX', 'CATEGORY_PURCHASES'],
    };
  }

  private generateSubscriptionEmail(id: string, date: Date): SampleEmail {
    const services = ['Netflix', 'Spotify Premium', 'Adobe Creative Cloud', 'Microsoft 365', 'Dropbox Plus'];
    const amounts = ['$15.99', '$9.99', '$52.99', '$6.99', '$11.99'];
    const service = services[Math.floor(Math.random() * services.length)];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    return {
      id,
      subject: `${service} - Payment Successful`,
      from: `billing@${service.toLowerCase().replace(' ', '')}.com`,
      to: 'user@example.com',
      date,
      body: `Hi there,

Your ${service} subscription has been successfully renewed.

Subscription Details:
Plan: ${service}
Amount: ${amount}
Billing Date: ${this.formatDate(date)}
Next Billing Date: ${this.formatDate(this.addDays(date, 30))}
Payment Method: **** **** **** 1234

Your subscription will continue uninterrupted. You can manage your subscription settings at any time in your account.

Enjoy your ${service} experience!

The ${service} Team`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
    };
  }

  private generateBillEmail(id: string, date: Date): SampleEmail {
    const utilities = ['Electric Company', 'Gas & Water Utility', 'Internet Provider', 'Phone Company'];
    const amounts = ['$89.45', '$156.78', '$79.99', '$234.56'];
    const utility = utilities[Math.floor(Math.random() * utilities.length)];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];

    return {
      id,
      subject: `Your ${utility} Bill is Ready`,
      from: `billing@${utility.toLowerCase().replace(' ', '').replace('&', 'and')}.com`,
      to: 'user@example.com',
      date,
      body: `Your monthly statement is now available.

Account Information:
Account Number: ****-****-1234
Service Address: 123 Main Street, Anytown, ST 12345

Billing Summary:
Previous Balance: $0.00
Payments Received: $0.00
Current Charges: ${amount}
Total Amount Due: ${amount}

Due Date: ${this.formatDate(this.addDays(date, 30))}

Usage Details:
${this.generateUsageDetails(utility)}

You can pay online, by phone, or by mail. Set up AutoPay to never miss a payment.

Customer Service: 1-800-UTILITY`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
    };
  }

  private generateTaxEmail(id: string, date: Date): SampleEmail {
    return {
      id,
      subject: 'Important Tax Document Available - Form 1099',
      from: 'tax-documents@fidelity.com',
      to: 'user@example.com',
      date,
      body: `Important Tax Information

Your 2024 Form 1099-DIV is now available for download.

This form reports dividends and distributions you received during the tax year 2024. You'll need this information to complete your tax return.

Document Details:
Form Type: 1099-DIV
Tax Year: 2024
Total Dividends: $156.78
Qualified Dividends: $145.23

To access your tax documents:
1. Log in to your account
2. Go to "Tax Center"
3. Select "Tax Documents"
4. Download your 1099-DIV

Keep this document for your records. We recommend consulting with a tax professional for tax planning advice.

Fidelity Tax Services`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
      attachments: [{ filename: '1099-DIV-2024.pdf', size: 245678 }],
    };
  }

  private generateInsuranceEmail(id: string, date: Date): SampleEmail {
    return {
      id,
      subject: 'Auto Insurance Policy Renewal Notice',
      from: 'notices@statefarm.com',
      to: 'user@example.com',
      date,
      body: `Dear Valued Customer,

Your auto insurance policy is scheduled for renewal.

Policy Information:
Policy Number: SF-AUTO-123456789
Vehicle: 2020 Honda Civic
Current Premium: $1,234.56 per year
Renewal Premium: $1,287.43 per year

Renewal Date: ${this.formatDate(this.addDays(date, 30))}

Your new premium reflects current rates and any changes to your coverage. The increase is due to:
• General rate adjustment: +2.5%
• Clean driving record discount: -5%

Payment Options:
• Annual Payment: $1,287.43
• Semi-Annual: $656.78 (x2)
• Quarterly: $334.56 (x4)
• Monthly: $112.45 (x12)

No action is needed if you want to continue with automatic renewal.

State Farm Insurance`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
    };
  }

  private generateLoanEmail(id: string, date: Date): SampleEmail {
    return {
      id,
      subject: 'Mortgage Payment Confirmation',
      from: 'payments@quickenloans.com',
      to: 'user@example.com',
      date,
      body: `Thank you for your mortgage payment.

Payment Details:
Loan Number: QL-123456789
Payment Amount: $2,456.78
Principal: $1,234.56
Interest: $987.65
Escrow: $234.57
Payment Date: ${this.formatDate(date)}

Remaining Balance: $234,567.89
Next Payment Due: ${this.formatDate(this.addDays(date, 30))}

Your payment has been applied to your account. You can view your payment history and loan details online.

Questions about your mortgage? Contact us at 1-800-QUICKEN.

Quicken Loans
America's Largest Mortgage Lender`,
      labelIds: ['INBOX', 'CATEGORY_UPDATES'],
    };
  }

  private generateNonFinancialEmail(id: string, date: Date): SampleEmail {
    const subjects = [
      'Weekly Newsletter - Tech Updates',
      'Your Photo Memories This Week',
      'Meeting Reminder: Team Standup',
      'Weather Alert for Your Area',
      'Recipe of the Day: Pasta Carbonara'
    ];
    const subject = subjects[Math.floor(Math.random() * subjects.length)];

    return {
      id,
      subject,
      from: 'noreply@newsletter.com',
      to: 'user@example.com',
      date,
      body: `This is a non-financial email for testing purposes.

${subject}

This email contains general information and should not be classified as financial. It's used to test the AI classification system's ability to distinguish between financial and non-financial content.

No monetary amounts, transactions, or financial institutions are mentioned in this email content.

Best regards,
Newsletter Team`,
      labelIds: ['INBOX', 'CATEGORY_SOCIAL'],
    };
  }

  // Spanish Credit Card Email Templates
  
  private generateSpanishQikEmail(id: string, date: Date): SampleEmail {
    const amounts = ['1,500.00', '2,450.50', '850.00', '3,200.75', '675.25'];
    const merchants = ['Supermercado Nacional', 'Aggarwal Plaza', 'Shell Estación', 'Farmacity Centro', 'Amazon'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const cardDigits = ['1234', '5678', '9012', '3456', '7890'][Math.floor(Math.random() * 5)];

    return {
      id,
      subject: 'Fwd: Usaste tu tarjeta de crédito Qik',
      from: 'notificaciones@qik.com',
      to: 'user@example.com',
      date,
      body: `Estimado cliente,

Le informamos que se ha realizado una transacción con su tarjeta de crédito Qik.

Detalles de la transacción:
Fecha: ${date.toLocaleDateString('es-DO')}
Hora: ${date.toLocaleTimeString('es-DO')}
Monto: RD$${amount}
Establecimiento: ${merchant}
Tarjeta terminada en: ${cardDigits}
Tipo de transacción: Compra

Si usted no realizó esta transacción, comuníquese inmediatamente con nuestro centro de atención al cliente al 809-XXX-XXXX.

Saludos cordiales,
Equipo Qik`,
      labelIds: ['INBOX', 'CATEGORY_PURCHASES'],
    };
  }

  private generateSpanishNotificacionEmail(id: string, date: Date): SampleEmail {
    const amounts = ['2,850.00', '1,275.50', '925.00', '3,450.25', '780.75'];
    const merchants = ['Plaza Lama', 'Jumbo Supermercados', 'Texaco Gasolinera', 'Carol Farmacia', 'Bella Vista Mall'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const cardDigits = ['2468', '1357', '9753', '8642', '1029'][Math.floor(Math.random() * 5)];

    return {
      id,
      subject: 'Fwd: Notificación de Consumo',
      from: 'alertas@bancocard.do',
      to: 'user@example.com',
      date,
      body: `Apreciado cliente,

Se ha registrado un consumo en su tarjeta de crédito.

Información del consumo:
Fecha de transacción: ${date.toLocaleDateString('es-DO')}
Comercio: ${merchant}
Monto: RD$${amount}
Últimos dígitos de la tarjeta: ${cardDigits}
Referencia: TXN${Date.now().toString().substr(-8)}

Saldo disponible: RD$15,750.00

Para consultas o reclamos, puede comunicarse con nosotros las 24 horas al *123 desde su celular.

Atentamente,
Banco Card Dominicano`,
      labelIds: ['INBOX', 'CATEGORY_PURCHASES'],
    };
  }

  private generateSpanishBHDEmail(id: string, date: Date): SampleEmail {
    const amounts = ['1,875.00', '3,250.50', '625.00', '2,480.75', '1,150.25'];
    const merchants = ['La Sirena Supermercado', 'Pola Supermercado', 'Esso Combustible', 'Multicentro Churchill', 'Ikea Dominicana'];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const cardDigits = ['4567', '8901', '2345', '6789', '1234'][Math.floor(Math.random() * 5)];

    return {
      id,
      subject: 'Fwd: BHD Notificación de Transacciones',
      from: 'notificaciones@bhdleon.com.do',
      to: 'user@example.com',
      date,
      body: `Estimado(a) cliente,

Le notificamos que se ha procesado una transacción en su tarjeta de crédito BHD León.

Detalles de la operación:
Fecha y hora: ${date.toLocaleDateString('es-DO')} ${date.toLocaleTimeString('es-DO')}
Establecimiento: ${merchant}
Monto de la transacción: RD$${amount}
Número de tarjeta: **** **** **** ${cardDigits}
Código de autorización: AUTH${Math.floor(Math.random() * 900000) + 100000}
Tipo de operación: Consumo nacional

Balance disponible después de la transacción: RD$18,425.50

Si no reconoce esta transacción, comuníquese inmediatamente con nuestro Call Center al 809-345-2000.

Cordialmente,
BHD León
Tu banco de confianza`,
      labelIds: ['INBOX', 'CATEGORY_PURCHASES'],
    };
  }

  // Helper methods
  private getRandomDateInPast(days: number): Date {
    const now = new Date();
    const msPerDay = 24 * 60 * 60 * 1000;
    const randomDays = Math.floor(Math.random() * days);
    return new Date(now.getTime() - (randomDays * msPerDay));
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }

  private generateOrderNumber(): string {
    return `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  }

  private generateOrderItems(merchant: string): string {
    const itemsByMerchant: Record<string, string[]> = {
      'Amazon': ['Wireless Headphones', 'USB-C Cable', 'Phone Case'],
      'Netflix': ['Monthly Subscription'],
      'Spotify': ['Premium Subscription'],
      'Uber': ['Ride from Downtown to Airport'],
      'DoorDash': ['Dinner from Italian Restaurant']
    };

    const items = itemsByMerchant[merchant] || ['Product Item'];
    return items.map(item => `• ${item}`).join('\n');
  }

  private generateUsageDetails(utility: string): string {
    const details: Record<string, string> = {
      'Electric Company': 'kWh Used: 842\nAverage Daily Usage: 28 kWh\nRate: $0.12/kWh',
      'Gas & Water Utility': 'Gas: 156 therms\nWater: 3,456 gallons\nSewer: Base rate',
      'Internet Provider': 'Plan: High-Speed Internet 100 Mbps\nData Usage: Unlimited',
      'Phone Company': 'Plan: Unlimited Talk, Text & Data\nLines: 2 devices'
    };

    return details[utility] || 'Usage details available online.';
  }
}

// Export singleton instance
export const sampleEmailGenerator = new SampleEmailGenerator();