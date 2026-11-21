-- =======================================================
-- YEMEKHANE OTOMASYONU - AŞAMA 4 MİGRATION
-- File: db/init/04_degisiklik.sql
-- =======================================================

USE `yemekhane`;

-- 1. Kullanıcı Alerjen Tercihleri Tablosu
CREATE TABLE IF NOT EXISTS `kullanici_alerjenleri` (
  `kullanici_id` INT NOT NULL,
  `alerjen_id` INT NOT NULL,
  PRIMARY KEY (`kullanici_id`, `alerjen_id`),
  FOREIGN KEY (`kullanici_id`) REFERENCES `kullanicilar`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`alerjen_id`) REFERENCES `alerjenler`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Rezervasyonlar Tablosuna Yarım Porsiyon Sütunu Ekleme (Varsayılan 0: Tam Porsiyon)
ALTER TABLE `rezervasyonlar` 
ADD COLUMN `yarim_porsiyon` TINYINT(1) NOT NULL DEFAULT 0 AFTER `ucret`;

-- 3. Stored Procedure Güncellemesi: sp_rezervasyon_yap
DROP PROCEDURE IF EXISTS `sp_rezervasyon_yap`;

DELIMITER //

CREATE PROCEDURE `sp_rezervasyon_yap`(
    IN p_kullanici_id INT,
    IN p_menu_id INT,
    IN p_yarim_porsiyon TINYINT(1)
)
proc_label: BEGIN
    DECLARE v_bakiye DECIMAL(10,2);
    DECLARE v_rol VARCHAR(20);
    DECLARE v_fiyat DECIMAL(10,2);
    DECLARE v_ogun_id INT;
    DECLARE v_son_saat TIME;
    DECLARE v_tarih DATE;
    DECLARE v_kapasite INT;
    DECLARE v_rezerve_sayisi INT;
    DECLARE v_mevcut_rez_id INT;
    DECLARE v_mevcut_durum VARCHAR(20);
    DECLARE v_ucret DECIMAL(10,2);

    -- Hata Durumunda Rollback
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    START TRANSACTION;

    -- Kullanıcı kontrolü
    SELECT bakiye, rol INTO v_bakiye, v_rol
    FROM kullanicilar WHERE id = p_kullanici_id FOR UPDATE;

    IF v_bakiye IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Kullanıcı bulunamadı.';
    END IF;

    -- Menü kontrolü
    SELECT m.ogun_id, m.tarih, o.son_saat,
           IF(v_rol = 'ogrenci', m.ogrenci_fiyati, m.personel_fiyati),
           yh.kapasite
    INTO v_ogun_id, v_tarih, v_son_saat, v_fiyat, v_kapasite
    FROM menuler m
    JOIN ogunler o ON m.ogun_id = o.id
    JOIN yemekhaneler yh ON m.yemekhane_id = yh.id
    WHERE m.id = p_menu_id;

    IF v_fiyat IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Menü bulunamadı.';
    END IF;

    -- Yarım Porsiyon Kuralları: Kahvaltıda (ogun_id = 1) yarım porsiyon kabul edilmez!
    IF p_yarim_porsiyon = 1 THEN
        IF v_ogun_id = 1 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Kahvaltı öğününde yarım porsiyon seçeneği bulunmamaktadır.';
        END IF;
        SET v_ucret = ROUND(v_fiyat * 0.60, 2);
    ELSE
        SET v_ucret = v_fiyat;
    END IF;

    -- Son saat kontrolü
    IF CURRENT_DATE() > v_tarih OR (CURRENT_DATE() = v_tarih AND CURRENT_TIME() > v_son_saat) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bu menü için rezervasyon süresi doldu.';
    END IF;

    -- Kapasite kontrolü
    SELECT COUNT(*) INTO v_rezerve_sayisi 
    FROM rezervasyonlar 
    WHERE menu_id = p_menu_id AND durum = 'aktif';

    IF v_rezerve_sayisi >= v_kapasite THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Yemekhane kapasitesi dolu.';
    END IF;

    -- Bakiye kontrolü
    IF v_bakiye < v_ucret THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bakiye yetersiz.';
    END IF;

    -- Mükerrer Rezervasyon Kontrolü
    SELECT id, durum INTO v_mevcut_rez_id, v_mevcut_durum
    FROM rezervasyonlar
    WHERE kullanici_id = p_kullanici_id AND menu_id = p_menu_id;

    IF v_mevcut_rez_id IS NOT NULL THEN
        IF v_mevcut_durum = 'aktif' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bu menü için zaten rezervasyonunuz var.';
        ELSE
            -- İptal edilmişse yeniden aktifleştir
            UPDATE rezervasyonlar 
            SET durum = 'aktif', ucret = v_ucret, yarim_porsiyon = p_yarim_porsiyon, olusturma_tarihi = NOW() 
            WHERE id = v_mevcut_rez_id;
            
            UPDATE kullanicilar SET bakiye = bakiye - v_ucret WHERE id = p_kullanici_id;
            
            INSERT INTO bakiye_hareketleri (kullanici_id, tutar, aciklama)
            VALUES (p_kullanici_id, -v_ucret, CONCAT('Rezervasyon (#', v_mevcut_rez_id, ')'));

            COMMIT;
            SELECT v_mevcut_rez_id AS rezervasyon_id, v_ucret AS ucret, (v_bakiye - v_ucret) AS bakiye;
            LEAVE proc_label;
        END IF;
    END IF;

    -- Yeni Rezervasyon Kaydı
    INSERT INTO rezervasyonlar (kullanici_id, menu_id, durum, ucret, yarim_porsiyon)
    VALUES (p_kullanici_id, p_menu_id, 'aktif', v_ucret, p_yarim_porsiyon);

    SET v_mevcut_rez_id = LAST_INSERT_ID();

    UPDATE kullanicilar SET bakiye = bakiye - v_ucret WHERE id = p_kullanici_id;

    INSERT INTO bakiye_hareketleri (kullanici_id, tutar, aciklama)
    VALUES (p_kullanici_id, -v_ucret, CONCAT('Rezervasyon (#', v_mevcut_rez_id, ')'));

    COMMIT;

    SELECT v_mevcut_rez_id AS rezervasyon_id, v_ucret AS ucret, (v_bakiye - v_ucret) AS bakiye;
END //

DELIMITER ;