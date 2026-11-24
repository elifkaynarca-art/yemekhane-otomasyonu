'use strict';
const { replicaPool } = require('../config/db');
const redis = require('../config/redis');
const { okumaHavuzu } = require('./okumaHavuzu');
const { gunSonunaKalanSaniye } = require('../utils/zaman');

// Önbellek kaydının yapı sürümü. Aşama 4'te menü satırlarına alerjen alanları geldi;
// sürümü değişmeyen/eksik eski kayıtlar açılışta silinir ve okunmaz.
const MENU_SURUM = 2;

const menuAnahtari = (yemekhaneId, tarih, ogunId) => `menu:${yemekhaneId}:${tarih}:${ogunId}`;

class MenuDal {
  // Günün menüsü: önce Redis, yoksa replikadan (v_menu_detay) okunup o günün sonuna kadar saklanır
  static async getGununMenusu(yemekhaneId, tarih, ogunId) {
    const anahtar = menuAnahtari(yemekhaneId, tarih, ogunId);

    const ham = await redis.get(anahtar);
    if (ham) {
      try {
        const kayit = JSON.parse(ham);
        if (kayit && kayit.surum === MENU_SURUM) {
          console.log(`[REDIS HIT] ${anahtar}`);
          return kayit.satirlar;
        }
      } catch (e) { /* bozuk kayıt: yok say */ }
    }

    console.log(`[REDIS MISS] ${anahtar} -> veritabanından (replika) okunuyor`);
    const [satirlar] = await replicaPool.query(
      `SELECT * FROM v_menu_detay
        WHERE yemekhane_id = ? AND tarih = ? AND ogun_id = ?
        ORDER BY kategori_sira, yemek`,
      [yemekhaneId, tarih, ogunId]
    );

    if (satirlar.length) {
      await redis.set(anahtar, JSON.stringify({ surum: MENU_SURUM, satirlar }), 'EX', gunSonunaKalanSaniye());
    }
    return satirlar;
  }

  static async cacheTemizle(yemekhaneId, tarih, ogunId) {
    const anahtar = menuAnahtari(yemekhaneId, tarih, ogunId);
    const silinen = await redis.del(anahtar);
    console.log(`[REDIS DEL] ${anahtar} (${silinen} kayıt silindi)`);
  }

  // Açılışta eski yapıdaki (sürümü uyuşmayan) menü kayıtlarını temizler
  static async eskiKayitlariTemizle() {
    let imlec = '0';
    let silinen = 0;
    do {
      const [sonraki, anahtarlar] = await redis.scan(imlec, 'MATCH', 'menu:*', 'COUNT', 200);
      imlec = sonraki;
      for (const anahtar of anahtarlar) {
        let eski = true;
        try {
          const kayit = JSON.parse(await redis.get(anahtar));
          eski = !(kayit && kayit.surum === MENU_SURUM);
        } catch (e) { /* bozuk -> eski say */ }
        if (eski) {
          await redis.del(anahtar);
          silinen += 1;
        }
      }
    } while (imlec !== '0');
    console.log(`[REDIS] Eski yapıdaki menü kayıtları temizlendi: ${silinen}`);
    return silinen;
  }

  static async doluluk(menuId, kullaniciId) {
    const havuz = await okumaHavuzu(kullaniciId);
    const [rows] = await havuz.query(
      'SELECT kapasite, rezerve, bos_yer, rezervasyon_son FROM v_menu_doluluk WHERE menu_id = ?',
      [menuId]
    );
    return rows[0] || null;
  }

  // Haftalık menü: menü + doluluk + kullanıcının kendi rezervasyonu + yemekler
  static async haftalik(kullaniciId, yemekhaneId, baslangic, bitis) {
    const havuz = await okumaHavuzu(kullaniciId);

    const [menuler] = await havuz.query(
      `SELECT d.menu_id, d.tarih, d.yemekhane_id, d.yemekhane, d.ogun_id, d.ogun,
              d.kapasite, d.rezerve, d.bos_yer, d.rezervasyon_son,
              (d.rezervasyon_son <= NOW()) AS suresi_doldu,
              m.ogrenci_fiyati, m.personel_fiyati,
              r.id AS rezervasyon_id, r.durum AS rezervasyon_durum, r.yarim_porsiyon
         FROM v_menu_doluluk d
         JOIN menuler m ON m.id = d.menu_id
         LEFT JOIN rezervasyonlar r ON r.menu_id = d.menu_id AND r.kullanici_id = ?
        WHERE d.yemekhane_id = ? AND d.tarih BETWEEN ? AND ?
        ORDER BY d.tarih, d.ogun_id`,
      [kullaniciId, yemekhaneId, baslangic, bitis]
    );
    if (!menuler.length) return [];

    const [yemekler] = await havuz.query(
      `SELECT menu_id, yemek_id, yemek, kategori, kategori_sira, kalori, vejetaryen, alerjen_idler
         FROM v_menu_detay
        WHERE menu_id IN (?)
        ORDER BY menu_id, kategori_sira, yemek`,
      [menuler.map((m) => m.menu_id)]
    );

    const gruplar = new Map();
    for (const y of yemekler) {
      if (!gruplar.has(y.menu_id)) gruplar.set(y.menu_id, []);
      gruplar.get(y.menu_id).push(y);
    }
    return menuler.map((m) => ({ ...m, yemekler: gruplar.get(m.menu_id) || [] }));
  }

  // Seçim kutuları için yemekhane ve öğün listesi
  static async referans() {
    const [yemekhaneler] = await replicaPool.query('SELECT id, ad, kapasite FROM yemekhaneler ORDER BY id');
    const [ogunler] = await replicaPool.query(
      'SELECT id, ad, son_saat, servis_baslangic, servis_bitis FROM ogunler ORDER BY sira'
    );
    return { yemekhaneler, ogunler };
  }
}

module.exports = MenuDal;
