const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 5000
});

let selectedTable = null;

// Masaları oluştur
async function createTables() {
    try {
        const response = await fetch('/settings/table-count');
        const data = await response.json();
        const tableCount = data.value || 20; // Eğer değer alınamazsa varsayılan 20 masa
        
        const container = document.getElementById('tables-container');
        container.innerHTML = ''; // Mevcut masaları temizle
        
        for (let i = 1; i <= tableCount; i++) {
            const button = document.createElement('button');
            button.className = 'table-button';
            button.textContent = `Masa ${i}`;
            button.onclick = () => showTableOptions(i);
            container.appendChild(button);
        }
    } catch (err) {
        console.error('Masalar oluşturulurken hata:', err);
        // Hata durumunda varsayılan 20 masa oluştur
        const container = document.getElementById('tables-container');
        container.innerHTML = '';
        for (let i = 1; i <= 20; i++) {
            const button = document.createElement('button');
            button.className = 'table-button';
            button.textContent = `Masa ${i}`;
            button.onclick = () => showTableOptions(i);
            container.appendChild(button);
        }
    }
}

// Masa seçeneklerini göster
async function showTableOptions(tableNo) {
    selectedTable = tableNo;
    const modal = document.getElementById('order-modal');
    const modalContent = modal.querySelector('.modal-content');
    
    // XSS koruması için escapeHTML fonksiyonu
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Masanın mevcut durumunu bul
    const tableButton = Array.from(document.getElementsByClassName('table-button'))
        .find(button => button.textContent === `Masa ${tableNo}`);
    
    // Eğer masa hazır durumdaysa (yeşil) farklı butonlar göster
    if (tableButton && tableButton.classList.contains('ready')) {
        modalContent.innerHTML = `
            <h2>Masa ${escapeHTML(String(tableNo))}</h2>
            <button onclick="deliverOrder(${tableNo})">Siparişi Masaya Teslim Et</button>
            <button onclick="closeModal()">İptal</button>
            <button style="background-color: #e2e8f0; color: #4a5568; position: absolute; right: 20px; bottom: 20px; width: auto; padding: 8px 20px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer;" onclick="showOrderForm()">Geri</button>
        `;
    } else {
        try {
            // Masanın siparişlerini kontrol et
            const response = await fetch(`/table-orders/${tableNo}`);
            const data = await response.json();
            const hasOrders = data.orders && data.orders.length > 0;

            modalContent.innerHTML = `
                <h2>Sipariş İşlemleri</h2>
                ${hasOrders ? `<button id="show-bill">Hesap Göster</button>` : ''}
                <button id="add-order">Sipariş Ekle</button>
                <button onclick="closeModal()">İptal</button>
            `;

            // Event listener'ları ekle
            document.getElementById('add-order').onclick = showOrderForm;
            if (hasOrders) {
                document.getElementById('show-bill').onclick = () => showBill(tableNo);
            }
        } catch (err) {
            console.error('Sipariş kontrolü hatası:', err);
            // Hata durumunda sadece sipariş ekleme butonu göster
            modalContent.innerHTML = `
                <h2>Sipariş İşlemleri</h2>
                <button id="add-order">Sipariş Ekle</button>
                <button onclick="closeModal()">İptal</button>
            `;
            document.getElementById('add-order').onclick = showOrderForm;
        }
    }
    
    modal.style.display = 'block';
    document.body.classList.add('modal-active');
}

// Siparişi teslim et
function deliverOrder(tableNo) {
    socket.emit('deliver-order', { tableNo });
    closeModal();
}

// Modal'ı göster
function showModal() {
    const modal = document.getElementById('order-modal');
    modal.style.display = 'block';
    document.body.classList.add('modal-open');  // Body'e class ekle
}

// Modal'ı kapat
function closeModal() {
    const modal = document.getElementById('order-modal');
    modal.style.display = 'none';
    document.body.classList.remove('modal-active'); // Body scroll'u geri getir
}

// Sipariş formunu göster
async function showOrderForm() {
    try {
        const categoriesResponse = await fetch('/menu-categories');
        const categories = await categoriesResponse.json();
        
        const rootCategories = categories.filter(c => c.parent_id === null);
        
        const modal = document.getElementById('order-modal');
        const modalContent = modal.querySelector('.modal-content');
        
        modalContent.innerHTML = `
            <h2>Kategori Seçin - Masa ${selectedTable}</h2>
            <div class="category-buttons">
                ${rootCategories.map(category => `
                    <button class="category-select-btn" onclick="showCategoryItems(${category.id}, '${category.name}')">
                        ${category.name}
                    </button>
                `).join('')}
            </div>
            <button onclick="closeModal()">İptal</button>
            <button style="background-color: #e2e8f0; color: #4a5568; position: absolute; right: 20px; bottom: 20px; width: auto; padding: 8px 20px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer;" onclick="showTableOptions(${selectedTable})">Geri</button>
        `;
        
        modal.style.display = 'block';
        document.body.classList.add('modal-active');
    } catch (err) {
        console.error('Kategori yükleme hatası:', err);
    }
}

