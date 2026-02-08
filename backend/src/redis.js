const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

let redisConnected = false;

redis.on('connect', () => {
  redisConnected = true;
  console.log('📦 Redis conectado');
});

redis.on('error', (err) => {
  redisConnected = false;
  console.error('❌ Redis erro:', err.message);
});

redis.on('close', () => {
  redisConnected = false;
});

// Conectar silenciosamente (não quebra se Redis não estiver disponível)
redis.connect().catch((err) => {
  console.warn('⚠️ Redis não disponível, continuando sem cache:', err.message);
});

// Cache helpers com fallback gracioso
const getCache = async (key) => {
  if (!redisConnected) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const setCache = async (key, data, ttlSeconds) => {
  if (!redisConnected) return;
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
  } catch {
    // silently fail
  }
};

const invalidateCache = async (pattern) => {
  if (!redisConnected) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // silently fail
  }
};

module.exports = { redis, redisConnected: () => redisConnected, getCache, setCache, invalidateCache };
