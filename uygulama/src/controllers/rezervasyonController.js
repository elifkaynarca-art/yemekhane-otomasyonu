const RezervasyonDal = require('../dal/rezervasyonDal');
const bakiyeDal = require('../dal/bakiyeDal');

exports.rezervasyonYap = async (req, res) => {
  try {
    const { menu_id, yarim_porsiyon } = req.body;
    const kullanici_id = req.user.id;

    const sonuc = await RezervasyonDal.rezervasyonYap(kullanici_id, menu_id, yarim_porsiyon);
    
    // ÖDEV KURALI: Rezervasyondan hemen sonra bakiye replikasyon gecikmesi yaşanmaması için KAYNAKTAN okunur.
    const guncelBakiye = await bakiyeDal.getBakiyeKaynaktan(kullanici_id);

    return res.json({
      mesaj: 'Rezervasyon başarıyla tamamlandı.',
      rezervasyon_id: sonuc.rezervasyon_id,
      ucret: sonuc.ucret,
      bakiye: guncelBakiye
    });
  } catch (err) {
    // MySQL Procedure Türkçe 45000 Hata Mesajını Yakala ve Arayüze İlet
    if (err.sqlState === '45000' || err.code === 'ER_SIGNAL_EXCEPTION') {
      return res.status(400).json({ hata: err.sqlMessage });
    }
    return res.status(500).json({ hata: 'Sunucu hatası oluştu: ' + err.message });
  }
};