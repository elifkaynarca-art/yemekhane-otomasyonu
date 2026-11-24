'use strict';
const express = require('express');
const { oturumGerekli, yoneticiGerekli } = require('../middleware/authMiddleware');
const { sar } = require('../utils/hata');

const auth = require('../controllers/authController');
const menu = require('../controllers/menuController');
const rezervasyon = require('../controllers/rezervasyonController');
const bakiye = require('../controllers/bakiyeController');
const degerlendirme = require('../controllers/degerlendirmeController');
const profil = require('../controllers/profilController');
const admin = require('../controllers/adminController');

const router = express.Router();

// Sağlık (Docker healthcheck)
router.get('/saglik', (req, res) => res.json({ durum: 'ok' }));

// Oturum
router.post('/auth/login', sar(auth.girisYap));
router.post('/auth/logout', oturumGerekli, sar(auth.cikisYap));
router.get('/auth/ben', oturumGerekli, sar(auth.ben));

// Bundan sonrası oturum ister
router.use(oturumGerekli);

router.get('/referans', sar(menu.referans));

// Menü
router.get('/menu/gunluk', sar(menu.gunluk));
router.get('/menu/haftalik', sar(menu.haftalik));

// Rezervasyon
router.get('/rezervasyon', sar(rezervasyon.benimRezervasyonlarim));
router.post('/rezervasyon/yap', sar(rezervasyon.rezervasyonYap));
router.post('/rezervasyon/iptal/:id', sar(rezervasyon.rezervasyonIptal));

// Bakiye
router.get('/bakiye', sar(bakiye.getir));
router.post('/bakiye/yukle', sar(bakiye.yukle));

// Değerlendirme
router.get('/degerlendirme', sar(degerlendirme.listele));
router.post('/degerlendirme', sar(degerlendirme.ekle));

// Profil (alerjen tercihleri)
router.get('/profil/alerjenler', sar(profil.alerjenleriGetir));
router.put('/profil/alerjenler', sar(profil.alerjenleriKaydet));

// Yönetici
router.get('/admin/yemekler', yoneticiGerekli, sar(admin.yemekler));
router.get('/admin/menuler', yoneticiGerekli, sar(admin.menuler));
router.get('/admin/menuler/:id', yoneticiGerekli, sar(admin.menuDetay));
router.post('/admin/menuler', yoneticiGerekli, sar(admin.menuOlustur));
router.put('/admin/menuler/:id', yoneticiGerekli, sar(admin.menuGuncelle));
router.post('/admin/turnike', yoneticiGerekli, sar(admin.turnike));

module.exports = router;
