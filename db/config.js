const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'adisyon_db',
    password: 'alper123', // PostgreSQL şifrenizi buraya yazın
    port: 5432,
    max: 20, // maksimum bağlantı sayısı
    idleTimeoutMillis: 30000, // boşta kalma süresi
    connectionTimeoutMillis: 2000, // bağlantı zaman aşımı
});

// Bağlantı hatalarını dinle
pool.on('error', (err, client) => {
    console.error('Beklenmeyen veritabanı hatası:', err);
});

module.exports = pool; 