const socket = io();

// Menüyü yükle ve göster
async function loadMenu() {
    const response = await fetch('/menu');
    const menu = await response.json();
    const menuContainer = document.getElementById('current-menu');
    
    menuContainer.innerHTML = menu.items.map(item => `
        <div class="menu-item">
            <span>${item.name} - ${item.price}₺</span>
            <button onclick="deleteMenuItem('${item.name}')">Sil</button>
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
async function deleteMenuItem(name) {
    const response = await fetch('/menu', {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
    });
    
    if (response.ok) {
        loadMenu();
    }
}

// Siparişleri göster
function displayOrders(orders) {
    const ordersContainer = document.getElementById('active-orders');
    
    ordersContainer.innerHTML = orders.map(order => `
        <div class="order-card ${order.status}">
            <h3>Masa ${order.tableNo}</h3>
            <p>Sipariş Durumu: ${getStatusText(order.status)}</p>
            <div class="order-items">
                ${order.items.map(item => `
                    <div>${item.name} x ${item.quantity}</div>
                `).join('')}
            </div>
            <div class="status-buttons">
                <button onclick="updateOrderStatus(${order.tableNo}, '${order.timestamp}', 'preparing')"
                    ${order.status !== 'waiting' ? 'disabled' : ''}>
                    Onayla
                </button>
                <button onclick="updateOrderStatus(${order.tableNo}, '${order.timestamp}', 'ready')"
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
        'ready': 'Hazır'
    };
    return statusMap[status] || status;
}

// Sipariş durumunu güncelle
function updateOrderStatus(tableNo, timestamp, newStatus) {
    socket.emit('update-order-status', {
        tableNo,
        timestamp,
        status: newStatus
    });
}

// Socket.io olaylarını dinle
socket.on('orders-updated', (orders) => {
    displayOrders(orders);
});

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    loadMenu();
}); 