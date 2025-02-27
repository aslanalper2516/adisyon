const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const fs = require('fs');

app.use(express.static('public'));
app.use(express.json());



// Eğer menu.txt yoksa oluştur
if (!fs.existsSync('./data/menu.txt')) {
  fs.writeFileSync('./data/menu.txt', JSON.stringify(initialMenu));
}

// Socket.io bağlantı yönetimi
io.on('connection', (socket) => {
  // Yeni sipariş geldiğinde
  socket.on('new-order', (order) => {
    const orders = JSON.parse(fs.readFileSync('./data/orders.txt', 'utf8') || '[]');
    orders.push({
      ...order,
      status: 'waiting', // waiting, preparing, ready
      timestamp: new Date()
    });
    fs.writeFileSync('./data/orders.txt', JSON.stringify(orders));
    io.emit('orders-updated', orders);
  });

  // Sipariş durumu güncellendiğinde
  socket.on('update-order-status', (data) => {
    const orders = JSON.parse(fs.readFileSync('./data/orders.txt', 'utf8'));
    const orderIndex = orders.findIndex(o => 
      o.tableNo === data.tableNo && 
      o.timestamp === data.timestamp
    );
    
    if (orderIndex !== -1) {
      orders[orderIndex].status = data.status;
      fs.writeFileSync('./data/orders.txt', JSON.stringify(orders));
      io.emit('orders-updated', orders);
    }
  });
});

// Menüyü getir
app.get('/menu', (req, res) => {
    const menu = JSON.parse(fs.readFileSync('./data/menu.txt', 'utf8'));
    res.json(menu);
});

// Yeni menü ürünü ekle
app.post('/menu', (req, res) => {
    const menu = JSON.parse(fs.readFileSync('./data/menu.txt', 'utf8'));
    const newItem = req.body;
    
    if (!menu.items.some(item => item.name === newItem.name)) {
        menu.items.push(newItem);
        fs.writeFileSync('./data/menu.txt', JSON.stringify(menu));
        res.status(201).json(menu);
    } else {
        res.status(400).json({ error: 'Ürün zaten mevcut' });
    }
});

// Menü ürünü sil
app.delete('/menu', (req, res) => {
    const menu = JSON.parse(fs.readFileSync('./data/menu.txt', 'utf8'));
    const { name } = req.body;
    
    menu.items = menu.items.filter(item => item.name !== name);
    fs.writeFileSync('./data/menu.txt', JSON.stringify(menu));
    res.json(menu);
});

const PORT = 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 