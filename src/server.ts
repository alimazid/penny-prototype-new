import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';

// Import routes
import authRoutes from './routes/auth';
import emailRoutes from './routes/emails';
import webhookRoutes from './routes/webhooks';
import apiRoutes from './routes/api';
import monitoringRoutes from './routes/monitoring';

// Import services
import { logger } from './utils/logger';
import { initializeDatabase } from './utils/database';
import { initializeRedis } from './utils/redis';
import { WebSocketService, setWebSocketServiceInstance } from './services/websocketService';
import { QueueService } from './services/queueService';
import { PerformanceMonitor } from './utils/performance';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../config/prototype.env') });

const app: Application = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Create HTTP server for Socket.IO
const server = createServer(app);

// Configure CORS
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: process.env.CORS_CREDENTIALS === 'true',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

// ===========================================
// MIDDLEWARE SETUP
// ===========================================

app.use(helmet({
  contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
    });
    next();
  });
}

// Performance monitoring middleware
app.use(PerformanceMonitor.middleware);

// ===========================================
// HEALTH CHECK ENDPOINT
// ===========================================

app.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0',
      environment: NODE_ENV,
      services: {
        database: 'unknown',
        redis: 'unknown',
        queue: 'unknown'
      }
    };

    // Check database connection
    try {
      await initializeDatabase();
      health.services.database = 'connected';
    } catch (error) {
      health.services.database = 'error';
      logger.error('Database health check failed:', error);
    }

    // Check Redis connection
    try {
      const redis = await initializeRedis();
      await redis.ping();
      health.services.redis = 'connected';
    } catch (error) {
      health.services.redis = 'error';
      logger.error('Redis health check failed:', error);
    }

    // Check queue service
    try {
      const queueService = QueueService.getInstance();
      if (queueService.isReady()) {
        health.services.queue = 'operational';
      } else {
        health.services.queue = 'initializing';
      }
    } catch (error) {
      health.services.queue = 'error';
      logger.error('Queue health check failed:', error);
    }

    const hasErrors = Object.values(health.services).some(status => status === 'error');
    res.status(hasErrors ? 503 : 200).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Internal server error'
    });
  }
});

// ===========================================
// ROUTES
// ===========================================

app.use('/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api', apiRoutes);
app.use('/webhooks', webhookRoutes);

// Serve static files for dashboard
app.use('/dashboard', express.static(path.join(__dirname, '../public')));

// Dashboard route
app.get('/dashboard/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// ===========================================
// ERROR HANDLING
// ===========================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query
  });

  res.status(error.status || 500).json({
    error: NODE_ENV === 'production' ? 'Internal Server Error' : error.message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});

// ===========================================
// GRACEFUL SHUTDOWN
// ===========================================

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close database connections
    try {
      const { prisma } = await import('./utils/database');
      await prisma.$disconnect();
      logger.info('Database disconnected');
    } catch (error) {
      logger.error('Error disconnecting database:', error);
    }

    // Close Redis connections
    try {
      const redis = await initializeRedis();
      await redis.quit();
      logger.info('Redis disconnected');
    } catch (error) {
      logger.error('Error disconnecting Redis:', error);
    }

    // Close queue connections
    try {
      const queueService = QueueService.getInstance();
      await queueService.close();
      logger.info('Queue service closed');
    } catch (error) {
      logger.error('Error closing queue service:', error);
    }

    // Close email processor
    try {
      const { emailProcessor } = await import('./workers/emailProcessor');
      await emailProcessor.close();
      logger.info('Email processor closed');
    } catch (error) {
      logger.error('Error closing email processor:', error);
    }

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ===========================================
// SERVER STARTUP
// ===========================================

async function startServer() {
  try {
    logger.info('🚀 Starting Penny Prototype Server...');

    // Initialize database
    logger.info('📊 Initializing database...');
    await initializeDatabase();
    logger.info('✅ Database connected');

    // Initialize Redis
    logger.info('🔄 Initializing Redis...');
    await initializeRedis();
    logger.info('✅ Redis connected');

    // Initialize Socket.IO
    logger.info('🔌 Initializing WebSocket service...');
    const io = new SocketIOServer(server, {
      cors: corsOptions,
      transports: ['websocket', 'polling']
    });
    
    const websocketService = new WebSocketService(io);
    websocketService.initialize();
    setWebSocketServiceInstance(websocketService);
    logger.info('✅ WebSocket service initialized');

    // Initialize Queue Service
    logger.info('📤 Initializing queue service...');
    const queueService = QueueService.getInstance();
    await queueService.initialize();
    logger.info('✅ Queue service initialized');

    // Initialize Email Processor
    logger.info('⚙️ Initializing email processor...');
    const { emailProcessor } = await import('./workers/emailProcessor');
    logger.info('✅ Email processor initialized');

    // Start HTTP server
    server.listen(PORT, () => {
      const serverUrl = process.env.NODE_ENV === 'production' 
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app'}.railway.app`
        : `http://localhost:${PORT}`;
      
      logger.info(`🎉 Server running on ${serverUrl}`);
      logger.info(`📊 Dashboard available at ${serverUrl}/dashboard`);
      logger.info(`🔍 Health check: ${serverUrl}/health`);
      logger.info(`📚 Environment: ${NODE_ENV}`);

      if (NODE_ENV === 'development') {
        logger.info('🔧 Development mode - detailed logging enabled');
        logger.info('🌐 Setup ngrok for webhooks: ngrok http ' + PORT);
      } else {
        logger.info('🚀 Production mode - webhooks ready for Railway public URLs');
      }
    });

  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export { app, server };