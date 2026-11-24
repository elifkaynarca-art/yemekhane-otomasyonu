'use strict';
const MenuDal = require('../dal/menuDal');
const ProfilDal = require('../dal/profilDal');
const { IsKuraliHatasi, tamsayi } = require('../utils/hata');
const { bugun, gunEkle, tarihGecerliMi } = require('../utils/zaman');

const alerjenIdleri = (satir) =>
  String(satir.alerjen_idler || '').split(',').filter(Boolean).map(Number);

const fiyatBul = (rol, m) => (rol === 'ogrenci' ? m.ogrenci_fiyati : m.personel_fiyati);
const yuvarla = (n) => Math.round(n * 100) / 100;

// Yemeği, kullanıcının seçtiği alerjenlerle karşılaştırıp uyarı listesini ekler
function yemekHazirla(satir, secili, alerjenAdlari) {
  const uyari = alerjenIdleri(satir)
    .filter((id) => secili.has(id))
    .map((id) => alerjenAdlari.get(id))
    .filter(Boolean);
  return {
    yemek_id: satir.yemek_id,
    ad: satir.yemek,
    kategori: satir.kategori,
    kalori: satir.kalori,
    vejetaryen: Boolean(satir.vejetaryen),
    alerjenler: satir.alerjenler ? String(satir.alerjenler).split(', ') : [],
    alerjen_uyarisi: uyari
  };
}

async function kullaniciAlerjenleri(kullaniciId) {
  const [tum, secili] = await Promise.all([ProfilDal.tumAlerjenler(), ProfilDal.seciliAlerjenler(kullaniciId)]);
  return {
    secili: new Set(secili),
    adlar: new Map(tum.map((a) => [a.id, a.ad]))
  };
}

// GET /api/menu/gunluk?yemekhane_id=1&ogun_id=2&tarih=2026-11-23
exports.gunluk = async (req, res) => {
  const yemekhaneId = tamsayi(req.query.yemekhane_id);
  const ogunId = tamsayi(req.query.ogun_id);
  const tarih = req.query.tarih || bugun();
  if (!yemekhaneId || !ogunId || !tarihGecerliMi(tarih)) {
    throw new IsKuraliHatasi('Yemekhane, öğün ve tarih bilgisi geçerli olmalıdır.');
  }

  const satirlar = await MenuDal.getGununMenusu(yemekhaneId, tarih, ogunId); // Redis -> replika
  if (!satirlar.length) {
    return res.json({ bulundu: false, mesaj: 'Bu yemekhane, tarih ve öğün için menü bulunamadı.' });
  }

  const { secili, adlar } = await kullaniciAlerjenleri(req.user.id);
  const yemekler = satirlar.map((s) => yemekHazirla(s, secili, adlar));
  const ilk = satirlar[0];
  const doluluk = await MenuDal.doluluk(ilk.menu_id, req.user.id);

  res.json({
    bulundu: true,
    menu_id: ilk.menu_id,
    tarih: ilk.tarih,
    yemekhane: ilk.yemekhane,
    ogun: ilk.ogun,
    rezervasyon_son: ilk.rezervasyon_son,
    fiyat: fiyatBul(req.user.rol, ilk),
    toplam_kalori: yemekler.reduce((t, y) => t + y.kalori, 0),
    bos_yer: doluluk ? doluluk.bos_yer : null,
    alerjen_uyarisi_var: yemekler.some((y) => y.alerjen_uyarisi.length > 0),
    yemekler
  });
};

// GET /api/menu/haftalik?yemekhane_id=1&baslangic=2026-11-23  (7 gün)
exports.haftalik = async (req, res) => {
  const yemekhaneId = tamsayi(req.query.yemekhane_id);
  const baslangic = req.query.baslangic || bugun();
  if (!yemekhaneId || !tarihGecerliMi(baslangic)) {
    throw new IsKuraliHatasi('Yemekhane ve başlangıç tarihi geçerli olmalıdır.');
  }
  const bitis = gunEkle(baslangic, 6);

  const [menuler, alerjen] = await Promise.all([
    MenuDal.haftalik(req.user.id, yemekhaneId, baslangic, bitis),
    kullaniciAlerjenleri(req.user.id)
  ]);

  const gunler = new Map();
  for (const m of menuler) {
    const fiyat = fiyatBul(req.user.rol, m);
    const yemekler = m.yemekler.map((s) => yemekHazirla(s, alerjen.secili, alerjen.adlar));
    const rezervasyonVar = m.rezervasyon_id && m.rezervasyon_durum !== 'iptal';

    let durumMetni = null;
    if (rezervasyonVar) durumMetni = m.rezervasyon_durum === 'kullanildi' ? 'Kullanıldı' : 'Rezervasyonunuz var';
    else if (m.suresi_doldu) durumMetni = 'Süre doldu';
    else if (m.bos_yer <= 0) durumMetni = 'Kapasite dolu';

    const kayit = {
      menu_id: m.menu_id,
      ogun_id: m.ogun_id,
      ogun: m.ogun,
      yemekhane: m.yemekhane,
      rezervasyon_son: m.rezervasyon_son,
      fiyat,
      yarim_fiyat: m.ogun_id === 1 ? null : yuvarla(fiyat * 0.6), // gösterim amaçlı; ücreti yordam hesaplar
      kapasite: m.kapasite,
      bos_yer: m.bos_yer,
      toplam_kalori: yemekler.reduce((t, y) => t + y.kalori, 0),
      yemekler,
      alerjen_uyarisi_var: yemekler.some((y) => y.alerjen_uyarisi.length > 0),
      rezervasyon_yapilabilir: !rezervasyonVar && !m.suresi_doldu && m.bos_yer > 0,
      durum_metni: durumMetni
    };
    if (!gunler.has(m.tarih)) gunler.set(m.tarih, []);
    gunler.get(m.tarih).push(kayit);
  }

  res.json({
    baslangic,
    bitis,
    gunler: [...gunler.entries()].map(([tarih, liste]) => ({ tarih, menuler: liste }))
  });
};

// GET /api/referans  -> seçim kutuları (yemekhane, öğün)
exports.referans = async (req, res) => {
  res.json(await MenuDal.referans());
};
