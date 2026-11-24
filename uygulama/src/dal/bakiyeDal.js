'use strict';
const { primaryPool } = require('../config/db');
const { yazmaIsaretle, okumaHavuzu } = require('./okumaHavuzu');

class BakiyeDal {
  // Yazmanın hemen ardından gösterilen bakiye kaynaktan okunur (replikasyon gecikmesi)
  static async getBakiyeKaynaktan(kullaniciId) {
    const [rows] = await primaryPool.query('SELECT bakiye FROM kullanicilar WHERE id = ?', [kullaniciId]);
    return rows.length ? rows[0].bakiye : null;
  }

  static async bakiyeYukle(kullaniciId, tutar) {
    const [sonuc] = await primaryPool.query('CALL sp_bakiye_yukle(?, ?)', [kullaniciId, tutar]);
    await yazmaIsaretle(kullaniciId);
    return sonuc[0][0]; // { hareket_id, bakiye }
  }

  // Bakiye ve hareket geçmişi: listeleme -> replika (yeni yazma yapıldıysa kaynak)
  static async bakiyeVeHareketler(kullaniciId) {
    const havuz = await okumaHavuzu(kullaniciId);
    const [kisi] = await havuz.query('SELECT bakiye FROM kullanicilar WHERE id = ?', [kullaniciId]);
    const [hareketler] = await havuz.query(
      `SELECT id, tur, tutar, rezervasyon_id, aciklama, olusturma
         FROM bakiye_hareketleri
        WHERE kullanici_id = ?
        ORDER BY olusturma DESC, id DESC
        LIMIT 50`,
      [kullaniciId]
    );
    return { bakiye: kisi.length ? kisi[0].bakiye : 0, hareketler };
  }
}

module.exports = BakiyeDal;
