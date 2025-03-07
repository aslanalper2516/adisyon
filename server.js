const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const pool = require('./db/config');
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());

// Veritabanı tablolarını oluştur
async function initDatabase() {
    try {
        const initSQL = fs.readFileSync('./db/init.sql', 'utf8');
        await pool.query(initSQL);
        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Database initialization error:', err);
    }
}

// Server başlatılmadan önce veritabanını hazırla
initDatabase().then(() => {
    // Socket.io bağlantı yönetimi
    io.on('connection', async (socket) => {
        try {
            const activeOrders = await getActiveOrders();
            socket.emit('orders-updated', activeOrders);
        } catch (err) {
            console.error('Başlangıç sipariş yükleme hatası:', err);
        }
        
        console.log('New client connected'); // Debug için log ekleyelim
        
        // Yeni sipariş geldiğinde
        socket.on('new-order', async (order) => {
            try {
                console.log('Received new order:', order);
                
                // Yeni siparişi veritabanına ekle
                const orderResult = await pool.query(
                    'INSERT INTO orders (table_no, status) VALUES ($1, $2) RETURNING id',
                    [order.tableNo, 'waiting']
                );
                
                const orderId = orderResult.rows[0].id;
                
                // Sipariş detaylarını ekle
                for (const item of order.items) {
                    await pool.query(
                        'INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES ($1, $2, $3, $4)',
                        [orderId, item.id, item.quantity, item.price]
                    );
                }
                
                // Tüm aktif siparişleri getir
                const result = await pool.query(`
                    SELECT orders.*, 
                           json_agg(json_build_object(
                               'id', order_items.id,
                               'name', menu.name,
                               'price', order_items.price,
                               'quantity', order_items.quantity
                           )) as items
                    FROM orders
                    LEFT JOIN order_items ON orders.id = order_items.order_id
                    LEFT JOIN menu ON order_items.menu_item_id = menu.id
                    WHERE orders.status != 'completed'
                    GROUP BY orders.id, orders.table_no, orders.status, orders.timestamp
                    ORDER BY orders.timestamp ASC
                `);
                
                // Tüm bağlı clientlara güncel sipariş listesini gönder
                io.emit('orders-updated', result.rows);
            } catch (err) {
                console.error('Sipariş ekleme hatası:', err);
            }
        });

        // Sipariş durumu güncellendiğinde
        socket.on('update-order-status', async (data) => {
            try {
                await pool.query(
                    'UPDATE orders SET status = $1 WHERE id = $2',
                    [data.status, data.orderId]
                );
                
                // Tüm aktif siparişleri getir
                const result = await pool.query(`
                    SELECT orders.*, 
                           json_agg(json_build_object(
                               'id', order_items.id,
                               'name', menu.name,
                               'price', order_items.price,
                               'quantity', order_items.quantity
                           )) as items
                    FROM orders
                    LEFT JOIN order_items ON orders.id = order_items.order_id
                    LEFT JOIN menu ON order_items.menu_item_id = menu.id
                    WHERE orders.status != 'completed'
                    GROUP BY orders.id, orders.table_no, orders.status, orders.timestamp
                    ORDER BY orders.timestamp ASC
                `);
                
                io.emit('orders-updated', result.rows);
            } catch (err) {
                console.error('Durum güncelleme hatası:', err);
            }
        });

        // Sipariş teslim edildiğinde
        socket.on('deliver-order', async (data) => {
            try {
                console.log('Sipariş teslim ediliyor:', data);
                
                // Siparişi completed olarak güncelle
                await pool.query(
                    'UPDATE orders SET status = $1 WHERE table_no = $2 AND status = $3',
                    ['completed', data.tableNo, 'ready']
                );
                
                // Güncel siparişleri al ve gönder
                const activeOrders = await getActiveOrders();
                io.emit('orders-updated', activeOrders);
                
            } catch (err) {
                console.error('Sipariş teslim etme hatası:', err);
            }
        });

        // Hesap tamamlandığında
        socket.on('complete-bill', async (data) => {
            try {
                const { tableNo } = data;
                console.log('Completing bill for table:', tableNo);
                
                // Önce siparişleri arşive taşı
                await pool.query(`
                    INSERT INTO order_archive (order_id, table_no, status, timestamp, items)
                    SELECT 
                        o.id,
                        o.table_no,
                        o.status,
                        o.timestamp,
                        json_agg(
                            json_build_object(
                                'name', m.name,
                                'quantity', oi.quantity,
                                'price', oi.price
                            )
                        ) as items
                    FROM orders o
                    JOIN order_items oi ON o.id = oi.order_id
                    JOIN menu m ON oi.menu_item_id = m.id
                    WHERE o.table_no = $1
                    GROUP BY o.id, o.table_no, o.status, o.timestamp
                `, [tableNo]);
                
                // Önce order_items tablosundan ilgili kayıtları sil
                await pool.query(`
                    DELETE FROM order_items 
                    WHERE order_id IN (
                        SELECT id FROM orders WHERE table_no = $1
                    )
                `, [tableNo]);
                
                // Sonra orders tablosundan kayıtları sil
                await pool.query('DELETE FROM orders WHERE table_no = $1', [tableNo]);
                
                // Güncel siparişleri getir ve yayınla
                const orders = await getActiveOrders();
                io.emit('orders-updated', orders);
                
                console.log('Bill completed and orders cleared for table:', tableNo);
            } catch (err) {
                console.error('Hesap tamamlama hatası:', err);
            }
        });

        // Masa sayısı güncellendiğinde
        socket.on('table-count-updated', (data) => {
            io.emit('table-count-changed', data);
        });
    });

    // Menü işlemleri
    app.get('/menu', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT menu.*, menu_categories.name as category_name 
                FROM menu 
                LEFT JOIN menu_categories ON menu.category_id = menu_categories.id
                ORDER BY menu.order_index
            `);
            res.json({ items: result.rows });
        } catch (err) {
            console.error('Menü yükleme hatası:', err);
            res.status(500).json({ error: 'Menü yüklenirken bir hata oluştu' });
        }
    });

    app.post('/menu', async (req, res) => {
        const { name, price, category_id } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO menu (name, price, category_id) VALUES ($1, $2, $3) RETURNING *',
                [name, price, category_id]
            );
            const menuResult = await pool.query('SELECT * FROM menu ORDER BY name');
            res.status(201).json({ items: menuResult.rows });
        } catch (err) {
            console.error('Ürün ekleme hatası:', err);
            res.status(500).json({ error: 'Ürün eklenemedi' });
        }
    });

    app.delete('/menu', async (req, res) => {
        const { id } = req.body;
        try {
            await pool.query('DELETE FROM menu WHERE id = $1', [id]);
            const result = await pool.query('SELECT * FROM menu ORDER BY name');
            res.json({ items: result.rows });
        } catch (err) {
            res.status(500).json({ error: 'Ürün silme hatası' });
        }
    });

    // Masa siparişlerini getir
    app.get('/table-orders/:tableNo', async (req, res) => {
        try {
            const { tableNo } = req.params;
            const result = await pool.query(`
                SELECT 
                    o.id, 
                    o.table_no as "tableNo",
                    o.status,
                    o.timestamp,
                    json_agg(
                        json_build_object(
                            'name', m.name,
                            'quantity', oi.quantity,
                            'price', oi.price
                        )
                    ) as items
                FROM orders o
                JOIN order_items oi ON o.id = oi.order_id
                JOIN menu m ON oi.menu_item_id = m.id
                WHERE o.table_no = $1
                GROUP BY o.id, o.table_no, o.status, o.timestamp
                ORDER BY o.timestamp DESC
            `, [tableNo]);
            
            res.json({ orders: result.rows });
        } catch (err) {
            console.error('Masa siparişleri getirme hatası:', err);
            res.status(500).json({ error: 'Masa siparişleri getirilemedi' });
        }
    });

    // Masa sayısını getir
    app.get('/settings/table-count', async (req, res) => {
        try {
            const result = await pool.query(
                'SELECT value FROM settings WHERE name = $1',
                ['table_count']
            );
            if (result.rows.length > 0) {
                res.json({ value: result.rows[0].value });
            } else {
                // Sadece ilk kez çalıştığında varsayılan değeri ekle
                await pool.query(
                    'INSERT INTO settings (name, value) VALUES ($1, $2)',
                    ['table_count', 20]
                );
                res.json({ value: 20 });
            }
        } catch (err) {
            console.error('Masa sayısı getirme hatası:', err);
            res.status(500).json({ error: 'Masa sayısı alınamadı', value: 20 });
        }
    });

    // Masa sayısını güncelle
    app.post('/settings/table-count', async (req, res) => {
        try {
            const { value } = req.body;
            await pool.query(
                'UPDATE settings SET value = $1 WHERE name = $2',
                [value, 'table_count']
            );
            res.json({ success: true });
        } catch (err) {
            console.error('Masa sayısı güncelleme hatası:', err);
            res.status(500).json({ error: 'Masa sayısı güncellenemedi' });
        }
    });

    // Aktif siparişleri getiren yardımcı fonksiyon
    async function getActiveOrders() {
        try {
            const result = await pool.query(`
                SELECT orders.*, 
                       json_agg(json_build_object(
                           'id', order_items.id,
                           'name', menu.name,
                           'price', order_items.price,
                           'quantity', order_items.quantity
                       )) as items
                FROM orders
                LEFT JOIN order_items ON orders.id = order_items.order_id
                LEFT JOIN menu ON order_items.menu_item_id = menu.id
                WHERE orders.status IN ('waiting', 'preparing', 'ready', 'completed')
                GROUP BY orders.id, orders.table_no, orders.status, orders.timestamp
                ORDER BY orders.timestamp ASC
            `);
            return result.rows;
        } catch (err) {
            console.error('Aktif siparişleri getirme hatası:', err);
            return [];
        }
    }

    // Kategorileri getir
    app.get('/menu-categories', async (req, res) => {
        try {
            const result = await pool.query('SELECT * FROM menu_categories ORDER BY order_index');
            res.json(result.rows);
        } catch (err) {
            res.status(500).json({ error: 'Kategoriler getirilemedi' });
        }
    });

    // Yeni kategori ekle
    app.post('/menu-categories', async (req, res) => {
        const { name, parent_id } = req.body;
        try {
            const result = await pool.query(
                'INSERT INTO menu_categories (name, parent_id) VALUES ($1, $2) RETURNING *',
                [name, parent_id]
            );
            res.status(201).json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: 'Kategori eklenemedi' });
        }
    });

    // Kategori sil (recursive silme ile)
    app.delete('/menu-categories/:id', async (req, res) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            // Recursive olarak tüm alt kategorileri ve ürünleri sil
            async function deleteRecursive(categoryId) {
                // Alt kategorileri bul
                const subCategories = await client.query(
                    'SELECT id FROM menu_categories WHERE parent_id = $1',
                    [categoryId]
                );
                
                // Alt kategorileri recursive olarak sil
                for (const row of subCategories.rows) {
                    await deleteRecursive(row.id);
                }
                
                // Bu kategoriye ait ürünleri sil
                await client.query('DELETE FROM menu WHERE category_id = $1', [categoryId]);
                
                // Kategoriyi sil
                await client.query('DELETE FROM menu_categories WHERE id = $1', [categoryId]);
            }
            
            await deleteRecursive(req.params.id);
            await client.query('COMMIT');
            res.json({ success: true });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Kategori silme hatası:', err);
            res.status(500).json({ error: 'Kategori silinemedi' });
        } finally {
            client.release();
        }
    });

    // Kategori güncelle
    app.put('/menu-categories/:id', async (req, res) => {
        const { id } = req.params;
        const { name, parent_id } = req.body;
        try {
            const result = await pool.query(
                'UPDATE menu_categories SET name = $1, parent_id = $2 WHERE id = $3 RETURNING *',
                [name, parent_id, id]
            );
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: 'Kategori güncellenemedi' });
        }
    });

    // Ürün güncelle
    app.put('/menu/:id', async (req, res) => {
        const { id } = req.params;
        const { name, price, category_id } = req.body;
        try {
            const result = await pool.query(
                'UPDATE menu SET name = $1, price = $2, category_id = $3 WHERE id = $4 RETURNING *',
                [name, price, category_id, id]
            );
            res.json(result.rows[0]);
        } catch (err) {
            res.status(500).json({ error: 'Ürün güncellenemedi' });
        }
    });

    // Menü ürünü ekleme
    app.post('/menu-items', async (req, res) => {
        try {
            const { name, price, categoryId } = req.body;
            
            // Önce aynı isimde ürün var mı kontrol et
            const checkResult = await pool.query(
                'SELECT id FROM menu WHERE name = $1',
                [name]
            );
            
            if (checkResult.rows.length > 0) {
                return res.status(400).json({
                    error: 'Bu isimde bir ürün zaten mevcut'
                });
            }

            const result = await pool.query(
                'INSERT INTO menu (name, price, category_id) VALUES ($1, $2, $3) RETURNING *',
                [name, price, categoryId]
            );
            
            res.json(result.rows[0]);
        } catch (err) {
            console.error('Ürün ekleme hatası:', err);
            res.status(500).json({ error: 'Ürün eklenirken bir hata oluştu' });
        }
    });

    // Siparişleri yükle (sayfa yenilendiğinde)
    app.get('/active-orders', async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT orders.*, 
                       json_agg(json_build_object(
                           'id', order_items.id,
                           'name', menu.name,
                           'price', order_items.price,
                           'quantity', order_items.quantity
                       )) as items
                FROM orders
                LEFT JOIN order_items ON orders.id = order_items.order_id
                LEFT JOIN menu ON order_items.menu_item_id = menu.id
                WHERE orders.status != 'completed'
                GROUP BY orders.id
                ORDER BY orders.timestamp DESC
            `);
            res.json(result.rows);
        } catch (err) {
            console.error('Siparişleri yükleme hatası:', err);
            res.status(500).json({ error: 'Siparişler yüklenirken bir hata oluştu' });
        }
    });

    const PORT = 3000;
    http.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}); 

