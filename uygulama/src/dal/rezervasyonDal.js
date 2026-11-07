const { primaryPool, replicaPool } = require('../config/db');

class RezervasyonDal {
  // Yazma işlemi -> primary (Procedure çağrısı)
  static async rezervasyonYap(kullaniciId, menuId, yarimPorsiyon = false) {
    try {
      // Aşama 4 ile porsiyon seçimi eklendi (0: Tam, 1: Yarım)
      const porsiyon = yarimPorsiyon ? 1 : 0;
      const [rows] = await primaryPool.query(
        'CALL sp_rezervasyon_yap(?, ?, ?)', 
        [kullaniciId, menuId, porsiyon]
      );
      return rows[0][0]; // { rezervasyon_id, ucret, bakiye }
    } catch (error) {
      throw error; // Hata 45000 mesajını üst katmana fırlat
    }
  }

  static async rezervasyonIptal(kullaniciId, rezervasyonId) {
    try {
      const [rows] = await primaryPool.query(
        'CALL sp_rezervasyon_iptal(?, ?)', 
        [kullaniciId, rezervasyonId]
      );
      return rows[0][0];
    } catch (error) {
      throw error;
    }
  }

  // Okuma işlemi -> replica
  static async kullaniciRezervasyonlari(kullaniciId) {
    const query = `
      SELECT r.id, r.durum, r.olusturma_tarihi, r.ucret, r.yarim_porsiyon,
             m.tarih, o.ad AS ogun_adi, yh.ad AS yemekhane_adi
      FROM rezervasyonlar r
      JOIN menuler m ON r.menu_id = m.id
      JOIN ogunler o ON m.ogun_id = o.id
      JOIN yemekhaneler yh ON m.yemekhane_id = yh.id
      WHERE r.kullanici_id = ?
      ORDER BY m.tarih DESC, o.id ASC
    `;
    const [rows] = await replicaPool.query(query, [kullaniciId]);
    return rows;
  }
}

module.exports = RezervasyonDal;