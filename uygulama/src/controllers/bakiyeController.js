'use strict';
const BakiyeDal = require('../dal/bakiyeDal');
const { IsKuraliHatasi } = require('../utils/hata');

// GET /api/bakiye
exports.getir = async (req, res) => {
  res.json(await BakiyeDal.bakiyeVeHareketler(req.user.id));
};

// POST /api/bakiye/yukle  { tutar }   (10-1000 TL sınırını yordam denetler)
exports.yukle = async (req, res) => {
  const tutar = Number(req.body && req.body.tutar);
  if (!Number.isFinite(tutar)) throw new IsKuraliHatasi('Geçerli bir tutar giriniz.');

  await BakiyeDal.bakiyeYukle(req.user.id, tutar);
  const bakiye = await BakiyeDal.getBakiyeKaynaktan(req.user.id); // yüklemeden sonra kaynaktan

  res.json({ mesaj: 'Bakiye yüklendi.', bakiye });
};
