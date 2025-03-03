const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'adisyon_db',
    password: 'alper123', // PostgreSQL şifrenizi buraya yazın
    port: 5432,
});

module.exports = pool; 