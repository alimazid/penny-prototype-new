import { createClient } from 'redis';
import { logger } from './logger';

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
let redisClient: ReturnType<typeof createClient> | null = null;

const initializeRedis = async (): Promise<ReturnType<typeof createClient>> => {
  try {
    if (redisClient && redisClient.isOpen) {
      return redisClient;
    }

    logger.info('🔄 Connecting to Redis...');
    
    redisClient = createClient(redisConfig);

    // Error handling
    redisClient.on('error', (error) => {
      logger.error('Redis connection error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('📡 Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis client ready');
    });

    redisClient.on('end', () => {
      logger.info('🔚 Redis connection ended');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis client reconnecting...');
    });

    // Connect to Redis
    await redisClient.connect();

    // Test connection
    await redisClient.ping();
    logger.info('✅ Redis connection established');

    return redisClient;
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
};

// Redis health check
const checkRedisHealth = async (): Promise<boolean> => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }
    
    await redisClient.ping();
    return true;
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

// Graceful disconnect
const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      logger.info('🔄 Redis disconnected');
    }
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
  }
};

// Redis operations helper
const RedisOperations = {
  // Basic operations
  async set(key: string, value: string, ttl?: number): Promise<void> {
    const client = await initializeRedis();
    if (ttl) {
      await client.setEx(key, ttl, value);
    } else {
      await client.set(key, value);
    }
  },

  async get(key: string): Promise<string | null> {
    const client = await initializeRedis();
    return await client.get(key);
  },

  async del(key: string): Promise<number> {
    const client = await initializeRedis();
    return await client.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const client = await initializeRedis();
    return (await client.exists(key)) === 1;
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    const client = await initializeRedis();
    return (await client.expire(key, seconds)) === 1;
  },

  async ttl(key: string): Promise<number> {
    const client = await initializeRedis();
    return await client.ttl(key);
  },

  // JSON operations
  async setJSON(key: string, value: any, ttl?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), ttl);
  },

  async getJSON<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    return value ? JSON.parse(value) : null;
  },

  // Hash operations
  async hSet(key: string, field: string, value: string): Promise<number> {
    const client = await initializeRedis();
    return await client.hSet(key, field, value);
  },

  async hGet(key: string, field: string): Promise<string | undefined> {
    const client = await initializeRedis();
    return await client.hGet(key, field);
  },

  async hGetAll(key: string): Promise<Record<string, string>> {
    const client = await initializeRedis();
    return await client.hGetAll(key);
  },

  async hDel(key: string, field: string): Promise<number> {
    const client = await initializeRedis();
    return await client.hDel(key, field);
  },

  // List operations
  async lPush(key: string, ...values: string[]): Promise<number> {
    const client = await initializeRedis();
    return await client.lPush(key, values);
  },

  async rPush(key: string, ...values: string[]): Promise<number> {
    const client = await initializeRedis();
    return await client.rPush(key, values);
  },

  async lPop(key: string): Promise<string | null> {
    const client = await initializeRedis();
    return await client.lPop(key);
  },

  async rPop(key: string): Promise<string | null> {
    const client = await initializeRedis();
    return await client.rPop(key);
  },

  async lLen(key: string): Promise<number> {
    const client = await initializeRedis();
    return await client.lLen(key);
  },

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const client = await initializeRedis();
    return await client.lRange(key, start, stop);
  },

  // Set operations
  async sAdd(key: string, ...members: string[]): Promise<number> {
    const client = await initializeRedis();
    return await client.sAdd(key, members);
  },

  async sRem(key: string, ...members: string[]): Promise<number> {
    const client = await initializeRedis();
    return await client.sRem(key, members);
  },

  async sMembers(key: string): Promise<string[]> {
    const client = await initializeRedis();
    return await client.sMembers(key);
  },

  async sIsMember(key: string, member: string): Promise<boolean> {
    const client = await initializeRedis();
    return await client.sIsMember(key, member);
  },

  // Increment/Decrement
  async incr(key: string): Promise<number> {
    const client = await initializeRedis();
    return await client.incr(key);
  },

  async incrBy(key: string, increment: number): Promise<number> {
    const client = await initializeRedis();
    return await client.incrBy(key, increment);
  },

  async decr(key: string): Promise<number> {
    const client = await initializeRedis();
    return await client.decr(key);
  },

  async decrBy(key: string, decrement: number): Promise<number> {
    const client = await initializeRedis();
    return await client.decrBy(key, decrement);
  },

  // Pattern operations
  async keys(pattern: string): Promise<string[]> {
    const client = await initializeRedis();
    return await client.keys(pattern);
  },

  async scan(cursor: number, pattern?: string, count?: number): Promise<{
    cursor: number;
    keys: string[];
  }> {
    const client = await initializeRedis();
    const options: any = {};
    if (pattern) options.MATCH = pattern;
    if (count) options.COUNT = count;
    
    const result = await client.scan(cursor, options);
    return {
      cursor: result.cursor,
      keys: result.keys,
    };
  },

  // Cache operations with automatic JSON serialization
  async cacheSet(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    await this.setJSON(`cache:${key}`, {
      data: value,
      timestamp: Date.now(),
    }, ttlSeconds);
  },

  async cacheGet<T>(key: string): Promise<T | null> {
    const cached = await this.getJSON<{
      data: T;
      timestamp: number;
    }>(`cache:${key}`);
    
    return cached ? cached.data : null;
  },

  async cacheInvalidate(pattern: string): Promise<number> {
    const keys = await this.keys(`cache:${pattern}`);
    if (keys.length === 0) return 0;
    
    const client = await initializeRedis();
    return await client.del(keys);
  },

  // Session operations
  async setSession(sessionId: string, data: any, ttlSeconds: number = 86400): Promise<void> {
    await this.setJSON(`session:${sessionId}`, data, ttlSeconds);
  },

  async getSession<T>(sessionId: string): Promise<T | null> {
    return await this.getJSON<T>(`session:${sessionId}`);
  },

  async deleteSession(sessionId: string): Promise<number> {
    return await this.del(`session:${sessionId}`);
  },

  // Rate limiting
  async checkRateLimit(
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
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

// BullMQ compatible Redis connection
export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: null, // Required for BullMQ
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxLoadingTimeout: 5000,
};

export {
  initializeRedis,
  checkRedisHealth,
  disconnectRedis,
  RedisOperations,
  redisClient,
};