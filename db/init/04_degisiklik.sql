-- =====================================================================
-- Yemekhane Otomasyonu · Aşama 4 migration (04_degisiklik.sql)
--   1. kullanici_alerjenleri tablosu (alerjen uyarısı)
--   2. rezervasyonlar.yarim_porsiyon sütunu (mevcut kayıtlar tam porsiyon = 0)
--   3. sp_rezervasyon_yap: porsiyon parametresi, yarım porsiyon = tam fiyatın %60'ı,
--      kahvaltıda yarım porsiyon yok
-- Mevcut veriyi bozmaz, yeniden çalıştırılabilir. DDL olduğu için replikaya geçer.
-- Çalışan sistemde kaynağa uygulama:
--   docker compose exec -T mysql-primary mysql -uroot -pyemekhane_kok yemekhane < db/init/04_degisiklik.sql
-- =====================================================================
SET NAMES utf8mb4;
USE yemekhane;

-- ---------------------------------------------------------------------
-- 1. Kullanıcı alerjen tercihleri (tip ve işaret, kaynak tablolarla birebir aynı olmalı)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kullanici_alerjenleri (
    kullanici_id  INT UNSIGNED     NOT NULL,
    alerjen_id    TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (kullanici_id, alerjen_id),
    CONSTRAINT fk_ka_kullanici FOREIGN KEY (kullanici_id) REFERENCES kullanicilar (id) ON DELETE CASCADE,
    CONSTRAINT fk_ka_alerjen   FOREIGN KEY (alerjen_id)   REFERENCES alerjenler (id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 2. Yarım porsiyon sütunu (yalnızca yoksa eklenir; DEFAULT 0 => geçmiş kayıtlar tam porsiyon)
-- ---------------------------------------------------------------------
SET @kolon_var := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'rezervasyonlar'
       AND COLUMN_NAME  = 'yarim_porsiyon');

SET @ddl := IF(@kolon_var = 0,
    'ALTER TABLE rezervasyonlar
         ADD COLUMN yarim_porsiyon TINYINT(1) NOT NULL DEFAULT 0 AFTER ucret,
         ADD CONSTRAINT ck_rez_porsiyon CHECK (yarim_porsiyon IN (0, 1))',
    'SELECT 1');
PREPARE ddl_calistir FROM @ddl;
EXECUTE ddl_calistir;
DEALLOCATE PREPARE ddl_calistir;

-- ---------------------------------------------------------------------
-- 3. sp_rezervasyon_yap(kullanici_id, menu_id, yarim_porsiyon)
--    Dönen satır: rezervasyon_id, ucret, bakiye
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS sp_rezervasyon_yap;

DELIMITER $$

CREATE PROCEDURE sp_rezervasyon_yap(
    IN p_kullanici_id  INT UNSIGNED,
    IN p_menu_id       INT UNSIGNED,
    IN p_yarim_porsiyon TINYINT
)
BEGIN
    DECLARE v_rol          VARCHAR(10)  DEFAULT NULL;
    DECLARE v_aktif        TINYINT      DEFAULT NULL;
    DECLARE v_bakiye       DECIMAL(10,2) DEFAULT NULL;
    DECLARE v_son          DATETIME     DEFAULT NULL;
    DECLARE v_kapasite     INT          DEFAULT NULL;
    DECLARE v_ogun_ad      VARCHAR(20)  DEFAULT NULL;
    DECLARE v_ogr_fiyat    DECIMAL(8,2) DEFAULT NULL;
    DECLARE v_per_fiyat    DECIMAL(8,2) DEFAULT NULL;
    DECLARE v_ucret        DECIMAL(8,2) DEFAULT NULL;
    DECLARE v_yarim        TINYINT      DEFAULT 0;
    DECLARE v_dolu         INT          DEFAULT 0;
    DECLARE v_mevcut_id    INT UNSIGNED DEFAULT NULL;
    DECLARE v_mevcut_durum VARCHAR(12)  DEFAULT NULL;
    DECLARE v_rez_id       INT UNSIGNED DEFAULT NULL;

    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    DECLARE CONTINUE HANDLER FOR NOT FOUND BEGIN END;

    SET v_yarim = IF(p_yarim_porsiyon IS NULL OR p_yarim_porsiyon = 0, 0, 1);

    START TRANSACTION;

    -- Kullanıcı satırını kilitle
    SELECT rol, aktif, bakiye INTO v_rol, v_aktif, v_bakiye
      FROM kullanicilar WHERE id = p_kullanici_id FOR UPDATE;
    IF v_rol IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Kullanıcı bulunamadı.';
    END IF;
    IF v_aktif = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Hesabınız pasif durumda.';
    END IF;

    -- Menü satırını kilitle
    SELECT TIMESTAMP(m.tarih, o.son_saat), yh.kapasite, o.ad, m.ogrenci_fiyati, m.personel_fiyati
      INTO v_son, v_kapasite, v_ogun_ad, v_ogr_fiyat, v_per_fiyat
      FROM menuler m
      JOIN ogunler o       ON o.id  = m.ogun_id
      JOIN yemekhaneler yh ON yh.id = m.yemekhane_id
     WHERE m.id = p_menu_id
       FOR UPDATE;
    IF v_son IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Menü bulunamadı.';
    END IF;
    IF NOW() >= v_son THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bu menü için rezervasyon süresi doldu.';
    END IF;

    -- Yarım porsiyon yalnızca öğle ve akşam menülerinde
    IF v_yarim = 1 AND v_ogun_ad = 'Kahvaltı' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Kahvaltıda yarım porsiyon seçilemez.';
    END IF;

    SELECT id, durum INTO v_mevcut_id, v_mevcut_durum
      FROM rezervasyonlar
     WHERE kullanici_id = p_kullanici_id AND menu_id = p_menu_id
       FOR UPDATE;
    IF v_mevcut_durum IN ('aktif', 'kullanildi') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bu menü için zaten rezervasyonunuz var.';
    END IF;

    SELECT COUNT(*) INTO v_dolu
      FROM rezervasyonlar
     WHERE menu_id = p_menu_id AND durum IN ('aktif', 'kullanildi');
    IF v_dolu >= v_kapasite THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Yemekhane kapasitesi dolu.';
    END IF;

    -- Ücret: rolüne göre fiyat; yarım porsiyonda tam fiyatın %60'ı
    SET v_ucret = IF(v_rol = 'ogrenci', v_ogr_fiyat, v_per_fiyat);
    IF v_yarim = 1 THEN
        SET v_ucret = ROUND(v_ucret * 0.60, 2);
    END IF;

    IF v_bakiye < v_ucret THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Bakiye yetersiz.';
    END IF;

    IF v_mevcut_id IS NULL THEN
        INSERT INTO rezervasyonlar (kullanici_id, menu_id, durum, ucret, yarim_porsiyon)
        VALUES (p_kullanici_id, p_menu_id, 'aktif', v_ucret, v_yarim);
        SET v_rez_id = LAST_INSERT_ID();
    ELSE
        -- Daha önce iptal edilmiş kayıt yeniden etkinleşir
        UPDATE rezervasyonlar
           SET durum = 'aktif', ucret = v_ucret, yarim_porsiyon = v_yarim,
               olusturma = NOW(), iptal_zamani = NULL, kullanma_zamani = NULL
         WHERE id = v_mevcut_id;
        SET v_rez_id = v_mevcut_id;
    END IF;

    UPDATE kullanicilar SET bakiye = bakiye - v_ucret WHERE id = p_kullanici_id;

    INSERT INTO bakiye_hareketleri (kullanici_id, tur, tutar, rezervasyon_id, aciklama)
    VALUES (p_kullanici_id, 'rezervasyon', -v_ucret, v_rez_id,
            IF(v_yarim = 1, 'Rezervasyon (yarım porsiyon)', 'Rezervasyon'));

    COMMIT;

    SELECT v_rez_id AS rezervasyon_id, v_ucret AS ucret, v_bakiye - v_ucret AS bakiye;
END$$

DELIMITER ;
