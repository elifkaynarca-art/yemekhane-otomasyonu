'use strict';
// Tarih işlemleri Europe/Istanbul saatine göre yapılır (container saatinden bağımsız).
const TZ = 'Europe/Istanbul';

const bicim = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23'
});

function parcalar() {
  const p = {};
  for (const { type, value } of bicim.formatToParts(new Date())) p[type] = value;
  return p;
}

// "2026-11-23"
function bugun() {
  const p = parcalar();
  return `${p.year}-${p.month}-${p.day}`;
}

// Menü önbelleği "o günün sonuna kadar" yaşar; gece yarısına kalan saniye (en az 60)
function gunSonunaKalanSaniye() {
  const p = parcalar();
  const gecen = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
  return Math.max(60, 86400 - gecen);
}

function tarihGecerliMi(t) {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t;
}

function gunEkle(t, n) {
  const d = new Date(`${t}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

module.exports = { bugun, gunSonunaKalanSaniye, tarihGecerliMi, gunEkle };
