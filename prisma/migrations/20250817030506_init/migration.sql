-- CreateEnum
CREATE TYPE "EmailClassification" AS ENUM ('BANKING', 'CREDIT_CARD', 'INVESTMENT', 'PAYMENT', 'BILL', 'INSURANCE', 'TAX', 'LOAN', 'OTHER', 'UNCLASSIFIED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'CLASSIFIED', 'EXTRACTED', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEBIT', 'CREDIT', 'PAYMENT', 'TRANSFER', 'FEE', 'INTEREST', 'DIVIDEND', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('EMAIL_RECEIVED', 'EMAIL_CLASSIFIED', 'DATA_EXTRACTED', 'EMAIL_VALIDATED', 'USER_LOGIN', 'USER_LOGOUT', 'ACCOUNT_CONNECTED', 'ACCOUNT_DISCONNECTED', 'SETTINGS_UPDATED', 'ERROR_OCCURRED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'FAILED', 'DELAYED', 'PAUSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailAddress" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "syncSettings" JSONB NOT NULL DEFAULT '{}',
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_emails" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "gmailId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" JSONB NOT NULL DEFAULT '[]',
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT NOT NULL,
    "bodyPreview" TEXT,
    "classification" "EmailClassification" NOT NULL DEFAULT 'UNCLASSIFIED',
    "confidenceScore" DECIMAL(3,2),
    "processingStatus" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "gmailLabels" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "processingTimeMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_data" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "transactionAmount" DECIMAL(15,2),
    "currency" TEXT,
    "amountUSD" DECIMAL(15,2),
    "exchangeRate" DECIMAL(10,6),
    "transactionDate" TIMESTAMP(3),
    "merchantName" TEXT,
    "merchantCategory" TEXT,
    "accountNumber" TEXT,
    "transactionType" "TransactionType" NOT NULL DEFAULT 'UNKNOWN',
    "description" TEXT,
    "referenceNumber" TEXT,
    "balance" DECIMAL(15,2),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "extractionScore" DECIMAL(3,2),
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extracted_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "emailId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "sessionId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "queue_jobs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "queueName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'WAITING',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "data" JSONB NOT NULL DEFAULT '{}',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "queue_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" DECIMAL(15,6) NOT NULL,
    "metricUnit" TEXT NOT NULL DEFAULT 'ms',
    "category" TEXT NOT NULL DEFAULT 'processing',
    "tags" JSONB NOT NULL DEFAULT '{}',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_userId_gmailAddress_key" ON "email_accounts"("userId", "gmailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "processed_emails_gmailId_key" ON "processed_emails"("gmailId");

-- CreateIndex
CREATE INDEX "processed_emails_accountId_processingStatus_idx" ON "processed_emails"("accountId", "processingStatus");

-- CreateIndex
CREATE INDEX "processed_emails_classification_receivedAt_idx" ON "processed_emails"("classification", "receivedAt");

-- CreateIndex
CREATE INDEX "processed_emails_gmailId_idx" ON "processed_emails"("gmailId");

-- CreateIndex
CREATE UNIQUE INDEX "extracted_data_emailId_key" ON "extracted_data"("emailId");

-- CreateIndex
CREATE INDEX "extracted_data_currency_transactionDate_idx" ON "extracted_data"("currency", "transactionDate");

-- CreateIndex
CREATE INDEX "extracted_data_merchantName_idx" ON "extracted_data"("merchantName");

-- CreateIndex
CREATE INDEX "extracted_data_transactionDate_idx" ON "extracted_data"("transactionDate");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_emailId_idx" ON "audit_logs"("emailId");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "queue_jobs_jobId_key" ON "queue_jobs"("jobId");

-- CreateIndex
CREATE INDEX "queue_jobs_queueName_status_idx" ON "queue_jobs"("queueName", "status");

-- CreateIndex
CREATE INDEX "queue_jobs_jobType_createdAt_idx" ON "queue_jobs"("jobType", "createdAt");

-- CreateIndex
CREATE INDEX "performance_metrics_metricName_recordedAt_idx" ON "performance_metrics"("metricName", "recordedAt");

-- CreateIndex
CREATE INDEX "performance_metrics_category_recordedAt_idx" ON "performance_metrics"("category", "recordedAt");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_emails" ADD CONSTRAINT "processed_emails_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_data" ADD CONSTRAINT "extracted_data_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "processed_emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "processed_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;
