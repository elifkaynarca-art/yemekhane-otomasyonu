'use strict';
const { replicaPool } = require('../config/db');
const redis = require('../config/redis');

const OTURUM_SANIYE = 30 * 60;
const oturumAnahtari = (token) => `oturum:${token}`;

class AuthDal {
  // Giriş sorgusu bir okumadır -> replika
  static async kullaniciGetirEposta(eposta) {
    const [rows] = await replicaPool.query(
      `SELECT id, ad, soyad, eposta, sifre_hash, rol, aktif
         FROM kullanicilar WHERE eposta = ?`,
      [eposta]
    );
    return rows[0] || null;
  }

  // Oturum: oturum:{token}, 30 dakika
  static async oturumOlustur(token, veri) {
    await redis.set(oturumAnahtari(token), JSON.stringify(veri), 'EX', OTURUM_SANIYE);
  }

  // Okur ve süreyi 30 dakikaya yeniler (kayan oturum)
  static async oturumGetirVeYenile(token) {
    const ham = await redis.get(oturumAnahtari(token));
    if (!ham) return null;
    await redis.expire(oturumAnahtari(token), OTURUM_SANIYE);
    return JSON.parse(ham);
  }

  static async oturumSil(token) {
    await redis.del(oturumAnahtari(token));
  }
}

module.exports = AuthDal;
