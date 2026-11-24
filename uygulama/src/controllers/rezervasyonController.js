'use strict';
const RezervasyonDal = require('../dal/rezervasyonDal');
const BakiyeDal = require('../dal/bakiyeDal');
const { IsKuraliHatasi, tamsayi } = require('../utils/hata');

// POST /api/rezervasyon/yap   { menu_id, yarim_porsiyon }
exports.rezervasyonYap = async (req, res) => {
  const menuId = tamsayi(req.body && req.body.menu_id);
  if (!menuId) throw new IsKuraliHatasi('Geçerli bir menü seçiniz.');
  const yarim = req.body.yarim_porsiyon === true || req.body.yarim_porsiyon === 1 || req.body.yarim_porsiyon === '1';

  const sonuc = await RezervasyonDal.rezervasyonYap(req.user.id, menuId, yarim);

  // Rezervasyondan hemen sonra gösterilen bakiye KAYNAKTAN okunur: replika henüz
  // yetişmemiş olabilir ve kullanıcı eski bakiyeyi görürdü (replikasyon gecikmesi).
  const bakiye = await BakiyeDal.getBakiyeKaynaktan(req.user.id);

  res.json({
    mesaj: 'Rezervasyonunuz oluşturuldu.',
    rezervasyon_id: sonuc.rezervasyon_id,
    ucret: sonuc.ucret,
    bakiye
  });
};

// POST /api/rezervasyon/iptal/:id
exports.rezervasyonIptal = async (req, res) => {
  const rezervasyonId = tamsayi(req.params.id);
  if (!rezervasyonId) throw new IsKuraliHatasi('Geçerli bir rezervasyon seçiniz.');

  const sonuc = await RezervasyonDal.rezervasyonIptal(req.user.id, rezervasyonId);
  const bakiye = await BakiyeDal.getBakiyeKaynaktan(req.user.id); // aynı gerekçe: kaynaktan

  res.json({
    mesaj: 'Rezervasyon iptal edildi, ücret iade edildi.',
    rezervasyon_id: sonuc.rezervasyon_id,
    iade: sonuc.iade,
    bakiye
  });
};

// GET /api/rezervasyon
exports.benimRezervasyonlarim = async (req, res) => {
  const liste = await RezervasyonDal.kullaniciRezervasyonlari(req.user.id);
  res.json({
    rezervasyonlar: liste.map((r) => ({
      ...r,
      yarim_porsiyon: Boolean(r.yarim_porsiyon),
      iptal_edilebilir: Boolean(r.iptal_edilebilir)
    }))
  });
};
