# Penny Prototype Setup Guide

This comprehensive guide will walk you through obtaining all the required API keys and configuration values needed to run the Penny prototype.

## Overview

The Penny prototype requires several external services:
- **OpenAI** - For AI-powered email classification and data extraction
- **Google Cloud Platform** - For Gmail API access and real-time notifications
- **Local Services** - PostgreSQL and Redis for data storage and queue management

---

## 1. OpenAI API Setup

### What it's for:
OpenAI provides the AI models (GPT-4) that classify emails as financial/non-financial and extract structured data from financial emails.

### Steps to obtain:

1. **Create OpenAI Account**
   - Go to https://platform.openai.com/
   - Sign up or log in with your account

2. **Add Billing Information**
   - Navigate to "Billing" in the left sidebar
   - Add a credit card (required for API access)
   - Set up usage limits if desired (recommended: $20-50 for testing)

3. **Generate API Key**
   - Go to https://platform.openai.com/account/api-keys
   - Click "Create new secret key"
   - Give it a name like "Penny Prototype"
   - **IMPORTANT**: Copy the key immediately - you won't see it again
   - It will look like: `sk-proj-abcd1234...`

4. **Optional: Get Organization ID**
   - Go to https://platform.openai.com/account/org-settings
   - Copy the "Organization ID" if you're part of multiple organizations

### Configuration:
```bash
OPENAI_API_KEY="sk-proj-your-actual-key-here"
OPENAI_ORGANIZATION_ID=""  # Optional, leave empty if not needed
```

### Cost Estimate:
- GPT-4: ~$0.03 per 1K tokens
- Expected cost for prototype testing: $5-20 total

---

## 2. Google Cloud Platform Setup

### What it's for:
- **Gmail API** - Read and manage Gmail emails
- **OAuth 2.0** - Secure user authentication
- **Pub/Sub** - Real-time email notifications (optional)

### Steps to obtain:

#### 2.1 Create Google Cloud Project

1. **Go to Google Cloud Console**
   - Visit https://console.cloud.google.com/
   - Sign in with your Google account

2. **Create New Project**
   - Click the project dropdown at the top
   - Click "New Project"
   - Name: "Penny Prototype" (or similar)
   - Click "Create"
   - **Copy the Project ID** - you'll need this later

#### 2.2 Enable Required APIs

1. **Navigate to APIs & Services**
   - In the left sidebar, go to "APIs & Services" > "Library"

2. **Enable Gmail API**
   - Search for "Gmail API"
   - Click on it and click "Enable"

3. **Enable Pub/Sub API** (Optional but recommended)
   - Search for "Cloud Pub/Sub API"
   - Click on it and click "Enable"

#### 2.3 Create OAuth 2.0 Credentials

1. **Go to Credentials**
   - Navigate to "APIs & Services" > "Credentials"

2. **Configure OAuth Consent Screen**
   - Click "OAuth consent screen"
   - Choose "External" (unless you have a Google Workspace)
   - Fill in required fields:
     - App name: "Penny Prototype"
     - User support email: Your email
     - Developer contact: Your email
   - Add scopes: Click "Add or Remove Scopes"
     - Add: `https://www.googleapis.com/auth/gmail.readonly`
     - Add: `https://www.googleapis.com/auth/gmail.labels`
     - Add: `https://www.googleapis.com/auth/gmail.modify`
   - Add your email as a test user
   - Save and continue

3. **Create OAuth 2.0 Client ID**
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Name: "Penny Prototype Web Client"
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Click "Create"
   - **Copy both the Client ID and Client Secret**

#### 2.4 Create Service Account (Optional but recommended)

1. **Create Service Account**
   - Go to "IAM & Admin" > "Service Accounts"
   - Click "Create Service Account"
   - Name: "penny-prototype-service"
   - Description: "Service account for Penny prototype"
   - Click "Create and Continue"

