'use strict';
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: Number(process.env.REDIS_PORT) || 6379,
  retryStrategy(deneme) {
    return Math.min(deneme * 100, 2000);
  }
});

redis.on('connect', () => console.log('[REDIS] Bağlantı başarılı.'));
redis.on('error', (err) => console.error('[REDIS] Hata:', err.message));

module.exports = redis;
