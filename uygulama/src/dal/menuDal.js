const { replicaPool } = require('../config/db');
const redis = require('../config/redis');

class MenuDal {
  static async getGununMenusu(yemekhaneId, tarih, ogunId) {
    const redisKey = `menu:${yemekhaneId}:${tarih}:${ogunId}`;
    
    // 1. Önce Redis Önbelleğine Bak
    const cachedData = await redis.get(redisKey);
    if (cachedData) {
      console.log(`[REDIS HIT] Key: ${redisKey}`);
      return JSON.parse(cachedData);
    }

    console.log(`[REDIS MISS] Veritabanından okunuyor. Key: ${redisKey}`);
    
    // 2. Redis'te yoksa Replikadan oku (View kullanılıyor)
    const query = `
      SELECT * FROM v_menu_detay 
      WHERE yemekhane_id = ? AND tarih = ? AND ogun_id = ?
    `;
    const [rows] = await replicaPool.query(query, [yemekhaneId, tarih, ogunId]);

    if (rows.length > 0) {
      // O günün sonuna kadar (veya 24 saat) Redis'e yaz
      await redis.set(redisKey, JSON.stringify(rows), 'EX', 86400);
    }

    return rows;
  }

  static async cacheTemizle(yemekhaneId, tarih, ogunId) {
    const redisKey = `menu:${yemekhaneId}:${tarih}:${ogunId}`;
    await redis.del(redisKey);
    console.log(`[REDIS PURGE] Key silindi: ${redisKey}`);
  }
}

module.exports = MenuDal;