const mysql = require('mysql2/promise');

// Yazma Trafiği -> mysql-primary (Master)
const primaryPool = mysql.createPool({
  host: process.env.DB_YAZMA_HOST || 'mysql-primary',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_KULLANICI || 'yemekhane_app',
  password: process.env.DB_SIFRE || 'Uyg_2026',
  database: process.env.DB_ADI || 'yemekhane',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

// Okuma Trafiği -> mysql-replica (Read Replica)
const replicaPool = mysql.createPool({
  host: process.env.DB_OKUMA_HOST || 'mysql-replica',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_KULLANICI || 'yemekhane_app',
  password: process.env.DB_SIFRE || 'Uyg_2026',
  database: process.env.DB_ADI || 'yemekhane',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
});

module.exports = { primaryPool, replicaPool };