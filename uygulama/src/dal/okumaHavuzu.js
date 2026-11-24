'use strict';
// Okuma/yazma ayrımı: listeleme replikadan yapılır. Ancak replikasyon eşzamansızdır;
// kullanıcı yazma yaptıktan hemen sonra eski veri görmesin diye, yazan kullanıcının
// sonraki birkaç saniyelik okumaları kaynaktan yapılır ("kendi yazdığını oku").
const { primaryPool, replicaPool } = require('../config/db');
const redis = require('../config/redis');

const PENCERE_SANIYE = 10;
const anahtar = (kullaniciId) => `yazma:${kullaniciId}`;

async function yazmaIsaretle(kullaniciId) {
  try {
    await redis.set(anahtar(kullaniciId), '1', 'EX', PENCERE_SANIYE);
  } catch (err) {
    console.error('[REDIS] yazma işareti konamadı:', err.message);
  }
}

async function okumaHavuzu(kullaniciId) {
  try {
    if (kullaniciId && (await redis.exists(anahtar(kullaniciId)))) return primaryPool;
  } catch (err) {
    // Redis'e ulaşılamazsa güvenli taraf: kaynaktan oku
    return primaryPool;
  }
  return replicaPool;
}

module.exports = { yazmaIsaretle, okumaHavuzu };
