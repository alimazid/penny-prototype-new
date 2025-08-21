# Penny Prototype

AI-powered financial email monitoring system that automatically identifies, processes, and organizes financial communications from Gmail accounts.

## 🚀 Features

- **Real-time Email Monitoring**: Automatic detection of new emails with 30-second polling
- **AI-Powered Classification**: OpenAI GPT-4 integration for intelligent financial email detection
- **Multi-language Support**: Detects financial emails in multiple languages (English, Spanish, etc.)
- **Financial Data Extraction**: Automatic extraction of amounts, merchants, dates, and transaction types
- **Live Dashboard**: Real-time UI with WebSocket updates showing processing status
- **Gmail Integration**: Secure OAuth 2.0 authentication with Gmail API
- **Background Processing**: Redis/BullMQ queue system for scalable email processing

## 🏗️ Architecture

- **Backend**: Node.js/TypeScript with Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Caching/Queue**: Redis with BullMQ
- **AI/ML**: OpenAI GPT-4 for classification and extraction
- **Frontend**: Alpine.js with real-time WebSocket updates
- **Styling**: Tailwind CSS
- **Real-time**: Socket.IO for live dashboard updates

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 14+
- Redis 6+
- Gmail API credentials
- OpenAI API key

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd prototype
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Start Redis server**
   ```bash
   redis-server
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

## 🔧 Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/penny_prototype"

# Redis
REDIS_URL="redis://localhost:6379"

# Gmail API
GMAIL_CLIENT_ID="your_gmail_client_id"
GMAIL_CLIENT_SECRET="your_gmail_client_secret"
GMAIL_REDIRECT_URI="http://localhost:3000/auth/google/callback"

# OpenAI
OPENAI_API_KEY="your_openai_api_key"

# Server
PORT=3000
NODE_ENV=development

# Session
SESSION_SECRET="your_session_secret"
```

## 🚦 Usage

1. **Access the dashboard**: Open http://localhost:3000
2. **Authenticate with Gmail**: Click "Connect Gmail Account"
3. **Start monitoring**: Select your Gmail account and click "Start Monitoring"
4. **View results**: Watch real-time email processing and AI classification results

## 📊 API Endpoints

### Authentication
- `GET /auth/google` - Initiate Gmail OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/status` - Check authentication status
- `POST /auth/logout` - Logout

### Email Monitoring
- `POST /api/monitoring/start` - Start monitoring
- `POST /api/monitoring/stop` - Stop monitoring
- `POST /api/monitoring/sync` - Manual sync
- `GET /api/monitoring/status` - Get monitoring status

### Email Management
- `GET /api/monitoring/emails/{accountId}` - Get emails for account
- `GET /api/monitoring/email/{emailId}` - Get single email
- `POST /api/monitoring/process-email/{emailId}` - Process single email
- `POST /api/monitoring/process-pending/{accountId}` - Process all pending

### System
- `GET /health` - Health check
- `GET /api/metrics` - System metrics
- `GET /api/queue/stats` - Queue statistics

## 🔄 WebSocket Events

The system provides real-time updates via WebSocket:

- `email_update` - Email processing status updates
- `email_processing` - Detailed processing events
- `monitoring_status` - Monitoring status changes

## 🧪 Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run test` - Run tests
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript checks

### Database Commands

- `npx prisma generate` - Generate Prisma client
- `npx prisma db push` - Push schema changes to database
- `npx prisma studio` - Open Prisma Studio
- `npx prisma migrate dev` - Create and apply migrations

## 📁 Project Structure

```
prototype/
├── src/
│   ├── routes/          # API route handlers
│   ├── services/        # Business logic services
│   ├── workers/         # Background job processors
│   ├── utils/           # Utility functions
│   └── server.ts        # Main server file
├── prisma/
│   └── schema.prisma    # Database schema
├── public/
│   └── index.html       # Frontend dashboard
├── docs/                # Technical documentation
├── config/              # Configuration files
└── README.md
```

## 🔒 Security

- OAuth 2.0 authentication with Gmail
- Environment-based configuration
- Input validation and sanitization
- Rate limiting on API endpoints
- Secure session management

## 📈 Performance

- Background job processing with Redis queues
- Database connection pooling
- Real-time updates without polling
- Efficient email deduplication
- Comprehensive error handling and recovery

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Ensure PostgreSQL is running
   - Check DATABASE_URL in .env file
   - Run `npx prisma db push` to sync schema

2. **Redis Connection Error**
   - Ensure Redis server is running
   - Check REDIS_URL in .env file

3. **Gmail API Errors**
   - Verify Gmail API credentials
   - Check OAuth redirect URI configuration
   - Ensure Gmail API is enabled in Google Cloud Console

4. **OpenAI API Errors**
   - Verify OpenAI API key
   - Check API quota and billing

## 📝 License

This project is licensed under the MIT License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For questions and support, please refer to the technical documentation in the `docs/` directory.