2. **Add Roles**
   - Add role: "Pub/Sub Admin" (if using Pub/Sub)
   - Click "Continue" and "Done"

3. **Generate Private Key**
   - Click on the created service account
   - Go to "Keys" tab
   - Click "Add Key" > "Create new key"
   - Choose "JSON" format
   - Download the file and extract the private key

#### 2.5 Setup Pub/Sub (Optional)

1. **Create Topic**
   - Go to "Pub/Sub" > "Topics"
   - Click "Create Topic"
   - Topic ID: "gmail-notifications"
   - Create

2. **Create Subscription**
   - Click on your topic
   - Click "Create Subscription"
   - Subscription ID: "penny-prototype"
   - Create

### Configuration:
```bash
# Basic OAuth (Required)
GOOGLE_CLIENT_ID="123456789.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-your-client-secret"
GOOGLE_PROJECT_ID="your-project-id"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# Service Account (Optional)
GOOGLE_SERVICE_ACCOUNT_EMAIL="penny-prototype-service@your-project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key-Here\n-----END PRIVATE KEY-----"

# Pub/Sub (Optional)
GOOGLE_PUBSUB_TOPIC="projects/your-project-id/topics/gmail-notifications"
GOOGLE_PUBSUB_SUBSCRIPTION="projects/your-project-id/subscriptions/penny-prototype"
```

---

## 3. Local Development Setup

### 3.1 Database Configuration

The prototype uses PostgreSQL for data storage. If you ran the setup script, this should already be configured.

**Default Configuration:**
```bash
DATABASE_URL="postgresql://penny:password123@localhost:5432/penny_prototype"
```

**To verify/setup manually:**
```bash
# Check if PostgreSQL is running
brew services list | grep postgresql

# Start if not running
brew services start postgresql

# Create database and user
psql postgres
CREATE USER penny WITH PASSWORD 'password123';
CREATE DATABASE penny_prototype OWNER penny;
GRANT ALL PRIVILEGES ON DATABASE penny_prototype TO penny;
\q
```

### 3.2 Redis Configuration

Redis is used for queue management and caching.

**Default Configuration:**
```bash
REDIS_URL="redis://localhost:6379"
```

**To verify/setup manually:**
```bash
# Check if Redis is running
brew services list | grep redis

# Start if not running
brew services start redis

# Test connection
redis-cli ping
# Should return: PONG
```

### 3.3 Webhook Configuration (For real-time notifications)

For Gmail push notifications, you need a public URL. Use ngrok for local development.

**Install and setup ngrok:**
```bash
# Install ngrok
brew install ngrok

# Sign up at https://ngrok.com/ (free account)
# Get your authtoken from the dashboard

# Configure ngrok
ngrok config add-authtoken YOUR_AUTHTOKEN

# Start ngrok (in a separate terminal)
ngrok http 3000
```

**Configuration:**
```bash
WEBHOOK_BASE_URL="https://your-ngrok-subdomain.ngrok.io"
WEBHOOK_SECRET="your-random-webhook-secret-123"
```

---

## 4. Security Configuration

### 4.1 JWT Secret

Used for signing authentication tokens.

**Generate a secure secret:**
```bash
# Option 1: Use openssl
openssl rand -base64 32

# Option 2: Use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Configuration:**
```bash
JWT_SECRET="your-generated-secret-here"
JWT_EXPIRES_IN="24h"
```

### 4.2 Session Secret

Used for encrypting session data.

**Generate a secure secret:**
```bash
# Use the same method as JWT secret
openssl rand -base64 32
```

**Configuration:**
```bash
SESSION_SECRET="your-different-generated-secret-here"
SESSION_MAX_AGE=86400000  # 24 hours in milliseconds
```

---

## 5. Complete Configuration File

Create `/Users/alimazid/Claude/Penny/prototype/config/prototype.env` with all your values:

```bash
# Database
DATABASE_URL="postgresql://penny:password123@localhost:5432/penny_prototype"
REDIS_URL="redis://localhost:6379"

