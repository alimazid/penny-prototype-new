"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisClient = exports.RedisOperations = exports.disconnectRedis = exports.checkRedisHealth = exports.initializeRedis = exports.redisConnection = void 0;
const redis_1 = require("redis");
const logger_1 = require("./logger");
// Redis client configuration
const redisConfig = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    connectTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
    commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: null, // Required for BullMQ compatibility
    lazyConnect: true,
};
// Create Redis client
let redisClient = null;
exports.redisClient = redisClient;
const initializeRedis = async () => {
    try {
        if (redisClient && redisClient.isOpen) {
            return redisClient;
        }
        logger_1.logger.info('🔄 Connecting to Redis...');
        exports.redisClient = redisClient = (0, redis_1.createClient)(redisConfig);
        // Error handling
        redisClient.on('error', (error) => {
            logger_1.logger.error('Redis connection error:', error);
        });
        redisClient.on('connect', () => {
            logger_1.logger.info('📡 Redis client connected');
        });
        redisClient.on('ready', () => {
            logger_1.logger.info('✅ Redis client ready');
        });
        redisClient.on('end', () => {
            logger_1.logger.info('🔚 Redis connection ended');
        });
        redisClient.on('reconnecting', () => {
            logger_1.logger.info('🔄 Redis client reconnecting...');
        });
        // Connect to Redis
        await redisClient.connect();
        // Test connection
        await redisClient.ping();
        logger_1.logger.info('✅ Redis connection established');
        return redisClient;
    }
    catch (error) {
        logger_1.logger.error('❌ Failed to connect to Redis:', error);
        throw error;
    }
};
exports.initializeRedis = initializeRedis;
// Redis health check
const checkRedisHealth = async () => {
    try {
        if (!redisClient || !redisClient.isOpen) {
            return false;
        }
        await redisClient.ping();
        return true;
    }
    catch (error) {
        logger_1.logger.error('Redis health check failed:', error);
        return false;
    }
};
exports.checkRedisHealth = checkRedisHealth;
// Graceful disconnect
const disconnectRedis = async () => {
    try {
        if (redisClient && redisClient.isOpen) {
            await redisClient.quit();
            logger_1.logger.info('🔄 Redis disconnected');
        }
    }
    catch (error) {
        logger_1.logger.error('Error disconnecting from Redis:', error);
    }
};
exports.disconnectRedis = disconnectRedis;
// Redis operations helper
const RedisOperations = {
    // Basic operations
    async set(key, value, ttl) {
        const client = await initializeRedis();
        if (ttl) {
            await client.setEx(key, ttl, value);
        }
        else {
            await client.set(key, value);
        }
    },
    async get(key) {
        const client = await initializeRedis();
        return await client.get(key);
    },
    async del(key) {
        const client = await initializeRedis();
        return await client.del(key);
    },
    async exists(key) {
        const client = await initializeRedis();
        return (await client.exists(key)) === 1;
    },
    async expire(key, seconds) {
        const client = await initializeRedis();
        return (await client.expire(key, seconds)) === 1;
    },
    async ttl(key) {
        const client = await initializeRedis();
        return await client.ttl(key);
    },
    // JSON operations
    async setJSON(key, value, ttl) {
        await this.set(key, JSON.stringify(value), ttl);
    },
    async getJSON(key) {
        const value = await this.get(key);
        return value ? JSON.parse(value) : null;
    },
    // Hash operations
    async hSet(key, field, value) {
        const client = await initializeRedis();
        return await client.hSet(key, field, value);
    },
    async hGet(key, field) {
        const client = await initializeRedis();
        return await client.hGet(key, field);
    },
    async hGetAll(key) {
        const client = await initializeRedis();
        return await client.hGetAll(key);
    },
    async hDel(key, field) {
        const client = await initializeRedis();
        return await client.hDel(key, field);
    },
    // List operations
    async lPush(key, ...values) {
        const client = await initializeRedis();
        return await client.lPush(key, values);
    },
    async rPush(key, ...values) {
        const client = await initializeRedis();
        return await client.rPush(key, values);
    },
    async lPop(key) {
        const client = await initializeRedis();
        return await client.lPop(key);
    },
    async rPop(key) {
        const client = await initializeRedis();
        return await client.rPop(key);
    },
    async lLen(key) {
        const client = await initializeRedis();
        return await client.lLen(key);
    },
    async lRange(key, start, stop) {
        const client = await initializeRedis();
        return await client.lRange(key, start, stop);
    },
    // Set operations
    async sAdd(key, ...members) {
        const client = await initializeRedis();
        return await client.sAdd(key, members);
    },
    async sRem(key, ...members) {
        const client = await initializeRedis();
        return await client.sRem(key, members);
    },
    async sMembers(key) {
        const client = await initializeRedis();
        return await client.sMembers(key);
    },
    async sIsMember(key, member) {
        const client = await initializeRedis();
        return await client.sIsMember(key, member);
    },
    // Increment/Decrement
    async incr(key) {
        const client = await initializeRedis();
        return await client.incr(key);
    },
    async incrBy(key, increment) {
        const client = await initializeRedis();
        return await client.incrBy(key, increment);
    },
    async decr(key) {
        const client = await initializeRedis();
        return await client.decr(key);
    },
    async decrBy(key, decrement) {
        const client = await initializeRedis();
        return await client.decrBy(key, decrement);
    },
    // Pattern operations
    async keys(pattern) {
        const client = await initializeRedis();
        return await client.keys(pattern);
    },
    async scan(cursor, pattern, count) {
        const client = await initializeRedis();
        const options = {};
        if (pattern)
            options.MATCH = pattern;
        if (count)
            options.COUNT = count;
        const result = await client.scan(cursor, options);
        return {
            cursor: result.cursor,
            keys: result.keys,
        };
    },
    // Cache operations with automatic JSON serialization
    async cacheSet(key, value, ttlSeconds = 3600) {
        await this.setJSON(`cache:${key}`, {
            data: value,
            timestamp: Date.now(),
        }, ttlSeconds);
    },
    async cacheGet(key) {
        const cached = await this.getJSON(`cache:${key}`);
        return cached ? cached.data : null;
    },
    async cacheInvalidate(pattern) {
        const keys = await this.keys(`cache:${pattern}`);
        if (keys.length === 0)
            return 0;
        const client = await initializeRedis();
        return await client.del(keys);
    },
    // Session operations
    async setSession(sessionId, data, ttlSeconds = 86400) {
        await this.setJSON(`session:${sessionId}`, data, ttlSeconds);
    },
    async getSession(sessionId) {
        return await this.getJSON(`session:${sessionId}`);
    },
    async deleteSession(sessionId) {
        return await this.del(`session:${sessionId}`);
    },
    // Rate limiting
    async checkRateLimit(identifier, limit, windowSeconds) {
        const key = `rate_limit:${identifier}`;
        const client = await initializeRedis();
        const current = await client.incr(key);
        if (current === 1) {
            await client.expire(key, windowSeconds);
        }
        const ttl = await client.ttl(key);
        const resetTime = Date.now() + (ttl * 1000);
        return {
            allowed: current <= limit,
            remaining: Math.max(0, limit - current),
            resetTime,
        };
    },
};
exports.RedisOperations = RedisOperations;
// BullMQ compatible Redis connection
exports.redisConnection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    maxRetriesPerRequest: null, // Required for BullMQ
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxLoadingTimeout: 5000,
};
//# sourceMappingURL=redis.js.map