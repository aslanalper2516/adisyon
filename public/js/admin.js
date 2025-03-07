const socket = io();

// Menüyü yükle ve göster
async function loadMenu() {
    try {
        const [menuResponse, categoriesResponse] = await Promise.all([
            fetch('/menu'),
            fetch('/menu-categories')
        ]);
        
        if (!menuResponse.ok || !categoriesResponse.ok) {
            throw new Error('Menü veya kategoriler yüklenemedi');
        }
        
        const menu = await menuResponse.json();
        const categories = await categoriesResponse.json();
        
        const menuContainer = document.getElementById('current-menu');
        menuContainer.innerHTML = buildMenuHTML(categories, menu.items);
    } catch (err) {
        console.error('Menü yükleme hatası:', err);
        showNotification('Menü yüklenirken bir hata oluştu', 'error');
    }
}

// Kategori ağacını oluştur
function buildMenuHTML(categories, items) {
    const categoryMap = new Map(categories.map(c => [c.id, { ...c, children: [] }]));
    
    // Kategori hiyerarşisini oluştur
    const rootCategories = [];
    categories.forEach(category => {
        if (category.parent_id === null) {
            rootCategories.push(categoryMap.get(category.id));
        } else {
            const parent = categoryMap.get(category.parent_id);
            if (parent) {
                parent.children.push(categoryMap.get(category.id));
            }
        }
    });

    // Menüyü oluştur
    return rootCategories
        .map(category => buildCategoryHTML(category, items, categoryMap))
        .join('');
}

function buildCategoryHTML(category, items, categoryMap) {
    const categoryItems = items.filter(item => item.category_id === category.id);
    const hasChildren = category.children && category.children.length > 0;
    
    return `
        <div class="menu-category">
            <div class="category-header">
                <h3>${category.name}</h3>
                <div class="category-actions">
                    <button onclick="editCategory(${category.id})">Düzenle</button>
                    <button onclick="deleteCategory(${category.id})">Sil</button>
                </div>
            </div>
            ${hasChildren ? `
                <div class="subcategories">
                    ${category.children
                        .map(child => buildCategoryHTML(child, items, categoryMap))
                        .join('')}
                </div>
            ` : ''}
            <div class="category-items">
                ${categoryItems.map(item => `
                    <div class="menu-item">
                        <span>${item.name} - ${item.price}₺</span>
                        <div class="item-actions">
                            <button onclick="editMenuItem(${item.id})">Düzenle</button>
                            <button onclick="deleteMenuItem(${item.id})">Sil</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Kategori modalını göster
function showAddCategoryModal() {
    const modal = document.getElementById('category-modal');
    modal.style.display = 'block';
    loadParentCategories();
}

// Ürün modalını göster
function showAddItemModal() {
    const modal = document.getElementById('item-modal');
    modal.style.display = 'block';
    loadCategoriesForItem();
}

// Modalı kapat
function closeModal(modalId) {
    const modal = document.getElementById(modalId || 'order-modal');
    if (modal) {
        modal.classList.add('closing');
        setTimeout(() => {
            modal.style.display = 'none';
            modal.classList.remove('closing');
            document.body.classList.remove('modal-active');
        }, 300);
    }
}

// Bildirim göster
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationMessage = document.getElementById('notification-message');
    
    notification.className = `notification ${type}`;
    notificationMessage.textContent = message;
    
    // Bildirimi göster
    setTimeout(() => notification.classList.add('show'), 100);
    
    // 3 saniye sonra bildirimi gizle
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// Ürün ekleme fonksiyonu
async function addMenuItem() {
    const name = document.getElementById('item-name').value;
    const price = document.getElementById('item-price').value;
    const categorySelect = document.getElementById('item-category');
    const categoryId = categorySelect.value;

    if (!name || !price || !categoryId) {
        alert('Lütfen tüm alanları doldurun');
        return;
    }

    try {
        const response = await fetch('/menu-items', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                price: parseFloat(price),
                categoryId: parseInt(categoryId)
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Ürün eklenirken bir hata oluştu');
        }

        // Başarılı ekleme sonrası
        closeModal('item-modal');
        loadMenu(); // Menüyü yeniden yükle
        showNotification('Ürün başarıyla eklendi', 'success');
    } catch (err) {
        console.error('Ürün ekleme hatası:', err);
        showNotification(err.message, 'error');
    }
}

// Yeni kategori ekle
async function addCategory() {
    const name = document.getElementById('category-name').value;
    const parent_id = document.getElementById('parent-category').value;
    
    if (!name) {
        showNotification('Lütfen kategori adını girin', 'error');
        return;
    }
    
    try {
        const response = await fetch('/menu-categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                parent_id: parent_id ? Number(parent_id) : null
            })
        });
        
        if (response.ok) {
            loadMenu();
            closeModal('category-modal');
            document.getElementById('category-name').value = '';
            document.getElementById('parent-category').value = '';
            showNotification('Kategori başarıyla eklendi');
        } else {
            showNotification('Kategori eklenirken bir hata oluştu', 'error');
        }
    } catch (err) {
        console.error('Kategori ekleme hatası:', err);
        showNotification('Kategori eklenirken bir hata oluştu', 'error');
    }
}

