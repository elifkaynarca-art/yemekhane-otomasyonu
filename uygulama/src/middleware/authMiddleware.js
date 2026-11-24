'use strict';
const AuthDal = require('../dal/authDal');
const { hataYanit } = require('../utils/hata');

function tokenAl(req) {
  const baslik = req.headers.authorization || '';
  const token = baslik.startsWith('Bearer ') ? baslik.slice(7).trim() : baslik.trim();
  return /^[A-Za-z0-9-]{20,64}$/.test(token) ? token : null;
}

// Oturumu Redis'ten (oturum:{token}) doğrular; her istekte süreyi 30 dakikaya yeniler.
async function oturumGerekli(req, res, next) {
  try {
    const token = tokenAl(req);
    if (!token) return res.status(401).json({ hata: 'Oturum açmanız gerekmektedir.' });

    const kullanici = await AuthDal.oturumGetirVeYenile(token);
    if (!kullanici) return res.status(401).json({ hata: 'Oturum süresi doldu, lütfen yeniden giriş yapın.' });

    req.token = token;
    req.user = kullanici;
    next();
  } catch (err) {
    hataYanit(res, err);
  }
}

function yoneticiGerekli(req, res, next) {
  if (req.user && req.user.rol === 'yonetici') return next();
  return res.status(403).json({ hata: 'Bu işlem için yönetici yetkisi gerekir.' });
}

module.exports = { oturumGerekli, yoneticiGerekli };
