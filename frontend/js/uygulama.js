/* Yemekhane Otomasyonu · arayüz (HTML5 + CSS3 + fetch, çerçevesiz).
   İş kuralı burada yoktur: fiyat, süre, kapasite, yetki kararlarını API verir; arayüz yalnızca gösterir. */
(function () {
  'use strict';

  // ------------------------------------------------------------------ yardımcılar
  const $ = (secici, kok) => (kok || document).querySelector(secici);
  const $$ = (secici, kok) => Array.from((kok || document).querySelectorAll(secici));

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }
  const TL = (n) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
  const gunAdi = (t) => new Date(t + 'T00:00:00').toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  const kisaTarih = (t) => new Date(t + 'T00:00:00').toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // "2026-11-23 10:00:00" -> "23.11 10:00"
  const saatli = (z) => {
    const s = String(z || '');
    return s.length >= 16 ? s.slice(8, 10) + '.' + s.slice(5, 7) + ' ' + s.slice(11, 16) : s;
  };
  const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
  function gunEkle(t, n) {
    const d = new Date(t + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  let token = null;
  try { token = localStorage.getItem('token'); } catch (e) { /* depolama kapalı olabilir */ }
  let kullanici = null;
  let referans = null;
  let haftaBaslangic = bugun();
  let bildirimZamanlayici = null;

  async function api(yol, secenekler) {
    const s = secenekler || {};
    const basliklar = {};
    if (s.govde !== undefined) basliklar['Content-Type'] = 'application/json';
    if (token) basliklar.Authorization = 'Bearer ' + token;

    let yanit;
    try {
      yanit = await fetch('/api' + yol, {
        method: s.method || 'GET',
        headers: basliklar,
        body: s.govde !== undefined ? JSON.stringify(s.govde) : undefined
      });
    } catch (e) {
      throw new Error('Sunucuya ulaşılamadı. Lütfen tekrar deneyin.');
    }
    let veri = null;
    try { veri = await yanit.json(); } catch (e) { /* JSON olmayabilir (ör. 503 sayfası) */ }

    if (yanit.status === 401 && token) {
      oturumuTemizle();
      girisEkraniniGoster();
      throw new Error((veri && veri.hata) || 'Oturum süresi doldu, lütfen yeniden giriş yapın.');
    }
    if (!yanit.ok) throw new Error((veri && veri.hata) || 'İstek başarısız oldu.');
    return veri;
  }

  function bildir(mesaj, tur) {
    const kutu = $('#bildirim');
    clearTimeout(bildirimZamanlayici);
    kutu.textContent = mesaj;
    kutu.className = 'bildirim ' + (tur === 'basari' ? 'bildirim-basari' : 'bildirim-hata');
    kutu.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tur === 'basari') bildirimZamanlayici = setTimeout(() => { kutu.hidden = true; }, 6000);
  }
  const bildirimiKapat = () => { $('#bildirim').hidden = true; };

  // İşlemi çalıştırır; hata mesajını (yordamdan gelen Türkçe metin dahil) olduğu gibi gösterir
  async function guvenli(is) {
    try { await is(); } catch (e) { bildir(e.message, 'hata'); }
  }

  function bakiyeGoster(bakiye) {
    if (bakiye === undefined || bakiye === null) return;
    $('#kb-bakiye').textContent = TL(bakiye);
    $('#bk-bakiye').textContent = TL(bakiye);
  }

  // ------------------------------------------------------------------ oturum / gezinme
  function oturumuTemizle() {
    token = null;
    kullanici = null;
    try { localStorage.removeItem('token'); } catch (e) { /* yoksay */ }
  }

  function girisEkraniniGoster() {
    $('#ekran-giris').hidden = false;
    $('#sekmeler').hidden = true;
    $('#kullanici-bilgi').hidden = true;
    $$('.ekran').forEach((e) => { e.hidden = true; });
  }

  async function uygulamayiAc() {
    $('#ekran-giris').hidden = true;
    $('#sekmeler').hidden = false;
    $('#kullanici-bilgi').hidden = false;
    $('#kb-ad').textContent = kullanici.ad + ' ' + kullanici.soyad + ' · ' + kullanici.rol;
    $('#sekme-yonetici').hidden = kullanici.rol !== 'yonetici';

    if (!referans) referans = await api('/referans');
    seciciDoldur($('#gm-yemekhane'), referans.yemekhaneler);
    seciciDoldur($('#hf-yemekhane'), referans.yemekhaneler);
    seciciDoldur($('#mn-yemekhane'), referans.yemekhaneler);
    seciciDoldur($('#tr-yemekhane'), referans.yemekhaneler);
    seciciDoldur($('#gm-ogun'), referans.ogunler);
    seciciDoldur($('#mn-ogun'), referans.ogunler);
    $('#gm-ogun').value = '2';
    $('#gm-tarih').value = bugun();

    try {
      const b = await api('/bakiye');
      bakiyeGoster(b.bakiye);
    } catch (e) { /* üst bilgi bakiyesi zorunlu değil */ }

    ekranGoster('gunun-menusu');
  }

  function seciciDoldur(secici, liste) {
    secici.innerHTML = liste.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.ad) + '</option>').join('');
  }

  const yukleyiciler = {
    'gunun-menusu': gununMenusuGetir,
    haftalik: haftalikGetir,
    rezervasyonlarim: rezervasyonlarimGetir,
    bakiye: bakiyeGetir,
    degerlendirme: degerlendirmeGetir,
    profil: profilGetir,
    yonetici: yoneticiAc
  };

  function ekranGoster(ad) {
    bildirimiKapat();
    $$('.ekran').forEach((e) => { e.hidden = e.id !== 'ekran-' + ad; });
    $$('#sekmeler button').forEach((b) => {
      if (b.dataset.ekran === ad) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    guvenli(yukleyiciler[ad]);
  }

  // ------------------------------------------------------------------ ekran 2: günün menüsü
  function yemekSatiri(y) {
    const uyari = y.alerjen_uyarisi && y.alerjen_uyarisi.length
      ? '<br><span class="rozet-kucuk rozet-uyari">⚠ Alerjen uyarısı: ' + esc(y.alerjen_uyarisi.join(', ')) + '</span>' : '';
    return '<li><span class="kategori">' + esc(y.kategori) + '</span>' + esc(y.ad) +
      ' <span class="meta">(' + esc(y.kalori) + ' kcal)</span>' +
      (y.vejetaryen ? '<span class="rozet-kucuk">🌱 Vejetaryen</span>' : '') +
      (y.alerjenler.length ? '<br><span class="alerjen-metin">İçerir: ' + esc(y.alerjenler.join(', ')) + '</span>' : '') +
      uyari + '</li>';
  }

  async function gununMenusuGetir() {
    const q = new URLSearchParams({
      yemekhane_id: $('#gm-yemekhane').value,
      ogun_id: $('#gm-ogun').value,
      tarih: $('#gm-tarih').value || bugun()
    });
    const m = await api('/menu/gunluk?' + q.toString());
    const hedef = $('#gm-sonuc');
    if (!m.bulundu) { hedef.innerHTML = '<p>' + esc(m.mesaj) + '</p>'; return; }
    hedef.innerHTML =
      '<div class="mini-kart' + (m.alerjen_uyarisi_var ? ' uyari' : '') + '">' +
      '<div class="mini-baslik"><strong>' + esc(m.yemekhane) + ' · ' + esc(m.ogun) + '</strong>' +
      '<span class="fiyat">' + TL(m.fiyat) + '</span></div>' +
      '<p class="meta">' + esc(gunAdi(m.tarih)) + ' · Rezervasyon son: ' + esc(saatli(m.rezervasyon_son)) +
      ' · Boş yer: ' + esc(m.bos_yer) + '</p>' +
      (m.alerjen_uyarisi_var ? '<p class="bildirim bildirim-hata">⚠ Bu menüde profilinizdeki alerjenlerle eşleşen yemekler var.</p>' : '') +
      '<ul class="yemek-listesi">' + m.yemekler.map(yemekSatiri).join('') + '</ul>' +
      '<p><strong>Toplam: ' + esc(m.toplam_kalori) + ' kcal</strong></p></div>';
  }

  // ------------------------------------------------------------------ ekran 3: haftalık menü + rezervasyon
  async function haftalikGetir() {
    const q = new URLSearchParams({ yemekhane_id: $('#hf-yemekhane').value, baslangic: haftaBaslangic });
    const v = await api('/menu/haftalik?' + q.toString());
    $('#hf-aralik').textContent = kisaTarih(v.baslangic) + ' – ' + kisaTarih(v.bitis);
    const hedef = $('#hf-sonuc');
    if (!v.gunler.length) { hedef.innerHTML = '<p>Bu hafta için menü bulunamadı.</p>'; return; }

    hedef.innerHTML = v.gunler.map((g) =>
      '<h3 class="gun-baslik">' + esc(gunAdi(g.tarih)) + '</h3>' + g.menuler.map(menuKarti).join('')
    ).join('');
  }

  function menuKarti(m) {
    const yemekAdlari = m.yemekler.map((y) => esc(y.ad)).join(', ');
    const uyari = m.alerjen_uyarisi_var
      ? '<p><span class="rozet-kucuk rozet-uyari">⚠ Alerjen uyarısı</span> ' + esc(
        Array.from(new Set(m.yemekler.flatMap((y) => y.alerjen_uyarisi))).join(', ')) + '</p>' : '';
    const yarimSecenek = m.yarim_fiyat === null
      ? '<option value="0" selected>Tam porsiyon · ' + TL(m.fiyat) + '</option>'
      : '<option value="0" selected>Tam porsiyon · ' + TL(m.fiyat) + '</option>' +
        '<option value="1">Yarım porsiyon · ' + TL(m.yarim_fiyat) + '</option>';

    return '<div class="mini-kart' + (m.alerjen_uyarisi_var ? ' uyari' : '') + '">' +
      '<div class="mini-baslik"><strong>' + esc(m.ogun) + '</strong><span class="fiyat">' + TL(m.fiyat) + '</span></div>' +
      '<p class="meta">Son rezervasyon: ' + esc(saatli(m.rezervasyon_son)) + ' · Boş yer: ' + esc(m.bos_yer) + ' / ' + esc(m.kapasite) +
      ' · ' + esc(m.toplam_kalori) + ' kcal</p>' +
      '<p>' + yemekAdlari + '</p>' + uyari +
      '<div class="rezervasyon-satir">' +
      '<select aria-label="Porsiyon" data-porsiyon="' + esc(m.menu_id) + '"' + (m.rezervasyon_yapilabilir ? '' : ' disabled') + '>' + yarimSecenek + '</select>' +
      '<button type="button" class="dugme" data-rezerve="' + esc(m.menu_id) + '"' + (m.rezervasyon_yapilabilir ? '' : ' disabled aria-disabled="true"') + '>' +
      esc(m.rezervasyon_yapilabilir ? 'Rezervasyon yap' : m.durum_metni || 'Rezervasyon yapılamaz') + '</button>' +
      '</div></div>';
  }

  async function rezervasyonYap(menuId) {
    const secim = $('[data-porsiyon="' + menuId + '"]');
    const sonuc = await api('/rezervasyon/yap', {
      method: 'POST',
      govde: { menu_id: Number(menuId), yarim_porsiyon: secim && secim.value === '1' }
    });
    bakiyeGoster(sonuc.bakiye);
    bildir(sonuc.mesaj + ' Ücret: ' + TL(sonuc.ucret) + ' · Kalan bakiye: ' + TL(sonuc.bakiye), 'basari');
    await haftalikGetir();
  }

  // ------------------------------------------------------------------ ekran 4: rezervasyonlarım
  const DURUM = { aktif: 'Aktif', kullanildi: 'Kullanıldı', iptal: 'İptal' };

  async function rezervasyonlarimGetir() {
    const v = await api('/rezervasyon');
    const hedef = $('#rz-sonuc');
    if (!v.rezervasyonlar.length) { hedef.innerHTML = '<p>Henüz rezervasyonunuz yok.</p>'; return; }
    hedef.innerHTML = v.rezervasyonlar.map((r) =>
      '<div class="mini-kart"><div class="mini-baslik"><strong>' + esc(gunAdi(r.tarih)) + ' · ' + esc(r.ogun) + '</strong>' +
      '<span class="rozet-kucuk durum-' + esc(r.durum) + '">' + esc(DURUM[r.durum] || r.durum) + '</span></div>' +
      '<p class="meta">' + esc(r.yemekhane) + ' · ' + (r.yarim_porsiyon ? 'Yarım porsiyon' : 'Tam porsiyon') +
      ' · ' + TL(r.ucret) + '<br>Son iptal saati: ' + esc(saatli(r.rezervasyon_son)) + '</p>' +
      (r.iptal_edilebilir ? '<button type="button" class="dugme dugme-tehlike dugme-kucuk" data-iptal="' + esc(r.id) + '">Rezervasyonu iptal et</button>' : '') +
      '</div>'
    ).join('');
  }

  async function rezervasyonIptal(id) {
    if (!window.confirm('Rezervasyon iptal edilsin ve ücret iade edilsin mi?')) return;
    const s = await api('/rezervasyon/iptal/' + encodeURIComponent(id), { method: 'POST' });
    bakiyeGoster(s.bakiye);
    bildir(s.mesaj + ' İade: ' + TL(s.iade), 'basari');
    await rezervasyonlarimGetir();
  }

  // ------------------------------------------------------------------ ekran 5: bakiye
  const TUR = { yukleme: 'Yükleme', rezervasyon: 'Rezervasyon', iade: 'İade' };

  async function bakiyeGetir() {
    const v = await api('/bakiye');
    bakiyeGoster(v.bakiye);
    $('#bk-hareketler').innerHTML = v.hareketler.length
      ? '<table><thead><tr><th>Tarih</th><th>İşlem</th><th class="sag">Tutar</th></tr></thead><tbody>' +
        v.hareketler.map((h) =>
          '<tr><td>' + esc(saatli(h.olusturma)) + '</td><td>' + esc(TUR[h.tur] || h.tur) +
          (h.aciklama ? '<br><span class="alerjen-metin">' + esc(h.aciklama) + '</span>' : '') + '</td>' +
          '<td class="sag ' + (h.tutar >= 0 ? 'pozitif' : 'negatif') + '">' + (h.tutar >= 0 ? '+' : '') + TL(h.tutar) + '</td></tr>'
        ).join('') + '</tbody></table>'
      : '<p>Hareket yok.</p>';
  }

  async function bakiyeYukle(olay) {
    olay.preventDefault();
    const s = await api('/bakiye/yukle', { method: 'POST', govde: { tutar: $('#bk-tutar').value } });
    $('#bk-tutar').value = '';
    bakiyeGoster(s.bakiye);
    bildir(s.mesaj + ' Güncel bakiye: ' + TL(s.bakiye), 'basari');
    await bakiyeGetir();
  }

  // ------------------------------------------------------------------ ekran 6: değerlendirme
  async function degerlendirmeGetir() {
    const v = await api('/degerlendirme');
    const hedef = $('#dg-sonuc');
    if (!v.menuler.length) {
      hedef.innerHTML = '<p>Henüz kullandığınız bir menü yok. Turnikeden geçtiğiniz menüler burada görünür.</p>';
      return;
    }
    hedef.innerHTML = v.menuler.map((m) => {
      const baslik = '<div class="mini-baslik"><strong>' + esc(gunAdi(m.tarih)) + ' · ' + esc(m.ogun) + '</strong>' +
        '<span class="meta">' + esc(m.yemekhane) + '</span></div>';
      if (m.puan) {
        return '<div class="mini-kart">' + baslik + '<p>Puanınız: <strong>' + '★'.repeat(m.puan) + '☆'.repeat(5 - m.puan) +
          '</strong> (' + esc(m.puan) + '/5)</p>' + (m.yorum ? '<p>“' + esc(m.yorum) + '”</p>' : '') + '</div>';
      }
      return '<div class="mini-kart">' + baslik +
        '<form class="puan-form" data-menu="' + esc(m.menu_id) + '">' +
        '<label>Puan <select name="puan" required><option value="">Seçiniz</option>' +
        [5, 4, 3, 2, 1].map((p) => '<option value="' + p + '">' + p + ' – ' + '★'.repeat(p) + '</option>').join('') + '</select></label>' +
        '<label>Yorum (isteğe bağlı)<textarea name="yorum" maxlength="500"></textarea></label>' +
        '<button type="submit" class="dugme">Değerlendir</button></form></div>';
    }).join('');
  }

  async function degerlendirmeGonder(form) {
    const veri = new FormData(form);
    const s = await api('/degerlendirme', {
      method: 'POST',
      govde: { menu_id: Number(form.dataset.menu), puan: Number(veri.get('puan')), yorum: veri.get('yorum') }
    });
    bildir(s.mesaj, 'basari');
    await degerlendirmeGetir();
  }

  // ------------------------------------------------------------------ profil: alerjen tercihleri
  async function profilGetir() {
    const v = await api('/profil/alerjenler');
    const secili = new Set(v.secili);
    $('#pf-liste').innerHTML = v.alerjenler.map((a) =>
      '<label><input type="checkbox" name="alerjen" value="' + esc(a.id) + '"' + (secili.has(a.id) ? ' checked' : '') + '> ' + esc(a.ad) + '</label>'
    ).join('');
  }

  async function profilKaydet(olay) {
    olay.preventDefault();
    const idler = $$('#pf-liste input:checked').map((x) => Number(x.value));
    const s = await api('/profil/alerjenler', { method: 'PUT', govde: { alerjen_idleri: idler } });
    bildir(s.mesaj, 'basari');
  }

  // ------------------------------------------------------------------ ekran 7: yönetici paneli
  let yemekListesi = null;

  async function yoneticiAc() {
    if (!$('#yn-bas').value) {
      $('#yn-bas').value = gunEkle(bugun(), -7);
      $('#yn-bit').value = gunEkle(bugun(), 13);
    }
    if (!$('#mn-tarih').value) $('#mn-tarih').value = bugun();
    if (!yemekListesi) {
      yemekListesi = (await api('/admin/yemekler')).yemekler;
      yemekKutulariniCiz([]);
    }
    await yoneticiListele();
  }

  function yemekKutulariniCiz(secili) {
    const sec = new Set(secili);
    let html = '';
    let kategori = null;
    for (const y of yemekListesi) {
      if (y.kategori !== kategori) { kategori = y.kategori; html += '<h4>' + esc(kategori) + '</h4>'; }
      html += '<label><input type="checkbox" name="yemek" value="' + esc(y.id) + '"' + (sec.has(y.id) ? ' checked' : '') + '> ' +
        esc(y.ad) + ' <span class="meta">(' + esc(y.kalori) + ' kcal)</span></label>';
    }
    $('#mn-yemekler').innerHTML = html;
  }

  async function yoneticiListele() {
    const q = new URLSearchParams({ baslangic: $('#yn-bas').value, bitis: $('#yn-bit').value });
    const v = await api('/admin/menuler?' + q.toString());
    $('#yn-liste').innerHTML = v.menuler.length
      ? '<table><thead><tr><th>Tarih</th><th>Yemekhane / öğün</th><th class="sag">Doluluk</th><th class="sag">Puan</th><th></th></tr></thead><tbody>' +
        v.menuler.map((m) =>
          '<tr><td>' + esc(kisaTarih(m.tarih)) + '</td><td>' + esc(m.yemekhane) + '<br>' + esc(m.ogun) + '</td>' +
          '<td class="sag">' + esc(m.rezerve) + ' / ' + esc(m.kapasite) + '<br>%' + esc(m.doluluk_yuzde) + '</td>' +
          '<td class="sag">' + (m.oy_sayisi ? esc(m.ortalama_puan) + ' ★<br>(' + esc(m.oy_sayisi) + ' oy)' : '—') + '</td>' +
          '<td><button type="button" class="dugme dugme-ikincil dugme-kucuk" data-duzenle="' + esc(m.menu_id) + '">Düzenle</button></td></tr>'
        ).join('') + '</tbody></table>'
      : '<p>Bu aralıkta menü yok.</p>';
  }

  async function menuDuzenle(id) {
    const m = await api('/admin/menuler/' + encodeURIComponent(id));
    $('#mn-id').value = m.menu_id;
    $('#mn-yemekhane').value = m.yemekhane_id;
    $('#mn-ogun').value = m.ogun_id;
    $('#mn-tarih').value = m.tarih;
    $('#mn-ogr').value = m.ogrenci_fiyati;
    $('#mn-per').value = m.personel_fiyati;
    ['#mn-yemekhane', '#mn-ogun', '#mn-tarih'].forEach((s) => { $(s).disabled = true; });
    yemekKutulariniCiz(m.yemek_idleri);
    $('#yn-form-baslik').textContent = 'Menüyü düzenle (#' + m.menu_id + ')';
    $('#mn-iptal').hidden = false;
    $('#form-menu').scrollIntoView({ behavior: 'smooth' });
  }

  function menuFormunuSifirla() {
    $('#form-menu').reset();
    $('#mn-id').value = '';
    ['#mn-yemekhane', '#mn-ogun', '#mn-tarih'].forEach((s) => { $(s).disabled = false; });
    $('#mn-tarih').value = bugun();
    yemekKutulariniCiz([]);
    $('#yn-form-baslik').textContent = 'Yeni menü oluştur';
    $('#mn-iptal').hidden = true;
  }

  async function menuKaydet(olay) {
    olay.preventDefault();
    const govde = {
      ogrenci_fiyati: $('#mn-ogr').value,
      personel_fiyati: $('#mn-per').value,
      yemek_idleri: $$('#mn-yemekler input:checked').map((x) => Number(x.value))
    };
    const id = $('#mn-id').value;
    let sonuc;
    if (id) {
      sonuc = await api('/admin/menuler/' + encodeURIComponent(id), { method: 'PUT', govde });
    } else {
      govde.yemekhane_id = Number($('#mn-yemekhane').value);
      govde.ogun_id = Number($('#mn-ogun').value);
      govde.tarih = $('#mn-tarih').value;
      sonuc = await api('/admin/menuler', { method: 'POST', govde });
    }
    bildir(sonuc.mesaj, 'basari');
    menuFormunuSifirla();
    await yoneticiListele();
  }

  async function turnikeGecis(olay) {
    olay.preventDefault();
    const s = await api('/admin/turnike', {
      method: 'POST',
      govde: {
        kullanici_id: Number($('#tr-kullanici').value),
        yemekhane_id: Number($('#tr-yemekhane').value),
        zaman: $('#tr-zaman').value || null
      }
    });
    bildir(s.mesaj, 'basari');
  }

  // ------------------------------------------------------------------ olaylar
  document.addEventListener('DOMContentLoaded', () => {
    $('#form-giris').addEventListener('submit', (olay) => {
      olay.preventDefault();
      guvenli(async () => {
        const s = await api('/auth/login', {
          method: 'POST',
          govde: { eposta: $('#giris-eposta').value, sifre: $('#giris-sifre').value }
        });
        token = s.token;
        kullanici = s.kullanici;
        try { localStorage.setItem('token', token); } catch (e) { /* yoksay */ }
        $('#giris-sifre').value = '';
        bildirimiKapat();
        await uygulamayiAc();
      });
    });

    $('#btn-cikis').addEventListener('click', () => guvenli(async () => {
      try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* oturum zaten düşmüş olabilir */ }
      oturumuTemizle();
      bildirimiKapat();
      girisEkraniniGoster();
    }));

    $('#sekmeler').addEventListener('click', (olay) => {
      const dugme = olay.target.closest('button[data-ekran]');
      if (dugme) ekranGoster(dugme.dataset.ekran);
    });

    $('#form-gunun-menusu').addEventListener('submit', (o) => { o.preventDefault(); guvenli(gununMenusuGetir); });

    $('#hf-yemekhane').addEventListener('change', () => guvenli(haftalikGetir));
    $('#hf-onceki').addEventListener('click', () => { haftaBaslangic = gunEkle(haftaBaslangic, -7); guvenli(haftalikGetir); });
    $('#hf-sonraki').addEventListener('click', () => { haftaBaslangic = gunEkle(haftaBaslangic, 7); guvenli(haftalikGetir); });
    $('#hf-sonuc').addEventListener('click', (olay) => {
      const d = olay.target.closest('button[data-rezerve]');
      if (d && !d.disabled) guvenli(() => rezervasyonYap(d.dataset.rezerve));
    });

    $('#rz-sonuc').addEventListener('click', (olay) => {
      const d = olay.target.closest('button[data-iptal]');
      if (d) guvenli(() => rezervasyonIptal(d.dataset.iptal));
    });

    $('#form-bakiye').addEventListener('submit', (o) => guvenli(() => bakiyeYukle(o)));

    $('#dg-sonuc').addEventListener('submit', (olay) => {
      olay.preventDefault();
      guvenli(() => degerlendirmeGonder(olay.target));
    });

    $('#form-profil').addEventListener('submit', (o) => guvenli(() => profilKaydet(o)));

    $('#form-yn-filtre').addEventListener('submit', (o) => { o.preventDefault(); guvenli(yoneticiListele); });
    $('#form-menu').addEventListener('submit', (o) => guvenli(() => menuKaydet(o)));
    $('#mn-iptal').addEventListener('click', menuFormunuSifirla);
    $('#yn-liste').addEventListener('click', (olay) => {
      const d = olay.target.closest('button[data-duzenle]');
      if (d) guvenli(() => menuDuzenle(d.dataset.duzenle));
    });
    $('#form-turnike').addEventListener('submit', (o) => guvenli(() => turnikeGecis(o)));

    // Sayfa yenilenince oturum Redis'te duruyorsa kaldığı yerden devam eder
    if (token) {
      api('/auth/ben')
        .then((s) => { kullanici = s.kullanici; return uygulamayiAc(); })
        .catch(() => { oturumuTemizle(); girisEkraniniGoster(); });
    } else {
      girisEkraniniGoster();
    }
  });
})();