# OpenAI
OPENAI_API_KEY="sk-proj-your-actual-openai-key"
OPENAI_ORGANIZATION_ID=""

# Google Cloud
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_PROJECT_ID="your-project-id"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# Optional Google Services
GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account@your-project.iam.gserviceaccount.com"
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nyour-private-key\n-----END PRIVATE KEY-----"
GOOGLE_PUBSUB_TOPIC="projects/your-project-id/topics/gmail-notifications"
GOOGLE_PUBSUB_SUBSCRIPTION="projects/your-project-id/subscriptions/penny-prototype"

# Application
PORT=3000
NODE_ENV="development"
HOST="localhost"

# Security
JWT_SECRET="your-jwt-secret-here"
JWT_EXPIRES_IN="24h"
SESSION_SECRET="your-session-secret-here"
SESSION_MAX_AGE=86400000

# Webhooks (if using ngrok)
WEBHOOK_BASE_URL="https://your-ngrok-subdomain.ngrok.io"
WEBHOOK_SECRET="your-webhook-secret"

# Development
LOG_LEVEL="debug"
ENABLE_REQUEST_LOGGING=true
TEST_GMAIL_ADDRESS="your-test-email@gmail.com"
```

---

## 6. Verification Steps

### 6.1 Test OpenAI Connection
```bash
curl -H "Authorization: Bearer YOUR_OPENAI_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model": "gpt-3.5-turbo", "messages": [{"role": "user", "content": "Hello"}], "max_tokens": 5}' \
     https://api.openai.com/v1/chat/completions
```

### 6.2 Test Google OAuth
- Visit the Google Cloud Console
- Go to APIs & Services > Credentials
- Test the OAuth flow using the OAuth 2.0 Playground

### 6.3 Test Local Services
```bash
# Test PostgreSQL
psql "postgresql://penny:password123@localhost:5432/penny_prototype" -c "SELECT 1;"

# Test Redis
redis-cli -u redis://localhost:6379 ping
```

---

## 7. Common Issues and Solutions

### OpenAI Issues:
- **"Insufficient quota"**: Add billing information
- **"Invalid API key"**: Regenerate the key
- **"Model not available"**: Use "gpt-3.5-turbo" instead of "gpt-4"

### Google Cloud Issues:
- **OAuth consent screen in testing**: Add your email as a test user
- **Redirect URI mismatch**: Ensure exact match including http://localhost:3000/auth/google/callback
- **API not enabled**: Enable Gmail API in the console

### Local Service Issues:
- **PostgreSQL connection refused**: Run `brew services start postgresql`
- **Redis connection refused**: Run `brew services start redis`
- **Port already in use**: Change PORT in config or kill the process using the port

---

## 8. Security Notes

⚠️ **Important Security Reminders:**

1. **Never commit secrets to git**
   - The `prototype.env` file is in `.gitignore`
   - Double-check before committing any files

2. **Use test accounts only**
   - Don't use your primary Gmail account
   - Use a separate Google account for testing

3. **Rotate keys regularly**
   - Regenerate API keys if compromised
   - Use different secrets for production

4. **Limit API permissions**
   - Only grant necessary Gmail scopes
   - Set usage limits on OpenAI account

---

## 9. Getting Help

If you encounter issues:

1. **Check the logs**: Look in `prototype/logs/` for error details
2. **Verify configuration**: Ensure all required fields are filled
3. **Test individual services**: Use the verification steps above
4. **Check API quotas**: Ensure you haven't exceeded limits

---

## Next Steps

Once you have all the configuration values:

1. Copy the example file: `cp config/prototype.env.example config/prototype.env`
2. Fill in all your actual values
3. Run the setup script: `./scripts/setup.sh`
4. Start the prototype: `npm run dev`

The prototype will be available at http://localhost:3000