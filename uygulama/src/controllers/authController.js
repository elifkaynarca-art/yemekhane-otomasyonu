'use strict';
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const AuthDal = require('../dal/authDal');
const { IsKuraliHatasi } = require('../utils/hata');

// Kullanıcı bulunamasa da bcrypt çalışsın (yanıt süresinden e-posta varlığı anlaşılmasın)
const SAHTE_HASH = '$2a$10$7EqJtq98hPqEX7fNZaFWoOhi5BqF9qkXGZ3W4O5pQ9Z6nB1w3yFHa';
const HATALI_GIRIS = 'E-posta veya şifre hatalı.';

exports.girisYap = async (req, res) => {
  const eposta = String((req.body && req.body.eposta) || '').trim().toLowerCase();
  const sifre = String((req.body && req.body.sifre) || '');
  if (!eposta || !sifre) throw new IsKuraliHatasi('E-posta ve şifre giriniz.');

  const kullanici = await AuthDal.kullaniciGetirEposta(eposta);
  const dogru = await bcrypt.compare(sifre, kullanici ? kullanici.sifre_hash : SAHTE_HASH);
  if (!kullanici || !dogru) throw new IsKuraliHatasi(HATALI_GIRIS, 401);
  if (!kullanici.aktif) throw new IsKuraliHatasi('Hesabınız pasif durumda.', 403);

  const oturum = {
    id: kullanici.id,
    ad: kullanici.ad,
    soyad: kullanici.soyad,
    eposta: kullanici.eposta,
    rol: kullanici.rol
  };
  const token = crypto.randomUUID();
  await AuthDal.oturumOlustur(token, oturum); // oturum:{token}, 30 dk

  res.json({ token, kullanici: oturum });
};

exports.cikisYap = async (req, res) => {
  await AuthDal.oturumSil(req.token);
  res.json({ mesaj: 'Çıkış yapıldı.' });
};

exports.ben = async (req, res) => {
  res.json({ kullanici: req.user });
};
