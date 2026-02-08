const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { redis, redisConnected } = require('../redis');

const createLimiter = (windowMs, max, prefix, message) => {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || 'Muitas requisições. Tente novamente mais tarde.' },
  };

  // Usar Redis store se disponível, senão memory store
  if (redisConnected()) {
    options.store = new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${prefix}:`,
    });
  }

  return rateLimit(options);
};

// Global: 500 requisições por 15 minutos (PDV faz muitas chamadas simultâneas)
const globalLimiter = createLimiter(
  15 * 60 * 1000,
  500,
  'global',
  'Limite de requisições excedido. Tente novamente em alguns minutos.'
);

// Auth: 10 tentativas por 15 minutos (proteção brute force)
const authLimiter = createLimiter(
  15 * 60 * 1000,
  10,
  'auth',
  'Muitas tentativas de login. Tente novamente em 15 minutos.'
);

// Write: 60 operações de escrita por minuto
const writeLimiter = createLimiter(
  60 * 1000,
  60,
  'write',
  'Muitas operações de escrita. Aguarde um momento.'
);

module.exports = { globalLimiter, authLimiter, writeLimiter };
