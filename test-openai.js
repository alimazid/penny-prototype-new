#!/usr/bin/env node

// Simple test script to validate OpenAI service
const { openaiService } = require('./dist/services/openaiService.js');

async function testOpenAI() {
  console.log('🧪 Testing OpenAI Service...');
  
  // Test email data
  const testEmail = {
    subject: "Transaction Alert: $45.99 at Amazon",
    body: `Dear Customer,

A transaction has been processed on your Bank of America account ending in 1234.

Transaction Details:
Amount: $45.99
Merchant: Amazon
Date: 7/26/2025
Time: 10:35 AM
Available Balance: $3,456.78

If you did not authorize this transaction, please contact us immediately.

Best regards,
Bank of America Customer Service`,
    sender: "alerts@bankofamerica.com"
  };

  try {
    console.log('📧 Test Email:');
    console.log(`  Subject: ${testEmail.subject}`);
    console.log(`  Sender: ${testEmail.sender}`);
    console.log(`  Body: ${testEmail.body.substring(0, 100)}...`);
    console.log('');

    // Test classification
    console.log('🤖 Testing Email Classification...');
    const classification = await openaiService.classifyEmail(
      testEmail.subject,
      testEmail.body,
      testEmail.sender
    );

    console.log('📊 Classification Results:');
    console.log(`  Is Financial: ${classification.isFinancial}`);
    console.log(`  Confidence: ${Math.round(classification.confidence * 100)}%`);
    console.log(`  Category: ${classification.category}`);
    console.log(`  Language: ${classification.language}`);
    console.log(`  Currency: ${classification.currency || 'Not detected'}`);
    console.log(`  Reasoning: ${classification.reasoning}`);
    console.log('');

    if (classification.isFinancial) {
      // Test extraction
      console.log('💰 Testing Data Extraction...');
      const extraction = await openaiService.extractFinancialData(
        testEmail.subject,
        testEmail.body,
        classification.category
      );

      console.log('📈 Extraction Results:');
      console.log(`  Amount: ${extraction.amount || 'Not detected'}`);
      console.log(`  Currency: ${extraction.currency || 'Not detected'}`);
      console.log(`  Date: ${extraction.date || 'Not detected'}`);
      console.log(`  Merchant: ${extraction.merchantName || 'Not detected'}`);
      console.log(`  Transaction Type: ${extraction.transactionType || 'Not detected'}`);
      console.log(`  Description: ${extraction.description || 'Not detected'}`);
      console.log(`  Confidence: ${Math.round(extraction.confidence * 100)}%`);
    }

    console.log('');
    console.log('✅ OpenAI Service Test Completed Successfully!');

  } catch (error) {
    console.error('❌ OpenAI Service Test Failed:');
    console.error(error.message);
    console.error('');
    
    if (error.message.includes('API key')) {
      console.log('💡 This might be an API key issue. Check your OPENAI_API_KEY configuration.');
    } else if (error.message.includes('quota') || error.message.includes('rate')) {
      console.log('💡 This might be a rate limit or quota issue. Check your OpenAI account.');
    } else {
      console.log('💡 This might be a network or service issue. Try again in a moment.');
    }
  }
}

// Run the test
testOpenAI();