'use strict';

// Uygulamanın kendi doğrulama hataları (kullanıcıya olduğu gibi gösterilir)
class IsKuraliHatasi extends Error {
  constructor(mesaj, durum = 400) {
    super(mesaj);
    this.durum = durum;
  }
}

// Stored procedure'lerin SIGNAL SQLSTATE '45000' ile döndürdüğü Türkçe hatalar (MySQL kodu 1644)
function yordamHatasiMi(err) {
  return Boolean(err) && (err.sqlState === '45000' || err.errno === 1644 || err.code === 'ER_SIGNAL_EXCEPTION');
}

function hataYanit(res, err) {
  if (err instanceof IsKuraliHatasi) {
    return res.status(err.durum).json({ hata: err.message });
  }
  if (yordamHatasiMi(err)) {
    // Mesaj değiştirilmeden arayüze iletilir
    return res.status(400).json({ hata: err.sqlMessage || err.message });
  }
  // CHECK ihlali (3819) vb. programlama hatasıdır: ham haliyle kullanıcıya gösterilmez
  console.error('[HATA]', err);
  return res.status(500).json({ hata: 'Beklenmeyen bir sunucu hatası oluştu.' });
}

// async controller'ları hata yakalayıcıya bağlar
const sar = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((err) => hataYanit(res, err));
};

function tamsayi(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { IsKuraliHatasi, hataYanit, sar, tamsayi, yordamHatasiMi };
