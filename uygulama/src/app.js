'use strict';
const express = require('express');
const apiRoutes = require('./routes/api');
const MenuDal = require('./dal/menuDal');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

// Tüm Web API yolları /api ile başlar (Apache yalnızca /api/ isteklerini buraya iletir)
app.use('/api', apiRoutes);

app.use('/api', (req, res) => res.status(404).json({ hata: 'Böyle bir uç nokta yok.' }));

// Hatalı JSON gövdesi vb.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ hata: 'İstek gövdesi geçersiz.' });
  console.error('[HATA]', err);
  res.status(500).json({ hata: 'Beklenmeyen bir sunucu hatası oluştu.' });
});

const PORT = Number(process.env.PORT) || 8000;
const sunucu = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Uygulama servisi ${PORT} portunda çalışıyor.`);
});

// Aşama 4: eski yapıdaki menü önbellek kayıtlarını temizle (Redis hazır olunca)
MenuDal.eskiKayitlariTemizle().catch((err) => console.error('[REDIS] Eski kayıtlar temizlenemedi:', err.message));

process.on('SIGTERM', () => sunucu.close(() => process.exit(0)));
