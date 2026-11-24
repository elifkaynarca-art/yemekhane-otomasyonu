'use strict';
const { primaryPool } = require('../config/db');
const { yazmaIsaretle, okumaHavuzu } = require('./okumaHavuzu');
const { IsKuraliHatasi } = require('../utils/hata');

class DegerlendirmeDal {
  // Kullanıcının kullandığı (turnikeden geçtiği) menüler ve varsa verdiği puan
  static async kullanilanMenuler(kullaniciId) {
    const havuz = await okumaHavuzu(kullaniciId);
    const [rows] = await havuz.query(
      `SELECT m.id AS menu_id, m.tarih, o.ad AS ogun, yh.ad AS yemekhane,
              d.puan, d.yorum
         FROM rezervasyonlar r
         JOIN menuler m       ON m.id  = r.menu_id
         JOIN ogunler o       ON o.id  = m.ogun_id
         JOIN yemekhaneler yh ON yh.id = m.yemekhane_id
         LEFT JOIN degerlendirmeler d ON d.menu_id = m.id AND d.kullanici_id = r.kullanici_id
        WHERE r.kullanici_id = ? AND r.durum = 'kullanildi'
        ORDER BY m.tarih DESC, o.sira DESC
        LIMIT 100`,
      [kullaniciId]
    );
    return rows;
  }

  // "Yalnızca kullanılmış menü değerlendirilir" kuralı: kayıt, ancak kullanılmış bir
  // rezervasyon varsa eklenir (tek SQL; kontrol ile ekleme arasında yarış olmaz).
  static async ekle(kullaniciId, menuId, puan, yorum) {
    try {
      const [sonuc] = await primaryPool.query(
        `INSERT INTO degerlendirmeler (kullanici_id, menu_id, puan, yorum)
         SELECT r.kullanici_id, r.menu_id, ?, ?
           FROM rezervasyonlar r
          WHERE r.kullanici_id = ? AND r.menu_id = ? AND r.durum = 'kullanildi'`,
        [puan, yorum, kullaniciId, menuId]
      );
      if (sonuc.affectedRows === 0) {
        throw new IsKuraliHatasi('Yalnızca kullandığınız (turnikeden geçtiğiniz) menüyü değerlendirebilirsiniz.');
      }
    } catch (err) {
      if (err.errno === 1062) throw new IsKuraliHatasi('Bu menüyü zaten değerlendirdiniz.');
      throw err;
    }
    await yazmaIsaretle(kullaniciId);
  }
}

module.exports = DegerlendirmeDal;