// Kategori silme işlemi
async function deleteCategory(categoryId) {
    if (!confirm('Bu kategori ve içindeki tüm ürünler silinecektir. Onaylıyor musunuz?')) {
        return;
    }
    
    try {
        const response = await fetch(`/menu-categories/${categoryId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadMenu();
            showNotification('Kategori başarıyla silindi');
        } else {
            showNotification('Kategori silinirken bir hata oluştu', 'error');
        }
    } catch (err) {
        console.error('Kategori silme hatası:', err);
        showNotification('Kategori silinirken bir hata oluştu', 'error');
    }
}

// Ürün silme işlemi
async function deleteMenuItem(id) {
    if (!confirm('Bu ürün silinecektir. Onaylıyor musunuz?')) {
        return;
    }
    
    try {
        const response = await fetch('/menu', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id })
        });
        
        if (response.ok) {
            loadMenu();
            showNotification('Ürün başarıyla silindi');
        } else {
            showNotification('Ürün silinirken bir hata oluştu', 'error');
        }
    } catch (err) {
        console.error('Ürün silme hatası:', err);
        showNotification('Ürün silinirken bir hata oluştu', 'error');
    }
}

// Bekleyen siparişlerin özetini oluştur
function createOrdersSummary(orders) {
    // Bekleyen ve hazırlanıyor durumundaki siparişleri filtrele
    const activeOrders = orders.filter(order => ['waiting', 'preparing'].includes(order.status));
    
    // Tüm ürünleri ve miktarlarını topla
    const itemSummary = {};
    
    activeOrders.forEach(order => {
        order.items.forEach(item => {
            if (!itemSummary[item.name]) {
                itemSummary[item.name] = 0;
            }
            itemSummary[item.name] += item.quantity;
        });
    });
    
    // HTML oluştur
    const summaryHTML = `
        <div class="orders-summary">
            <h4>Bekleyen Siparişler Özeti</h4>
            <div class="summary-items">
                ${Object.entries(itemSummary)
                    .map(([name, quantity]) => `
                        <span class="summary-item">${name}: ${quantity}</span>
                    `).join(' | ')}
            </div>
        </div>
    `;
    
    // Özeti sayfaya ekle
    const container = document.getElementById('active-orders');
    container.insertAdjacentHTML('beforebegin', summaryHTML);
}

// Siparişleri göster fonksiyonunu güncelle
function displayOrders(orders) {
    console.log('Displaying orders:', orders);
    const ordersContainer = document.getElementById('active-orders');
    
    // Önce mevcut özeti temizle
    const existingSummary = document.querySelector('.orders-summary');
    if (existingSummary) {
        existingSummary.remove();
    }
    
    // Yeni özeti oluştur
    createOrdersSummary(orders);
    
    // Siparişleri listele
    ordersContainer.innerHTML = orders.map(order => `
        <div class="order-card ${order.status}">
            <h3>
                Masa ${order.table_no}
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

// Sipariş durumu metinleri
function getStatusText(status) {
    const statusTexts = {
        'waiting': 'Bekliyor',
        'preparing': 'Hazırlanıyor',
        'ready': 'Hazır',
        'completed': 'Tamamlandı'
    };
    return statusTexts[status] || status;
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

// Kategori düzenleme modalını göster
async function editCategory(categoryId) {
    try {
        const response = await fetch('/menu-categories');
        const categories = await response.json();
        const category = categories.find(c => c.id === categoryId);
        
        if (!category) return;

        const modal = document.getElementById('category-modal');
        const modalContent = modal.querySelector('.modal-content');
        modalContent.innerHTML = `
            <h3>Kategori Düzenle</h3>
            <input type="text" id="category-name" placeholder="Kategori Adı" value="${category.name}">
            <select id="parent-category">
                <option value="">Ana Kategori</option>
                ${categories
                    .filter(c => c.id !== categoryId) // Kendisini parent olarak seçemesin
                    .map(c => `
                        <option value="${c.id}" ${c.id === category.parent_id ? 'selected' : ''}>
                            ${c.name}
                        </option>
                    `).join('')}
            </select>
            <div class="modal-buttons">
                <button onclick="updateCategory(${categoryId})">Güncelle</button>
                <button onclick="closeModal('category-modal')">İptal</button>
            </div>
        `;
        
        modal.style.display = 'block';
    } catch (err) {
        console.error('Kategori düzenleme hatası:', err);
    }
}

// Kategori güncelle
async function updateCategory(categoryId) {
    const name = document.getElementById('category-name').value;
    const parent_id = document.getElementById('parent-category').value || null;
    
    try {
        const response = await fetch(`/menu-categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, parent_id })
        });
        
        if (response.ok) {
            loadMenu();
            closeModal('category-modal');
        }
    } catch (err) {
        console.error('Kategori güncelleme hatası:', err);
    }
}

// Ürün düzenleme modalını göster
async function editMenuItem(itemId) {
    try {
        const [menuResponse, categoriesResponse] = await Promise.all([
            fetch('/menu'),
            fetch('/menu-categories')
        ]);
        
        const menu = await menuResponse.json();
        const categories = await categoriesResponse.json();
        const item = menu.items.find(i => i.id === itemId);
        
        if (!item) return;

        const modal = document.getElementById('item-modal');
        const modalContent = modal.querySelector('.modal-content');
        modalContent.innerHTML = `
            <h3>Ürün Düzenle</h3>
            <input type="text" id="item-name" placeholder="Ürün Adı" value="${item.name}">
            <input type="number" id="item-price" placeholder="Fiyat" value="${item.price}">
            <select id="item-category">
                <option value="">Kategori Seçin</option>
                ${categories.map(c => `
                    <option value="${c.id}" ${c.id === item.category_id ? 'selected' : ''}>
                        ${c.name}
                    </option>
                `).join('')}
            </select>
            <div class="modal-buttons">
                <button onclick="updateMenuItem(${itemId})">Güncelle</button>
                <button onclick="closeModal('item-modal')">İptal</button>
            </div>
        `;
        
        modal.style.display = 'block';
    } catch (err) {
        console.error('Ürün düzenleme hatası:', err);
    }
}

// Ürün güncelle
async function updateMenuItem(itemId) {
    const name = document.getElementById('item-name').value;
    const price = document.getElementById('item-price').value;
    const category_id = document.getElementById('item-category').value || null;
    
    try {
        const response = await fetch(`/menu/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, price: Number(price), category_id })
        });
        
        if (response.ok) {
            loadMenu();
            closeModal('item-modal');
        }
    } catch (err) {
        console.error('Ürün güncelleme hatası:', err);
    }
}

// Kategori listesini yükle (yeni kategori eklerken kullanılacak)
async function loadParentCategories() {
    try {
        const response = await fetch('/menu-categories');
        const categories = await response.json();
        const select = document.getElementById('parent-category');
        
        select.innerHTML = `
            <option value="">Ana Kategori</option>
            ${categories.map(category => `
                <option value="${category.id}">${category.name}</option>
            `).join('')}
        `;
    } catch (err) {
        console.error('Kategori listesi yükleme hatası:', err);
    }
}

// Kategori listesini yükle (ürün eklerken kullanılacak)
async function loadCategoriesForItem() {
    try {
        const response = await fetch('/menu-categories');
        const categories = await response.json();
        const select = document.getElementById('item-category');
        
        select.innerHTML = `
            <option value="">Kategori Seçin</option>
            ${categories.map(category => `
                <option value="${category.id}">${category.name}</option>
            `).join('')}
        `;
    } catch (err) {
        console.error('Kategori listesi yükleme hatası:', err);
    }
}

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    loadMenu();
    loadTableCount();
    
    try {
        // Aktif siparişleri yükle
        const response = await fetch('/active-orders');
        const orders = await response.json();
        updateOrdersList(orders);
    } catch (err) {
        console.error('Siparişleri yükleme hatası:', err);
    }
});

// Siparişleri güncelle
function updateOrdersList(orders) {
    const ordersContainer = document.getElementById('orders-list');
    if (!ordersContainer) return;

    ordersContainer.innerHTML = orders.map(order => `
        <div class="order-card ${order.status}">
            <div class="order-header">
                <h3>Masa ${order.table_no}</h3>
                <span class="order-time">${new Date(order.timestamp).toLocaleString()}</span>
            </div>
            <div class="order-items">
                ${order.items.map(item => `
                    <div class="order-item">
                        ${item.name} x ${item.quantity} = ${item.price * item.quantity}₺
                    </div>
                `).join('')}
            </div>
            <div class="order-actions">
                ${getOrderActionButtons(order)}
            </div>
        </div>
    `).join('');
} 