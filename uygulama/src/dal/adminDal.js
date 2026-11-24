'use strict';
const { primaryPool, replicaPool } = require('../config/db');
const { yazmaIsaretle, okumaHavuzu } = require('./okumaHavuzu');
const MenuDal = require('./menuDal');
const { IsKuraliHatasi } = require('../utils/hata');

function yazmaHatasiniCevir(err) {
  if (err.errno === 1062) {
    return new IsKuraliHatasi('Bu yemekhane, tarih ve öğün için zaten bir menü var.');
  }
  if (err.errno === 1452) {
    return new IsKuraliHatasi('Geçersiz yemekhane, öğün veya yemek seçimi.');
  }
  return err;
}

// Menü değişikliği replikaya ulaşmadan önbellek silinirse, araya giren bir okuma replikadan
// ESKİ menüyü alıp önbelleği yeniden doldurur. Bu yüzden önce replikanın kaynağa yetişmesi
// beklenir (GTID), sonra önbellek silinir.
async function replikayiBekle() {
  try {
    const [[g]] = await primaryPool.query('SELECT @@global.gtid_executed AS gtid');
    const [[s]] = await replicaPool.query('SELECT WAIT_FOR_EXECUTED_GTID_SET(?, 5) AS sonuc', [g.gtid]);
    if (s.sonuc !== 0) console.warn('[ADMIN] Replika 5 sn içinde yetişemedi, önbellek yine de siliniyor.');
  } catch (err) {
    console.warn('[ADMIN] Replika beklenemedi:', err.message);
  }
}

class AdminDal {
  static async yemekler() {
    const [rows] = await replicaPool.query(
      `SELECT y.id, y.ad, y.kalori, y.vejetaryen, k.id AS kategori_id, k.ad AS kategori
         FROM yemekler y JOIN yemek_kategorileri k ON k.id = y.kategori_id
        ORDER BY k.sira, y.ad`
    );
    return rows;
  }

  // Menü bazında doluluk ve ortalama puan (hazır view'lar)
  static async menuler(yoneticiId, baslangic, bitis, yemekhaneId) {
    const havuz = await okumaHavuzu(yoneticiId);
    const sartlar = ['d.tarih BETWEEN ? AND ?'];
    const degerler = [baslangic, bitis];
    if (yemekhaneId) {
      sartlar.push('d.yemekhane_id = ?');
      degerler.push(yemekhaneId);
    }
    const [rows] = await havuz.query(
      `SELECT d.menu_id, d.tarih, d.yemekhane_id, d.yemekhane, d.ogun_id, d.ogun,
              d.kapasite, d.rezerve, d.bos_yer, d.doluluk_yuzde, d.rezervasyon_son,
              p.oy_sayisi, p.ortalama_puan, m.ogrenci_fiyati, m.personel_fiyati
         FROM v_menu_doluluk d
         JOIN v_menu_puan p ON p.menu_id = d.menu_id
         JOIN menuler m     ON m.id = d.menu_id
        WHERE ${sartlar.join(' AND ')}
        ORDER BY d.tarih DESC, d.yemekhane_id, d.ogun_id`,
      degerler
    );
    return rows;
  }

  static async menuDetay(yoneticiId, menuId) {
    const havuz = await okumaHavuzu(yoneticiId);
    const [menu] = await havuz.query(
      `SELECT id AS menu_id, yemekhane_id, tarih, ogun_id, ogrenci_fiyati, personel_fiyati
         FROM menuler WHERE id = ?`,
      [menuId]
    );
    if (!menu.length) return null;
    const [yemekler] = await havuz.query('SELECT yemek_id FROM menu_yemekleri WHERE menu_id = ?', [menuId]);
    return { ...menu[0], yemek_idleri: yemekler.map((y) => y.yemek_id) };
  }

  static async menuOlustur(yoneticiId, v) {
    const baglanti = await primaryPool.getConnection();
    let menuId;
    try {
      await baglanti.beginTransaction();
      const [sonuc] = await baglanti.query(
        `INSERT INTO menuler (yemekhane_id, tarih, ogun_id, ogrenci_fiyati, personel_fiyati)
         VALUES (?, ?, ?, ?, ?)`,
        [v.yemekhane_id, v.tarih, v.ogun_id, v.ogrenci_fiyati, v.personel_fiyati]
      );
      menuId = sonuc.insertId;
      await baglanti.query('INSERT INTO menu_yemekleri (menu_id, yemek_id) VALUES ?', [
        v.yemek_idleri.map((id) => [menuId, id])
      ]);
      await baglanti.commit();
    } catch (err) {
      await baglanti.rollback();
      throw yazmaHatasiniCevir(err);
    } finally {
      baglanti.release();
    }

    await yazmaIsaretle(yoneticiId);
    await replikayiBekle();
    await MenuDal.cacheTemizle(v.yemekhane_id, v.tarih, v.ogun_id);
    return menuId;
  }

  static async menuGuncelle(yoneticiId, menuId, v) {
    const baglanti = await primaryPool.getConnection();
    let menu;
    try {
      await baglanti.beginTransaction();
      const [rows] = await baglanti.query(
        'SELECT yemekhane_id, tarih, ogun_id FROM menuler WHERE id = ? FOR UPDATE',
        [menuId]
      );
      if (!rows.length) throw new IsKuraliHatasi('Menü bulunamadı.', 404);
      menu = rows[0];

      await baglanti.query('UPDATE menuler SET ogrenci_fiyati = ?, personel_fiyati = ? WHERE id = ?', [
        v.ogrenci_fiyati,
        v.personel_fiyati,
        menuId
      ]);
      await baglanti.query('DELETE FROM menu_yemekleri WHERE menu_id = ?', [menuId]);
      await baglanti.query('INSERT INTO menu_yemekleri (menu_id, yemek_id) VALUES ?', [
        v.yemek_idleri.map((id) => [menuId, id])
      ]);
      await baglanti.commit();
    } catch (err) {
      await baglanti.rollback();
      throw yazmaHatasiniCevir(err);
    } finally {
      baglanti.release();
    }

    await yazmaIsaretle(yoneticiId);
    await replikayiBekle();
    // Yönetici o menüyü değiştirdiğinde ilgili önbellek kaydı silinir
    await MenuDal.cacheTemizle(menu.yemekhane_id, menu.tarih, menu.ogun_id);
  }

  // Turnike simülasyonu: rezervasyonu 'kullanildi' yapar (değerlendirme ekranını denemek için)
  static async turnikeGecis(kullaniciId, yemekhaneId, zaman) {
    const [sonuc] = await primaryPool.query('CALL sp_turnike_gecis(?, ?, ?)', [kullaniciId, yemekhaneId, zaman]);
    await yazmaIsaretle(kullaniciId);
    return sonuc[0][0]; // { rezervasyon_id, menu_id, ogun }
  }
}

module.exports = AdminDal;
