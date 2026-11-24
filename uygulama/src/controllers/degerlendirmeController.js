'use strict';
const DegerlendirmeDal = require('../dal/degerlendirmeDal');
const { IsKuraliHatasi, tamsayi } = require('../utils/hata');

// GET /api/degerlendirme  -> kullanılmış menüler ve verilmiş puanlar
exports.listele = async (req, res) => {
  res.json({ menuler: await DegerlendirmeDal.kullanilanMenuler(req.user.id) });
};

// POST /api/degerlendirme  { menu_id, puan (1-5), yorum? }
exports.ekle = async (req, res) => {
  const menuId = tamsayi(req.body && req.body.menu_id);
  const puan = Number(req.body && req.body.puan);
  const yorum = String((req.body && req.body.yorum) || '').trim();

  if (!menuId) throw new IsKuraliHatasi('Geçerli bir menü seçiniz.');
  if (!Number.isInteger(puan) || puan < 1 || puan > 5) throw new IsKuraliHatasi('Puan 1 ile 5 arasında olmalıdır.');
  if (yorum.length > 500) throw new IsKuraliHatasi('Yorum en fazla 500 karakter olabilir.');

  await DegerlendirmeDal.ekle(req.user.id, menuId, puan, yorum || null);
  res.json({ mesaj: 'Değerlendirmeniz kaydedildi, teşekkürler.' });
};
