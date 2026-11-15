const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379,
  retryStrategy(times) {
    return Math.min(times * 50, 2000);
  }
});

redis.on('connect', () => console.log('Redis bağlantısı başarılı.'));
redis.on('error', (err) => console.error('Redis Hatası:', err));

module.exports = redis;