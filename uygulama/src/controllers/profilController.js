'use strict';
const ProfilDal = require('../dal/profilDal');
const { IsKuraliHatasi } = require('../utils/hata');

// GET /api/profil/alerjenler
exports.alerjenleriGetir = async (req, res) => {
  const [tum, secili] = await Promise.all([ProfilDal.tumAlerjenler(), ProfilDal.seciliAlerjenler(req.user.id)]);
  res.json({ alerjenler: tum, secili });
};

// PUT /api/profil/alerjenler  { alerjen_idleri: [1, 7] }
exports.alerjenleriKaydet = async (req, res) => {
  const gelen = req.body && req.body.alerjen_idleri;
  if (!Array.isArray(gelen)) throw new IsKuraliHatasi('Alerjen listesi geçersiz.');
  const idler = [...new Set(gelen.map(Number))];
  if (idler.some((id) => !Number.isInteger(id) || id < 1)) throw new IsKuraliHatasi('Geçersiz alerjen seçimi.');

  await ProfilDal.alerjenleriKaydet(req.user.id, idler);
  res.json({ mesaj: 'Alerjen tercihleriniz kaydedildi.', secili: idler });
};
