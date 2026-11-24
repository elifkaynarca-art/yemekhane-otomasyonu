'use strict';
const mysql = require('mysql2/promise');

const ortak = {
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_KULLANICI || 'yemekhane_app',
  password: process.env.DB_SIFRE || 'Uyg_2026',
  database: process.env.DB_ADI || 'yemekhane',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  dateStrings: true,     // DATE/DATETIME "2026-11-23" / "2026-11-23 12:00:00" olarak gelir
  decimalNumbers: true   // DECIMAL alanları string yerine sayı olarak gelir
};

// Yazma trafiği -> mysql-primary (kaynak)
const primaryPool = mysql.createPool({
  ...ortak,
  host: process.env.DB_YAZMA_HOST || 'mysql-primary'
});

// Okuma trafiği -> mysql-replica (salt okunur)
const replicaPool = mysql.createPool({
  ...ortak,
  host: process.env.DB_OKUMA_HOST || 'mysql-replica'
});

module.exports = { primaryPool, replicaPool };
