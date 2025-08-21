# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Penny Prototype** is an AI-powered financial email monitoring system that automatically identifies, processes, and organizes financial communications from Gmail accounts. The system demonstrates real-time email processing with Gmail API integration, OpenAI classification, and WebSocket-based dashboard updates.

## Development Commands

### Essential Commands
```bash
# Development server with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Run tests
npm test
npm run test:integration
npm run test:pipeline

# Database operations
npm run db:migrate
npm run db:generate
npm run db:studio

# Code quality
npm run lint
npm run type-check
```

### Database Commands
```bash
# Generate Prisma client after schema changes
npx prisma generate

# Apply database migrations
npx prisma migrate dev

# View/edit database with GUI
npx prisma studio

# Push schema changes without migration
npx prisma db push
```

### Testing Commands
```bash
# Run all tests
npm test

# Integration tests with database
npm run test:integration

# End-to-end pipeline test
npm run test:pipeline
```

## Architecture Overview

### Core Service Pattern
The system follows a service-oriented architecture with clear separation of concerns:

- **Express Server** (`src/server.ts`): Main HTTP server with middleware, routes, and graceful shutdown
- **Service Layer** (`src/services/`): Business logic encapsulated in singleton services
- **Workers** (`src/workers/`): Background job processors using BullMQ
- **Database Layer** (`src/utils/database.ts`): Prisma ORM with centralized operations
- **Queue System** (`src/services/queueService.ts`): Redis-based job queuing with BullMQ

### Email Processing Pipeline
```
Gmail API → Email Monitoring → Queue → AI Processing → Database → WebSocket Updates
```

1. **EmailMonitoringService**: Polls Gmail every 30 seconds for new emails
2. **QueueService**: Manages background job processing with Redis/BullMQ
3. **EmailProcessor**: Worker that handles AI classification and data extraction
4. **OpenAIService**: Handles GPT-4 integration for email analysis
5. **WebSocketService**: Real-time updates to dashboard clients

### Key Services

#### EmailMonitoringService (`src/services/emailMonitoringService.ts`)
- Manages active monitoring sessions per Gmail account
- Polls Gmail API using history API for efficiency
- Creates ProcessedEmail records and queues them for AI processing
- Singleton pattern with session state management

#### QueueService (`src/services/queueService.ts`)
- BullMQ integration for background job processing
- Handles email processing jobs (sync, classify, extract)
- Configurable concurrency and retry logic
- Job progress tracking and failure handling

#### EmailProcessor (`src/workers/emailProcessor.ts`)
- BullMQ worker that processes queued emails
- Three job types: sync, classify, extract
- AI classification using OpenAI GPT-4
- Financial data extraction for classified emails
- Real-time WebSocket updates during processing

#### WebSocketService (`src/services/websocketService.ts`)
- Socket.IO integration for real-time dashboard updates
- Broadcasts email processing events to connected clients
- Event types: received, classified, extracted, completed, failed

### Database Schema Architecture

#### Core Entities (Prisma schema in `prisma/schema.prisma`)
- **Users**: Authentication and preferences
- **EmailAccounts**: Gmail account connections with OAuth tokens
- **ProcessedEmails**: Email metadata and processing status
- **ExtractedData**: Financial data extracted from emails
- **AuditLogs**: Compliance and change tracking

#### Processing Status Flow
```
PENDING → PROCESSING → CLASSIFIED → EXTRACTED → COMPLETED
                    ↘ FAILED ↗ MANUAL_REVIEW
```

### TypeScript Path Mapping
The project uses TypeScript path mapping configured in `tsconfig.json`:
```typescript
// Import examples
import { logger } from '@/utils/logger';
import { DatabaseOperations } from '@/utils/database';
import { QueueService } from '@/services/queueService';
```

### Environment Configuration
- Environment variables loaded from `config/prototype.env`
- Separate configurations for development/production
- Required: DATABASE_URL, REDIS_URL, OPENAI_API_KEY, Gmail OAuth credentials

## Important Implementation Details

### Gmail API Integration
- Uses OAuth 2.0 with refresh token handling
- Efficient polling via Gmail History API when available
- Fallback to recent email listing when history unavailable
- Test token support for development (`test-access-token-*`)

### AI Processing Pipeline
- OpenAI GPT-4 for email classification (financial vs non-financial)
- Multi-language support with confidence scoring
- Financial data extraction for classified emails
- Category mapping to enum values in database

### Real-time Updates
- WebSocket events for all processing stages
- Progress tracking for long-running operations
- Error broadcasting for failed operations
- Dashboard updates without page refresh

### Error Handling and Resilience
- Graceful shutdown handling for all services
- Database connection pooling and retry logic
- Queue job retry with exponential backoff
- Comprehensive logging with Winston

### Performance Considerations
- Connection pooling for database operations
- Redis for session management and caching
- Background processing to avoid blocking HTTP requests
- Configurable queue concurrency
- Email deduplication using content hashing

## Development Workflow

### Adding New Features
1. **Service Layer**: Implement business logic in appropriate service
2. **Database**: Update Prisma schema if data model changes needed
3. **Queue Jobs**: Add new job types to EmailProcessor if background processing needed
4. **API Routes**: Add HTTP endpoints in appropriate route file
5. **WebSocket Events**: Add real-time updates for user feedback
6. **Tests**: Write unit and integration tests

### Common Patterns
- **Singleton Services**: Most services use singleton pattern for state management
- **Error Boundaries**: Comprehensive try-catch with logging and WebSocket error broadcasting
- **Progress Tracking**: Update job progress for long-running operations
- **Status Updates**: Broadcast processing status changes via WebSocket

### Database Operations
- Use `DatabaseOperations` utility for common database patterns
- Handle transactions for multi-step operations
- Always validate foreign key relationships
- Use Prisma's type safety features

## Testing Strategy

### Test Types
- **Unit Tests**: Individual service method testing
- **Integration Tests**: Database and external API integration
- **Pipeline Tests**: End-to-end email processing workflow

### Running Tests
```bash
# Quick unit tests
npm test

# Integration tests (requires database)
npm run test:integration

# Full pipeline test (requires all services)
npm run test:pipeline
```

## Production Considerations

### Required Environment Variables
```bash
DATABASE_URL="postgresql://..."
REDIS_URL="redis://..."
OPENAI_API_KEY="sk-..."
GMAIL_CLIENT_ID="..."
GMAIL_CLIENT_SECRET="..."
SESSION_SECRET="..."
```

### Health Checks
- `/health` endpoint provides service status
- Checks database, Redis, and queue connectivity
- Returns 503 for degraded services

### Monitoring
- Winston logging with structured data
- Performance monitoring middleware
- Queue job status tracking
- WebSocket connection monitoring

### Security
- OAuth 2.0 for Gmail authentication
- Environment-based secrets management
- Input validation with Zod schemas
- CORS and security headers configured
- do not touch the .env files. They are working corretly locally and should not be changed
- make sure the solution compiles and runes locally without errors before pushing anything