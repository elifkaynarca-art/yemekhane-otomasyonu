#!/usr/bin/env bash
# =====================================================================
# Rapor için GERÇEK komut çıktılarını üretir ve rapor/ciktilar/ altına yazar.
# Önce sistem çalışıyor olmalı:  docker compose up -d --build
# Çalıştırma (depo kökünden):    bash scripts/dogrula.sh
# Sonra her .txt dosyasının içeriğini rapora yapıştırın; ekran görüntülerini
# tarayıcıdan (http://localhost:8080) kendiniz alın.
# =====================================================================
set -u
cd "$(dirname "$0")/.."
OUT=rapor/ciktilar
mkdir -p "$OUT"
BASE=http://localhost:8080
APP=(-uyemekhane_app -pUyg_2026 yemekhane)

komut() {                       # komutu ve çıktısını yazdırır
  echo "\$ $*"
  "$@" 2>&1 | grep -v "Using a password"
  echo
}
sql_kaynak() { docker compose exec -T mysql-primary mysql -N -B -uroot -pyemekhane_kok yemekhane -e "$1" 2>/dev/null; }
api() {                         # api METOT YOL [TOKEN] [GOVDE]
  local m=$1 y=$2 t=${3:-} g=${4:-}
  local a=(-s -X "$m" "$BASE/api$y" -H "Content-Type: application/json")
  [ -n "$t" ] && a+=(-H "Authorization: Bearer $t")
  [ -n "$g" ] && a+=(-d "$g")
  echo "\$ curl -X $m /api$y ${g:+-d '$g'}"
  curl "${a[@]}" -w '\n[HTTP %{http_code}]\n'
  echo
}
giris() {                       # giris EPOSTA -> token
  curl -s -X POST "$BASE/api/auth/login" -H "Content-Type: application/json" \
    -d "{\"eposta\":\"$1\",\"sifre\":\"Yemek2026!\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'
}

YARIN=$(sql_kaynak "SELECT CURDATE() + INTERVAL 2 DAY")
MENU_OGLE=$(sql_kaynak "SELECT id FROM menuler WHERE yemekhane_id=1 AND ogun_id=2 AND tarih='$YARIN'")
MENU_KAHVALTI=$(sql_kaynak "SELECT id FROM menuler WHERE yemekhane_id=1 AND ogun_id=1 AND tarih='$YARIN'")
BUGUN=$(sql_kaynak "SELECT CURDATE()")

# --------------------------------------------------------------- AŞAMA 1
{
  echo "### Aşama 1 · Altyapı ve replikasyon ($(date '+%d.%m.%Y %H:%M'))"; echo
  komut docker compose ps -a
  komut docker compose exec -T mysql-replica mysql -uroot -pyemekhane_kok -e "SHOW REPLICA STATUS\G"
  echo "--- Kaynakta bakiye yükle, replikada gör"
  komut docker compose exec -T mysql-primary mysql "${APP[@]}" -e "CALL sp_bakiye_yukle(7, 100)"
  sleep 1
  komut docker compose exec -T mysql-replica mysql "${APP[@]}" -e "SELECT id, bakiye FROM kullanicilar WHERE id = 7"
  echo "--- Replikaya yazma denemesi (ERROR 1290 beklenir)"
  komut docker compose exec -T mysql-replica mysql "${APP[@]}" -e "CALL sp_bakiye_yukle(7, 50)"
  echo "--- Replika durdurulur, kaynakta değişiklik yapılır, replika başlatılır"
  komut docker compose stop mysql-replica
  komut docker compose exec -T mysql-primary mysql "${APP[@]}" -e "CALL sp_bakiye_yukle(7, 200)"
  komut docker compose start mysql-replica
  sleep 15
  komut docker compose exec -T mysql-replica mysql "${APP[@]}" -e "SELECT id, bakiye FROM kullanicilar WHERE id = 7"
  komut docker compose exec -T redis redis-cli ping
} > "$OUT/asama1.txt" 2>&1

# --------------------------------------------------------------- AŞAMA 2
{
  echo "### Aşama 2 · Uygulama (Web API) ($(date '+%d.%m.%Y %H:%M'))"; echo
  echo "--- Hatalı giriş"
  api POST /auth/login "" '{"eposta":"ayse.demir@ogr.kampus.edu.tr","sifre":"yanlis"}'
  T_AYSE=$(giris ayse.demir@ogr.kampus.edu.tr)
  T_MEHMET=$(giris mehmet.yildiz@ogr.kampus.edu.tr)
  echo "--- Günün menüsü"
  api GET "/menu/gunluk?yemekhane_id=1&ogun_id=2&tarih=$BUGUN" "$T_MEHMET"
  echo "--- Yetersiz bakiye (Ayşe 12,50 TL): yordamın Türkçe mesajı arayüze aynen gider"
  api POST /rezervasyon/yap "$T_AYSE" "{\"menu_id\":$MENU_OGLE}"
  echo "--- Başarılı rezervasyon (bakiye kaynaktan okunur)"
  api POST /rezervasyon/yap "$T_MEHMET" "{\"menu_id\":$MENU_OGLE}"
  echo "--- Aynı menüye tekrar rezervasyon"
  api POST /rezervasyon/yap "$T_MEHMET" "{\"menu_id\":$MENU_OGLE}"
  echo "--- Bakiye yükleme sınırı (10-1000 TL)"
  api POST /bakiye/yukle "$T_MEHMET" '{"tutar":5}'
  echo "--- Oturumsuz istek"
  api GET /rezervasyon
} > "$OUT/asama2.txt" 2>&1

