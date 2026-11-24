'use strict';
const { primaryPool } = require('../config/db');
const { yazmaIsaretle, okumaHavuzu } = require('./okumaHavuzu');

class RezervasyonDal {
  // Yazma -> kaynak. Para hareketi stored procedure ile yapılır (SQL yeniden yazılmaz).
  // Yordam kendi transaction'ını yönetir; autocommit açıkken CALL edilir.
  static async rezervasyonYap(kullaniciId, menuId, yarimPorsiyon) {
    const [sonuc] = await primaryPool.query('CALL sp_rezervasyon_yap(?, ?, ?)', [
      kullaniciId,
      menuId,
      yarimPorsiyon ? 1 : 0
    ]);
    await yazmaIsaretle(kullaniciId);
    return sonuc[0][0]; // { rezervasyon_id, ucret, bakiye }
  }

  static async rezervasyonIptal(kullaniciId, rezervasyonId) {
    const [sonuc] = await primaryPool.query('CALL sp_rezervasyon_iptal(?, ?)', [kullaniciId, rezervasyonId]);
    await yazmaIsaretle(kullaniciId);
    return sonuc[0][0]; // { rezervasyon_id, iade, bakiye }
  }

  // Listeleme -> replika (yeni yazma yapıldıysa kaynak)
  static async kullaniciRezervasyonlari(kullaniciId) {
    const havuz = await okumaHavuzu(kullaniciId);
    const [rows] = await havuz.query(
      `SELECT r.id, r.durum, r.ucret, r.yarim_porsiyon, r.olusturma, r.kullanma_zamani, r.iptal_zamani,
              m.id AS menu_id, m.tarih, o.id AS ogun_id, o.ad AS ogun, yh.ad AS yemekhane,
              TIMESTAMP(m.tarih, o.son_saat) AS rezervasyon_son,
              (r.durum = 'aktif' AND TIMESTAMP(m.tarih, o.son_saat) > NOW()) AS iptal_edilebilir
         FROM rezervasyonlar r
         JOIN menuler m       ON m.id  = r.menu_id
         JOIN ogunler o       ON o.id  = m.ogun_id
         JOIN yemekhaneler yh ON yh.id = m.yemekhane_id
        WHERE r.kullanici_id = ?
        ORDER BY m.tarih DESC, o.sira DESC
        LIMIT 100`,
      [kullaniciId]
    );
    return rows;
  }
}

module.exports = RezervasyonDal;
