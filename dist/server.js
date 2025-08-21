"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const emails_1 = __importDefault(require("./routes/emails"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const api_1 = __importDefault(require("./routes/api"));
const monitoring_1 = __importDefault(require("./routes/monitoring"));
// Import services
const logger_1 = require("./utils/logger");
const database_1 = require("./utils/database");
const redis_1 = require("./utils/redis");
const websocketService_1 = require("./services/websocketService");
const queueService_1 = require("./services/queueService");
const performance_1 = require("./utils/performance");
// Load environment variables
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../config/prototype.env') });
const app = (0, express_1.default)();
exports.app = app;
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
// Create HTTP server for Socket.IO
const server = (0, http_1.createServer)(app);
exports.server = server;
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
app.use((0, helmet_1.default)({
    contentSecurityPolicy: NODE_ENV === 'production' ? undefined : false,
}));
app.use((0, cors_1.default)(corsOptions));
app.use((0, compression_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Request logging middleware
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger_1.logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
        });
        next();
    });
}
// Performance monitoring middleware
app.use(performance_1.PerformanceMonitor.middleware);
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
            await (0, database_1.initializeDatabase)();
            health.services.database = 'connected';
        }
        catch (error) {
            health.services.database = 'error';
            logger_1.logger.error('Database health check failed:', error);
        }
        // Check Redis connection
        try {
            const redis = await (0, redis_1.initializeRedis)();
            await redis.ping();
            health.services.redis = 'connected';
        }
        catch (error) {
            health.services.redis = 'error';
            logger_1.logger.error('Redis health check failed:', error);
        }
        // Check queue service
        try {
            const queueService = queueService_1.QueueService.getInstance();
            if (queueService.isReady()) {
                health.services.queue = 'operational';
            }
            else {
                health.services.queue = 'initializing';
            }
        }
        catch (error) {
            health.services.queue = 'error';
            logger_1.logger.error('Queue health check failed:', error);
        }
        const hasErrors = Object.values(health.services).some(status => status === 'error');
        res.status(hasErrors ? 503 : 200).json(health);
    }
    catch (error) {
        logger_1.logger.error('Health check failed:', error);
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
app.use('/auth', auth_1.default);
app.use('/api/emails', emails_1.default);
app.use('/api/monitoring', monitoring_1.default);
app.use('/api', api_1.default);
app.use('/webhooks', webhooks_1.default);
// Serve static files for dashboard
app.use('/dashboard', express_1.default.static(path_1.default.join(__dirname, '../public')));
// Dashboard route
app.get('/dashboard/*', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
});
// Dashboard root route
app.get('/dashboard', (req, res) => {
    res.sendFile(path_1.default.join(__dirname, '../public/index.html'));
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
app.use((error, req, res, next) => {
    logger_1.logger.error('Unhandled error:', {
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
const gracefulShutdown = async (signal) => {
    logger_1.logger.info(`Received ${signal}. Starting graceful shutdown...`);
    try {
        // Stop accepting new connections
        server.close(() => {
            logger_1.logger.info('HTTP server closed');
        });
        // Close database connections
        try {
            const { prisma } = await Promise.resolve().then(() => __importStar(require('./utils/database')));
            await prisma.$disconnect();
            logger_1.logger.info('Database disconnected');
        }
        catch (error) {
            logger_1.logger.error('Error disconnecting database:', error);
        }
        // Close Redis connections
        try {
            const redis = await (0, redis_1.initializeRedis)();
            await redis.quit();
            logger_1.logger.info('Redis disconnected');
        }
        catch (error) {
            logger_1.logger.error('Error disconnecting Redis:', error);
        }
        // Close queue connections
        try {
            const queueService = queueService_1.QueueService.getInstance();
            await queueService.close();
            logger_1.logger.info('Queue service closed');
        }
        catch (error) {
            logger_1.logger.error('Error closing queue service:', error);
        }
        // Close email processor
        try {
            const { emailProcessor } = await Promise.resolve().then(() => __importStar(require('./workers/emailProcessor')));
            await emailProcessor.close();
            logger_1.logger.info('Email processor closed');
        }
        catch (error) {
            logger_1.logger.error('Error closing email processor:', error);
        }
        logger_1.logger.info('Graceful shutdown completed');
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};
// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
    logger_1.logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
});
// ===========================================
// SERVER STARTUP
// ===========================================
async function startServer() {
    try {
        logger_1.logger.info('🚀 Starting Penny Prototype Server...');
        // Initialize database
        logger_1.logger.info('📊 Initializing database...');
        await (0, database_1.initializeDatabase)();
        logger_1.logger.info('✅ Database connected');
        // Initialize Redis
        logger_1.logger.info('🔄 Initializing Redis...');
        await (0, redis_1.initializeRedis)();
        logger_1.logger.info('✅ Redis connected');
        // Initialize Socket.IO
        logger_1.logger.info('🔌 Initializing WebSocket service...');
        const io = new socket_io_1.Server(server, {
            cors: corsOptions,
            transports: ['websocket', 'polling']
        });
        const websocketService = new websocketService_1.WebSocketService(io);
        websocketService.initialize();
        (0, websocketService_1.setWebSocketServiceInstance)(websocketService);
        logger_1.logger.info('✅ WebSocket service initialized');
        // Initialize Queue Service
        logger_1.logger.info('📤 Initializing queue service...');
        const queueService = queueService_1.QueueService.getInstance();
        await queueService.initialize();
        logger_1.logger.info('✅ Queue service initialized');
        // Initialize Email Processor
        logger_1.logger.info('⚙️ Initializing email processor...');
        const { emailProcessor } = await Promise.resolve().then(() => __importStar(require('./workers/emailProcessor')));
        logger_1.logger.info('✅ Email processor initialized');
        // Start HTTP server
        server.listen(PORT, () => {
            const serverUrl = process.env.NODE_ENV === 'production'
                ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN || 'your-app'}.railway.app`
                : `http://localhost:${PORT}`;
            logger_1.logger.info(`🎉 Server running on ${serverUrl}`);
            logger_1.logger.info(`📊 Dashboard available at ${serverUrl}/dashboard`);
            logger_1.logger.info(`🔍 Health check: ${serverUrl}/health`);
            logger_1.logger.info(`📚 Environment: ${NODE_ENV}`);
            if (NODE_ENV === 'development') {
                logger_1.logger.info('🔧 Development mode - detailed logging enabled');
                logger_1.logger.info('🌐 Setup ngrok for webhooks: ngrok http ' + PORT);
            }
            else {
                logger_1.logger.info('🚀 Production mode - webhooks ready for Railway public URLs');
            }
        });
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
// Start the server
startServer().catch((error) => {
    logger_1.logger.error('Failed to start server:', error);
    process.exit(1);
});
//# sourceMappingURL=server.js.map