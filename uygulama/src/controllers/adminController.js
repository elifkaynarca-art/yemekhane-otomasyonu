'use strict';
const AdminDal = require('../dal/adminDal');
const { IsKuraliHatasi, tamsayi } = require('../utils/hata');
const { bugun, gunEkle, tarihGecerliMi } = require('../utils/zaman');

function fiyatOku(deger, ad) {
  const n = Number(deger);
  if (deger === '' || deger === null || deger === undefined || !Number.isFinite(n) || n < 0 || n > 9999) {
    throw new IsKuraliHatasi(`${ad} 0 ile 9999 arasında bir sayı olmalıdır.`);
  }
  return Math.round(n * 100) / 100;
}

function yemekIdleriOku(liste) {
  if (!Array.isArray(liste) || !liste.length) throw new IsKuraliHatasi('Menü için en az bir yemek seçiniz.');
  const idler = [...new Set(liste.map(Number))];
  if (idler.some((id) => !Number.isInteger(id) || id < 1)) throw new IsKuraliHatasi('Geçersiz yemek seçimi.');
  return idler;
}

// GET /api/admin/yemekler
exports.yemekler = async (req, res) => {
  res.json({ yemekler: await AdminDal.yemekler() });
};

// GET /api/admin/menuler?baslangic=&bitis=&yemekhane_id=
exports.menuler = async (req, res) => {
  const baslangic = req.query.baslangic || gunEkle(bugun(), -7);
  const bitis = req.query.bitis || gunEkle(bugun(), 13);
  if (!tarihGecerliMi(baslangic) || !tarihGecerliMi(bitis)) throw new IsKuraliHatasi('Tarih aralığı geçersiz.');
  const yemekhaneId = req.query.yemekhane_id ? tamsayi(req.query.yemekhane_id) : null;

  res.json({ baslangic, bitis, menuler: await AdminDal.menuler(req.user.id, baslangic, bitis, yemekhaneId) });
};

// GET /api/admin/menuler/:id
exports.menuDetay = async (req, res) => {
  const menuId = tamsayi(req.params.id);
  if (!menuId) throw new IsKuraliHatasi('Geçerli bir menü seçiniz.');
  const menu = await AdminDal.menuDetay(req.user.id, menuId);
  if (!menu) throw new IsKuraliHatasi('Menü bulunamadı.', 404);
  res.json(menu);
};

// POST /api/admin/menuler
exports.menuOlustur = async (req, res) => {
  const b = req.body || {};
  const veri = {
    yemekhane_id: tamsayi(b.yemekhane_id),
    ogun_id: tamsayi(b.ogun_id),
    tarih: b.tarih,
    ogrenci_fiyati: fiyatOku(b.ogrenci_fiyati, 'Öğrenci fiyatı'),
    personel_fiyati: fiyatOku(b.personel_fiyati, 'Personel fiyatı'),
    yemek_idleri: yemekIdleriOku(b.yemek_idleri)
  };
  if (!veri.yemekhane_id || !veri.ogun_id || !tarihGecerliMi(veri.tarih)) {
    throw new IsKuraliHatasi('Yemekhane, öğün ve tarih seçiniz.');
  }
  const menuId = await AdminDal.menuOlustur(req.user.id, veri);
  res.status(201).json({ mesaj: 'Menü oluşturuldu.', menu_id: menuId });
};

// PUT /api/admin/menuler/:id   (fiyatlar ve yemekler; yemekhane/tarih/öğün değişmez)
exports.menuGuncelle = async (req, res) => {
  const menuId = tamsayi(req.params.id);
  if (!menuId) throw new IsKuraliHatasi('Geçerli bir menü seçiniz.');
  const b = req.body || {};
  const veri = {
    ogrenci_fiyati: fiyatOku(b.ogrenci_fiyati, 'Öğrenci fiyatı'),
    personel_fiyati: fiyatOku(b.personel_fiyati, 'Personel fiyatı'),
    yemek_idleri: yemekIdleriOku(b.yemek_idleri)
  };
  await AdminDal.menuGuncelle(req.user.id, menuId, veri);
  res.json({ mesaj: 'Menü güncellendi, önbellek temizlendi.' });
};

// POST /api/admin/turnike  { kullanici_id, yemekhane_id, zaman? }
exports.turnike = async (req, res) => {
  const b = req.body || {};
  const kullaniciId = tamsayi(b.kullanici_id);
  const yemekhaneId = tamsayi(b.yemekhane_id);
  if (!kullaniciId || !yemekhaneId) throw new IsKuraliHatasi('Kullanıcı ve yemekhane seçiniz.');

  let zaman = null;
  if (b.zaman) {
    const duzgun = String(b.zaman).replace('T', ' ');
    const tam = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(duzgun) ? `${duzgun}:00` : duzgun;
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(tam) || !tarihGecerliMi(tam.slice(0, 10))) {
      throw new IsKuraliHatasi('Zaman biçimi geçersiz.');
    }
    zaman = tam;
  }
  const sonuc = await AdminDal.turnikeGecis(kullaniciId, yemekhaneId, zaman);
  res.json({ mesaj: `Turnike geçişi kaydedildi (${sonuc.ogun}).`, ...sonuc });
};