# --------------------------------------------------------------- AŞAMA 3
{
  echo "### Aşama 3 · Redis ($(date '+%d.%m.%Y %H:%M'))"; echo
  T_ADMIN=$(giris leyla.arslan@kampus.edu.tr)
  KEY="menu:1:$YARIN:2"
  echo "--- Önbelleği boşalt, aynı menüyü iki kez iste: ilki MISS (veritabanı), ikincisi HIT (Redis)"
  komut docker compose exec -T redis redis-cli DEL "$KEY"
  curl -s -o /dev/null "$BASE/api/menu/gunluk?yemekhane_id=1&ogun_id=2&tarih=$YARIN" -H "Authorization: Bearer $T_ADMIN"
  curl -s -o /dev/null "$BASE/api/menu/gunluk?yemekhane_id=1&ogun_id=2&tarih=$YARIN" -H "Authorization: Bearer $T_ADMIN"
  komut docker compose logs uygulama --tail 6
  komut docker compose exec -T redis redis-cli --scan --pattern "menu:*"
  komut docker compose exec -T redis redis-cli TTL "$KEY"
  echo "--- Oturum anahtarı ve süresi (her istekte 1800'e yenilenir)"
  komut docker compose exec -T redis redis-cli --scan --pattern "oturum:*"
  OTURUM=$(docker compose exec -T redis redis-cli --scan --pattern "oturum:*" | head -1 | tr -d '\r')
  komut docker compose exec -T redis redis-cli TTL "$OTURUM"
  echo "--- Yönetici menüyü değiştirir: önbellek kaydı silinir"
  YEMEKLER=$(sql_kaynak "SELECT GROUP_CONCAT(yemek_id) FROM menu_yemekleri WHERE menu_id=$MENU_OGLE")
  api PUT "/admin/menuler/$MENU_OGLE" "$T_ADMIN" "{\"ogrenci_fiyati\":31,\"personel_fiyati\":46,\"yemek_idleri\":[$YEMEKLER]}"
  komut docker compose exec -T redis redis-cli EXISTS "$KEY"
  komut docker compose logs uygulama --tail 3
  echo "--- Uygulama container'ı yeniden başlar, oturum düşmez"
  komut docker compose restart uygulama
  sleep 8
  api GET /auth/ben "$T_ADMIN"
  echo "--- Çıkış: oturum anahtarı silinir"
  api POST /auth/logout "$T_ADMIN"
  komut docker compose exec -T redis redis-cli EXISTS "oturum:$T_ADMIN"
} > "$OUT/asama3.txt" 2>&1

# --------------------------------------------------------------- AŞAMA 4
{
  echo "### Aşama 4 · Migration ve değişiklik talebi ($(date '+%d.%m.%Y %H:%M'))"; echo
  echo "--- Replikadan: migration ile gelen sütun ve tablo"
  komut docker compose exec -T mysql-replica mysql -uroot -pyemekhane_kok yemekhane -e "SHOW CREATE TABLE rezervasyonlar\G"
  komut docker compose exec -T mysql-replica mysql -uroot -pyemekhane_kok yemekhane -e "SHOW CREATE TABLE kullanici_alerjenleri\G"
  komut docker compose exec -T mysql-replica mysql -uroot -pyemekhane_kok yemekhane -e "SELECT durum, yarim_porsiyon, COUNT(*) AS adet FROM rezervasyonlar GROUP BY durum, yarim_porsiyon"
  T_M=$(giris murat.kaya@kampus.edu.tr)
  echo "--- Yarım porsiyon (personel, tam fiyatın %60'ı)"
  api POST /rezervasyon/yap "$T_M" "{\"menu_id\":$MENU_OGLE,\"yarim_porsiyon\":true}"
  echo "--- Kahvaltıda yarım porsiyon reddedilir"
  api POST /rezervasyon/yap "$T_M" "{\"menu_id\":$MENU_KAHVALTI,\"yarim_porsiyon\":true}"
  echo "--- Alerjen tercihi kaydet (1 = Gluten) ve menüde uyarı gör"
  api PUT /profil/alerjenler "$T_M" '{"alerjen_idleri":[1]}'
  api GET "/menu/gunluk?yemekhane_id=1&ogun_id=2&tarih=$YARIN" "$T_M"
  echo "--- Eski yapıdaki menü kayıtları açılışta temizlenir (uygulama günlüğü)"
  komut docker compose logs uygulama --tail 50 | grep -i "temizlendi"
} > "$OUT/asama4.txt" 2>&1

echo "Bitti. Çıktılar: $OUT/asama1.txt ... asama4.txt"
