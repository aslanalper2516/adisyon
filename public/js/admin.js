const socket = io();

// Menüyü yükle ve göster
async function loadMenu() {
    const response = await fetch('/menu');
    const menu = await response.json();
    const menuContainer = document.getElementById('current-menu');
    
    menuContainer.innerHTML = menu.items.map(item => `
        <div class="menu-item">
            <span>${item.name} - ${item.price}₺</span>
            <button onclick="deleteMenuItem(${item.id})">Sil</button>
        </div>
    `).join('');
}

// Yeni menü ürünü ekle
async function addMenuItem() {
    const name = document.getElementById('item-name').value;
    const price = document.getElementById('item-price').value;
    
    if (!name || !price) return;
    
    const response = await fetch('/menu', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, price: Number(price) })
    });
    
    if (response.ok) {
        loadMenu();
        document.getElementById('item-name').value = '';
        document.getElementById('item-price').value = '';
    }
}

// Menü ürünü sil
async function deleteMenuItem(id) {
    const response = await fetch('/menu', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
    });
    
    if (response.ok) {
        loadMenu();
    }
}

// Siparişleri göster
function displayOrders(orders) {
    console.log('Displaying orders:', orders);
    const ordersContainer = document.getElementById('active-orders');
    
    ordersContainer.innerHTML = orders.map(order => `
        <div class="order-card ${order.status}">
            <h3>
                Masa ${order.tableNo}
                <span class="order-status ${order.status}">${getStatusText(order.status)}</span>
            </h3>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        <span>${item.name} x ${item.quantity}</span>
                        <span>${item.price * item.quantity}₺</span>
                    </div>
                `).join('')}
                <div class="order-item" style="font-weight: bold;">
                    <span>Toplam:</span>
                    <span>${order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0)}₺</span>
                </div>
            </div>
            <div class="status-buttons">
                <button onclick="updateOrderStatus(${order.id}, 'preparing')"
                    ${order.status !== 'waiting' ? 'disabled' : ''}>
                    Onayla
                </button>
                <button onclick="updateOrderStatus(${order.id}, 'ready')"
                    ${order.status !== 'preparing' ? 'disabled' : ''}>
                    Hazır
                </button>
            </div>
        </div>
    `).join('');
}

function getStatusText(status) {
    const statusMap = {
        'waiting': 'Onay Bekliyor',
        'preparing': 'Hazırlanıyor',
        'ready': 'Hazır',
        'completed': 'Tamamlandı'
    };
    return statusMap[status] || status;
}

// Sipariş durumunu güncelle
function updateOrderStatus(orderId, newStatus) {
    socket.emit('update-order-status', {
        orderId,
        status: newStatus
    });
}

// Socket.io olaylarını dinle
socket.on('orders-updated', (orders) => {
    console.log('Received orders update:', orders); // Debug için log ekleyelim
    displayOrders(orders);
});

// Mevcut masa sayısını getir
async function loadTableCount() {
    try {
        const response = await fetch('/settings/table-count');
        const data = await response.json();
        document.getElementById('table-count').value = data.value;
    } catch (err) {
        console.error('Masa sayısı yüklenirken hata:', err);
    }
}

// Masa sayısını güncelle
async function updateTableCount() {
    const count = document.getElementById('table-count').value;
    if (!count || count < 1) {
        alert('Lütfen geçerli bir masa sayısı girin');
        return;
    }

    try {
        const response = await fetch('/settings/table-count', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: parseInt(count) })
        });

        if (response.ok) {
            socket.emit('table-count-updated', { count: parseInt(count) });
            alert('Masa sayısı güncellendi');
        }
    } catch (err) {
        console.error('Masa sayısı güncellenirken hata:', err);
        alert('Masa sayısı güncellenirken bir hata oluştu');
    }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
    loadTableCount(); // Masa sayısını yükle
}); 