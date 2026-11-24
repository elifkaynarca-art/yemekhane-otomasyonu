'use strict';
const { primaryPool, replicaPool } = require('../config/db');
const { yazmaIsaretle, okumaHavuzu } = require('./okumaHavuzu');
const { IsKuraliHatasi } = require('../utils/hata');

class ProfilDal {
  static async tumAlerjenler() {
    const [rows] = await replicaPool.query('SELECT id, ad FROM alerjenler ORDER BY ad');
    return rows;
  }

  static async seciliAlerjenler(kullaniciId) {
    const havuz = await okumaHavuzu(kullaniciId);
    const [rows] = await havuz.query(
      'SELECT alerjen_id FROM kullanici_alerjenleri WHERE kullanici_id = ? ORDER BY alerjen_id',
      [kullaniciId]
    );
    return rows.map((r) => r.alerjen_id);
  }

  // Tercihleri bütünüyle değiştirir (sil + ekle) tek transaction içinde
  static async alerjenleriKaydet(kullaniciId, alerjenIdleri) {
    const baglanti = await primaryPool.getConnection();
    try {
      await baglanti.beginTransaction();
      await baglanti.query('DELETE FROM kullanici_alerjenleri WHERE kullanici_id = ?', [kullaniciId]);
      if (alerjenIdleri.length) {
        await baglanti.query(
          'INSERT INTO kullanici_alerjenleri (kullanici_id, alerjen_id) VALUES ?',
          [alerjenIdleri.map((id) => [kullaniciId, id])]
        );
      }
      await baglanti.commit();
    } catch (err) {
      await baglanti.rollback();
      if (err.errno === 1452) throw new IsKuraliHatasi('Geçersiz alerjen seçimi.');
      throw err;
    } finally {
      baglanti.release();
    }
    await yazmaIsaretle(kullaniciId);
  }
}

module.exports = ProfilDal;
