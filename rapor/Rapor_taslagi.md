# Yemekhane Otomasyonu · Dönem Ödevi Raporu

**Öğrenci:** Hatice Elif Kaynarca  
**Seçilen mimari: Web API** (Express.js JSON API + Apache'nin sunduğu HTML5/CSS3/JavaScript arayüzü, `fetch` ile; çerçeve kullanılmadı)

> Bu taslağı Pages/Word'e aktarıp **her `[[…]]` işaretini** `scripts/dogrula.sh` çalıştırınca oluşan
> `rapor/ciktilar/*.txt` içeriğiyle (komutlar + çıktılar) değiştirin, ekran görüntülerini ekleyin ve
> `rapor/Rapor.pdf` olarak dışa aktarın. Çıktıları elle yazmayın; kendi çalıştırdığınız sistemden alın.

---

## Aşama 1 · Altyapı ve replikasyon

`docker compose up -d` ile altı servis ayağa kalkar. Kanıtlar (komut + çıktı):

1. Servis durumu (`docker compose ps -a`): tüm servisler healthy, `replica-setup` Exited (0) → **[[ciktilar/asama1.txt]]**
2. Kaynakta yapılan bakiye yüklemesi replikada görünüyor.
3. Replikaya yazma denemesi `ERROR 1290` (read-only) ile reddediliyor.
4. Replika durdurulup başlatıldığında aradaki değişiklikleri yakalıyor (GTID otomatik konumlandırma).

## Aşama 2 · Uygulama

### Mimari seçimi
Web API. Apache `/api/` isteklerini `uygulama` container'ına (8000) iletir, diğer her şeyi `frontend/` klasöründen sunar.
Tarayıcı veritabanına bağlanmaz; veriye yalnızca uygulamanın veri katmanı (DAL) ulaşır.

### Bir isteğin uygulama içindeki yolu (kendi kodumuzdan)
`POST /api/rezervasyon/yap` `{ "menu_id": 12, "yarim_porsiyon": true }`

| Katman | Dosya | Görevi |
|---|---|---|
| Route | `uygulama/src/routes/api.js` | `oturumGerekli` ara katmanı Redis'ten oturumu doğrular, isteği controller'a verir |
| Controller | `src/controllers/rezervasyonController.js` | girdiyi doğrular, DAL'ı çağırır, yanıtı hazırlar (SQL yok) |
| Veri katmanı | `src/dal/rezervasyonDal.js` | `primaryPool` ile `CALL sp_rezervasyon_yap(?, ?, ?)` çalıştırır |
| Yanıt | `src/utils/hata.js` | başarıda JSON; yordam `SQLSTATE 45000` verirse Türkçe mesaj **aynen** `{ "hata": "Bakiye yetersiz." }` olarak 400 ile döner |

Para hareketi yapan hiçbir işlem SQL ile yeniden yazılmadı; dört yordam (`sp_rezervasyon_yap`, `sp_rezervasyon_iptal`,
`sp_bakiye_yukle`, `sp_turnike_gecis`) çağrılır. Hata örnekleri: **[[ciktilar/asama2.txt]]**

### Okuma / yazma ayrımı
- **Yazma** (rezervasyon, iptal, bakiye yükleme, değerlendirme, alerjen tercihi, menü düzenleme, turnike) → `mysql-primary`.
- **Listeleme ve raporlar** (menüler, rezervasyon geçmişi, hareketler, yönetici istatistikleri) → `mysql-replica`.

### Replikasyon gecikmesi
Replikasyon eşzamansızdır: kaynakta işlenen bir yazma replikaya milisaniyeler sonra ulaşır. Rezervasyondan hemen sonra
bakiyeyi replikadan okursak kullanıcı henüz düşmemiş eski bakiyeyi görebilir. Bu yüzden rezervasyon, iptal ve bakiye
yüklemeden **hemen sonra gösterilen bakiye kaynaktan okunur** (`BakiyeDal.getBakiyeKaynaktan`). Aynı sorun listelemelerde
de yaşanabileceği için, yazma yapan kullanıcının sonraki 10 saniyelik okumaları da kaynağa yönlendirilir
(Redis'te `yazma:{kullanici_id}` anahtarı, `okumaHavuzu.js`). Böylece kullanıcı kendi yaptığı işlemi her zaman görür;
diğer kullanıcıların okumaları replikada kalır.

### Ekranlar (telefon genişliği ~400 px)
Giriş/çıkış, günün menüsü, haftalık menü ve rezervasyon, rezervasyonlarım, bakiye, değerlendirme, yönetici paneli
(+ profil/alerjen, Aşama 4). **[[ekran görüntüleri: 400 px genişlikte her ekran]]**

## Aşama 3 · Redis

| Görev | Anahtar | Süre | Silinme |
|---|---|---|---|
| Menü önbelleği | `menu:{yemekhane_id}:{tarih}:{ogun_id}` | o günün sonuna kadar | yönetici o menüyü değiştirince |
| Oturum | `oturum:{token}` | 30 dk, her istekte yenilenir | çıkışta |

- İlk istek `[REDIS MISS]` (replikadan), ikinci istek `[REDIS HIT]` (uygulama günlüğü).
- Yönetici menüyü değiştirince önce replikanın değişikliği alması beklenir (`WAIT_FOR_EXECUTED_GTID_SET`), sonra yalnızca
  **o menünün** anahtarı silinir. Bekleme yapılmazsa araya giren bir okuma replikadan eski menüyü alıp önbelleği yeniden
  doldurabilirdi.
- Oturumlar Redis'te (AOF + volume) durduğu için uygulama container'ı yeniden başlasa da oturum düşmez.

`redis-cli` çıktıları: **[[ciktilar/asama3.txt]]**

## Aşama 4 · Değişiklik talebi

- **`db/init/04_degisiklik.sql`** (tek dosya): `kullanici_alerjenleri` tablosu, `rezervasyonlar.yarim_porsiyon`
  (`DEFAULT 0`; geçmiş rezervasyonlar tam porsiyon sayılır), güncellenmiş `sp_rezervasyon_yap(kullanici, menu, yarim)`
  (ücret = tam fiyatın %60'ı, kahvaltıda yarım porsiyon yok). Dosya yeniden çalıştırılabilir, mevcut veriyi bozmaz.
- Replikaya geçtiğinin kanıtı (`SHOW CREATE TABLE` replikadan): **[[ciktilar/asama4.txt]]**
- Arayüz: haftalık menüde porsiyon seçimi, profilde alerjen seçimi, menüde ⚠ uyarı.
- Redis: önbellek kayıtlarına yapı sürümü eklendi; açılışta sürümü uymayan eski kayıtlar silinir
  (`MenuDal.eskiKayitlariTemizle`).