// Seçilen kategorinin alt kategorilerini veya ürünlerini göster
async function showCategoryItems(categoryId, categoryName) {
    try {
        const [categoriesResponse, menuResponse] = await Promise.all([
            fetch('/menu-categories'),
            fetch('/menu')
        ]);
        
        const categories = await categoriesResponse.json();
        const menu = await menuResponse.json();
        
        const subCategories = categories.filter(c => c.parent_id === categoryId);
        const categoryItems = menu.items.filter(item => item.category_id === categoryId);
        
        const modal = document.getElementById('order-modal');
        const modalContent = modal.querySelector('.modal-content');
        
        modalContent.innerHTML = `
            <h2>${categoryName} - Masa ${selectedTable}</h2>
            ${subCategories.length > 0 ? `
                <div class="category-buttons">
                    ${subCategories.map(category => `
                        <button class="category-select-btn" onclick="showCategoryItems(${category.id}, '${category.name}')">
                            ${category.name}
                        </button>
                    `).join('')}
                </div>
            ` : ''}
            ${categoryItems.length > 0 ? `
                <div class="menu-items">
                    ${categoryItems.map(item => `
                        <div class="menu-item-select">
                            <span>${item.name} - ${item.price}₺</span>
                            <input type="number" min="0" value="0" 
                                data-item="${item.id}"
                                data-name="${item.name}"
                                data-price="${item.price}">
                        </div>
                    `).join('')}
                </div>
                <button onclick="submitOrder()">Siparişi Gönder</button>
            ` : ''}
            <button onclick="closeModal()">İptal</button>
            <button style="background-color: #e2e8f0; color: #4a5568; position: absolute; right: 20px; bottom: 20px; width: auto; padding: 8px 20px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer;" onclick="showOrderForm()">Geri</button>
        `;
        
        modal.style.display = 'block';
    } catch (err) {
        console.error('Kategori detayları yükleme hatası:', err);
    }
}

function submitOrder() {
    const inputs = document.querySelectorAll('.menu-item-select input');
    const items = Array.from(inputs)
        .filter(input => input.value > 0)
        .map(input => ({
            id: Number(input.dataset.item),
            name: input.dataset.name,
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
    
    console.log('Sending order:', order); // Debug için log ekleyelim
    socket.emit('new-order', order);
    closeModal();
}

// Hesap görüntüleme
async function showBill(tableNo) {
    try {
        const response = await fetch(`/table-orders/${tableNo}`);
        const data = await response.json();
        
        const modal = document.getElementById('order-modal');
        const modalContent = modal.querySelector('.modal-content');
        
        let totalAmount = 0;
        const ordersList = data.orders.map(order => {
            const orderTotal = order.items.reduce((sum, item) => {
                return sum + (item.price * item.quantity);
            }, 0);
            totalAmount += orderTotal;
            
            return `
                <div class="order-group">
                    <div class="order-time">${new Date(order.timestamp).toLocaleString()}</div>
                    ${order.items.map(item => `
                        <div class="order-item">
                            ${item.name} x ${item.quantity} = ${item.price * item.quantity}₺
                        </div>
                    `).join('')}
                    <div class="order-total">Sipariş Toplamı: ${orderTotal}₺</div>
                </div>
            `;
        }).join('<hr>');
        
        modalContent.innerHTML = `
            <h2>Masa ${tableNo} - Hesap Detayı</h2>
            <div class="bill-container">
                ${ordersList}
                <div class="total-amount">
                    <h3>Toplam Tutar: ${totalAmount}₺</h3>
                </div>
                <button onclick="completeBill(${tableNo})" class="complete-bill-btn">
                    Hesabı Tamamla
                </button>
            </div>
            <button onclick="closeModal()">İptal</button>
            <button style="background-color: #e2e8f0; color: #4a5568; position: absolute; right: 20px; bottom: 20px; width: auto; padding: 8px 20px; font-size: 14px; border: none; border-radius: 5px; cursor: pointer;" onclick="showTableOptions(${tableNo})">Geri</button>
        `;
    } catch (err) {
        console.error('Hesap görüntüleme hatası:', err);
    }
}

// Hesabı tamamla
function completeBill(tableNo) {
    socket.emit('complete-bill', { tableNo });
    closeModal();
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    createTables();
    
    try {
        // Aktif siparişleri yükle
        const response = await fetch('/active-orders');
        const orders = await response.json();
        updateTableStatuses(orders);
    } catch (err) {
        console.error('Siparişleri yükleme hatası:', err);
    }
});

// Masaların durumlarını güncelle
function updateTableStatuses(orders) {
    if (!orders || !Array.isArray(orders)) {
        console.error('Geçersiz sipariş verisi:', orders);
        return;
    }

    const buttons = document.getElementsByClassName('table-button');
    
    // Önce tüm masaların renklerini sıfırla
    Array.from(buttons).forEach(button => {
        button.className = 'table-button';
    });
    
    // Her bir sipariş için masa durumunu güncelle
    orders.forEach(order => {
        if (!order || !order.table_no || !order.status) {
            console.error('Geçersiz sipariş:', order);
            return;
        }

        const tableButton = Array.from(buttons).find(
            button => button.textContent === `Masa ${order.table_no}`
        );
        
        if (tableButton) {
            // Mevcut sınıfları koru ve yeni durumu ekle
            tableButton.classList.add(order.status);
            console.log(`Masa ${order.table_no} durumu güncellendi:`, order.status);
        }
    });
}

// Socket.io event listener'ları
socket.on('orders-updated', (orders) => {
    console.log('Siparişler güncellendi:', orders);
    updateTableStatuses(orders);
});

// Masa sayısı değiştiğinde masaları yeniden oluştur
socket.on('table-count-changed', (data) => {
    createTables();
});

socket.on('connect_error', (error) => {
    console.error('Socket bağlantı hatası:', error);
    showNotification('Sunucu bağlantısında sorun oluştu', 'error');
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Sunucu bağlantısı yeniden kuruldu');
    createTables();
}); 