-- Menü kategorileri tablosu
CREATE TABLE IF NOT EXISTS menu_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id INTEGER REFERENCES menu_categories(id),
    order_index INTEGER DEFAULT 0
);

-- Menü tablosunu güncelle
DROP TABLE IF EXISTS menu CASCADE;
CREATE TABLE IF NOT EXISTS menu (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    category_id INTEGER REFERENCES menu_categories(id),
    order_index INTEGER DEFAULT 0
);

-- Siparişler tablosu
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    table_no INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sipariş detayları tablosu
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    menu_item_id INTEGER REFERENCES menu(id),
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- Sipariş arşiv tablosu
CREATE TABLE IF NOT EXISTS order_archive (
    id SERIAL PRIMARY KEY,
    order_id INTEGER,
    table_no INTEGER,
    status VARCHAR(20),
    timestamp TIMESTAMP,
    items JSONB
);

-- Ayarlar tablosu
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    value INTEGER NOT NULL
);

-- Varsayılan masa sayısını ekle (sadece tablo boşsa)
INSERT INTO settings (name, value) 
SELECT 'table_count', 20
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE name = 'table_count');