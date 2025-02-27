const socket = io();
let selectedTable = null;

// Masaları oluştur
function createTables() {
    const container = document.getElementById('tables-container');
    for (let i = 1; i <= 20; i++) {
        const button = document.createElement('button');
        button.className = 'table-button';
        button.textContent = `Masa ${i}`;
        button.onclick = () => showTableOptions(i);
        container.appendChild(button);
    }
}

// Masa seçeneklerini göster
function showTableOptions(tableNo) {
    selectedTable = tableNo;
    const modal = document.getElementById('order-modal');
    modal.style.display = 'block';
}

// Sipariş ekleme modalını güncelle
document.getElementById('add-order').onclick = async () => {
    const menuResponse = await fetch('/menu');
    const menu = await menuResponse.json();
    
    const modal = document.getElementById('order-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    modalContent.innerHTML = `
        <h2>Sipariş Ekle - Masa ${selectedTable}</h2>
        <div class="menu-items">
            ${menu.items.map(item => `
                <div class="menu-item-select">
                    <span>${item.name} - ${item.price}₺</span>
                    <input type="number" min="0" value="0" data-item="${item.name}" data-price="${item.price}">
                </div>
            `).join('')}
        </div>
        <button onclick="submitOrder()">Siparişi Gönder</button>
        <button onclick="closeModal()">İptal</button>
    `;
    
    modal.style.display = 'block';
};

function submitOrder() {
    const inputs = document.querySelectorAll('.menu-item-select input');
    const items = Array.from(inputs)
        .filter(input => input.value > 0)
        .map(input => ({
            name: input.dataset.item,
            price: Number(input.dataset.price),
            quantity: Number(input.value)
        }));
    
    if (items.length === 0) return;
    
    const order = {
        tableNo: selectedTable,
        items,
        status: 'waiting',
        timestamp: new Date().toISOString()
    };
    
    socket.emit('new-order', order);
    closeModal();
}

function closeModal() {
    const modal = document.getElementById('order-modal');
    modal.style.display = 'none';
}

// Sayfa yüklendiğinde masaları oluştur
createTables();

// Siparişler güncellendiğinde masaların renklerini güncelle
socket.on('orders-updated', (orders) => {
    const buttons = document.getElementsByClassName('table-button');
    
    // Tüm masaların renklerini sıfırla
    Array.from(buttons).forEach(button => {
        button.className = 'table-button';
    });
    
    // Aktif siparişi olan masaların renklerini güncelle
    orders.forEach(order => {
        const tableButton = Array.from(buttons).find(
            button => button.textContent === `Masa ${order.tableNo}`
        );
        if (tableButton) {
            tableButton.classList.add(order.status);
        }
    });
}); 