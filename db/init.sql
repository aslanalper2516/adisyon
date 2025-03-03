-- Menü tablosu
CREATE TABLE IF NOT EXISTS menu (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(10,2) NOT NULL
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

-- Varsayılan masa sayısını ekle
INSERT INTO settings (name, value) VALUES ('table_count', 20) ON CONFLICT (name) DO UPDATE SET value = 20; 