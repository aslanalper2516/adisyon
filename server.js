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
    io.on('connection', (socket) => {
        console.log('New client connected'); // Debug için log ekleyelim
        
        // Yeni sipariş geldiğinde
        socket.on('new-order', async (order) => {
            try {
                console.log('Received new order:', order);
                
                // Masanın son durumunu kontrol et
                const lastOrderResult = await pool.query(
                    `SELECT status FROM orders 
                     WHERE table_no = $1 
                     ORDER BY timestamp DESC 
                     LIMIT 1`,
                    [order.tableNo]
                );

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
                
                // Güncel siparişleri getir ve yayınla
                const orders = await getActiveOrders();
                io.emit('orders-updated', orders);
            } catch (err) {
                console.error('Sipariş ekleme hatası:', err);
            }
        });

        // Sipariş durumu güncellendiğinde
        socket.on('update-order-status', async (data) => {
            try {
                console.log('Updating order status:', data); // Debug için log ekleyelim
                
                await pool.query(
                    'UPDATE orders SET status = $1 WHERE id = $2',
                    [data.status, data.orderId]
                );
                
                const orders = await getActiveOrders();
                io.emit('orders-updated', orders);
            } catch (err) {
                console.error('Durum güncelleme hatası:', err);
            }
        });

        // Sipariş teslim edildiğinde
        socket.on('deliver-order', async (data) => {
            try {
                console.log('Delivering order for table:', data.tableNo);
                
                // Masanın aktif siparişini bul ve durumunu completed olarak güncelle
                await pool.query(
                    'UPDATE orders SET status = $1 WHERE table_no = $2 AND status = $3',
                    ['completed', data.tableNo, 'ready']
                );
                
                // Güncel siparişleri getir ve yayınla
                const orders = await getActiveOrders();
                io.emit('orders-updated', orders);
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
            const result = await pool.query('SELECT * FROM menu ORDER BY name');
            res.json({ items: result.rows });
        } catch (err) {
            res.status(500).json({ error: 'Menü getirme hatası' });
        }
    });

    app.post('/menu', async (req, res) => {
        const { name, price } = req.body;
        try {
            await pool.query(
                'INSERT INTO menu (name, price) VALUES ($1, $2)',
                [name, price]
            );
            const result = await pool.query('SELECT * FROM menu ORDER BY name');
            res.status(201).json({ items: result.rows });
        } catch (err) {
            res.status(500).json({ error: 'Ürün ekleme hatası' });
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
                // Eğer ayar bulunamazsa varsayılan değeri ekle ve onu döndür
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
                SELECT 
                    o.id, 
                    o.table_no as "tableNo", 
                    o.status, 
                    o.timestamp,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', m.name,
                                'quantity', oi.quantity,
                                'price', oi.price
                            )
                        ) FILTER (WHERE m.name IS NOT NULL), 
                        '[]'
                    ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                LEFT JOIN menu m ON oi.menu_item_id = m.id
                WHERE o.table_no IN (
                    SELECT DISTINCT table_no 
                    FROM orders 
                    WHERE status != 'completed' OR status = 'completed'
                )
                GROUP BY o.id, o.table_no, o.status, o.timestamp
                ORDER BY o.timestamp DESC
            `);
            console.log('Active orders:', result.rows);
            return result.rows;
        } catch (err) {
            console.error('Error getting active orders:', err);
            return [];
        }
    }

    const PORT = 3000;
    http.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}); 