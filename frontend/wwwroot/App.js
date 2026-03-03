const API_BASE = 'http://localhost:5249';
const SQUARE_APP_ID = 'sandbox-sq0idb-BwePK0oD1PR0SnDJLs3w5g';
const SQUARE_LOCATION_ID = 'YOUR_SANDBOX_LOCATION_ID';

let products = [];
let cart = [];
let currentUser = null;
let currentAdmin = null;
let squareCard = null;
let squarePayments = null;

let adminProducts = [];
let adminActiveId = null;
let adminIsEditMode = false;
let adminDeleteTargetId = null;
let adminOptionsRows = [];
let adminTierRows = [];

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error();
        products = await res.json();
        renderProducts();
    } catch {
        document.getElementById('productsGrid').innerHTML =
            '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">Could not connect to server. Please try again later.</div>';
    }
    loadSessionFromStorage();
    checkPaymentReturn();
    registerAdminShortcut();
}

// Secret keyboard shortcut to open admin login: Ctrl + Shift + A
function registerAdminShortcut() {
    document.addEventListener('keydown', e => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            if (currentAdmin) openAdminPanel();
            else openAdminLoginModal();
        }
    });
}

// ─── Products ─────────────────────────────────────────────────────────────────

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (!products.length) {
        grid.innerHTML = '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">No products available.</div>';
        return;
    }
    grid.innerHTML = products.map(p => {
        // Price display: range, tiered, or flat
        const priceHtml = (p.minPrice && p.maxPrice)
            ? `<div class="product-price">$${p.minPrice.toFixed(2)} <span style="font-size:1rem;font-weight:600;">– $${p.maxPrice.toFixed(2)}</span></div>
               <div class="product-unit">price varies by size</div>`
            : p.priceTiers?.length
                ? `<div class="product-price">from $${Math.min(...p.priceTiers.map(t => t.price)).toFixed(2)}</div>
                   <div class="product-unit">price varies by quantity</div>`
                : `<div class="product-price">$${p.basePrice.toFixed(2)}</div>
                   <div class="product-unit">base price</div>`;

        // Tier dropdown — only for products that have tiers
        const tierSelect = p.priceTiers?.length
            ? `<div class="form-group" style="margin-bottom:10px;text-align:left;">
                   <label class="form-label" style="font-size:0.78rem;">Quantity</label>
                   <select id="tier-${p.id}" style="font-size:0.85rem;padding:7px 10px;">
                       ${p.priceTiers.map(t =>
                `<option value="${t.id}" data-price="${t.price}" data-qty="${t.minQty}">${t.label}</option>`
            ).join('')}
                   </select>
               </div>`
            : '';

        return `
            <div class="product-card" id="card-${p.id}">
                <div class="product-name">${p.name}</div>
                ${priceHtml}
                ${tierSelect}
                <button class="btn-add-quote" onclick="addToCartFromCard(${p.id})">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                    </svg>
                    Add to Cart
                </button>
            </div>`;
    }).join('');
}

// Reads the selected tier if present, then adds to cart
function addToCartFromCard(productId) {
    const p = products.find(p => p.id === productId);
    if (!p) return;

    let price = p.basePrice;
    let qty = 1;
    let tierLabel = '';
    let tierId = null;

    if (p.priceTiers?.length) {
        const sel = document.getElementById(`tier-${p.id}`);
        const opt = sel.options[sel.selectedIndex];
        price = parseFloat(opt.dataset.price);
        qty = parseInt(opt.dataset.qty);
        tierLabel = opt.text;
        tierId = parseInt(sel.value);
    }

    addToCart({
        productId: p.id,
        name: p.name,
        basePrice: price,
        selectedOptions: [],
        qty,
        tierLabel,
        tierId,
        imageData: null,
        imageName: null,
        imageFile: null
    });

    const card = document.getElementById('card-' + productId);
    card.classList.add('active-card');
    setTimeout(() => card.classList.remove('active-card'), 1500);
}

// ─── Cart ─────────────────────────────────────────────────────────────────────

function addToCart(item) {
    // For tiered items, match on both productId and tierId so different tiers
    // are treated as separate line items
    const existing = item.tierId
        ? cart.find(i => i.productId === item.productId && i.tierId === item.tierId)
        : cart.find(i => i.productId === item.productId && !i.tierId);

    if (existing) {
        existing.qty += item.qty;
    } else {
        cart.push({ ...item });
    }
    updateBadge();
    showToast(`"${item.name}" added to cart!`);
}

function renderCart() {
    const list = document.getElementById('quotesList');
    const summary = document.getElementById('quoteSummary');
    if (!cart.length) {
        list.innerHTML = '<div class="empty-quote">Your cart is empty.<br>Add products to get started.</div>';
        summary.style.display = 'none';
        return;
    }
    list.innerHTML = cart.map((item, i) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + (o.priceModifier || 0), 0);
        const tierInfo = item.tierLabel
            ? `<div style="font-size:0.8rem;color:var(--accent2);margin-bottom:4px;">📦 ${item.tierLabel}</div>`
            : '';
        return `
            <div class="quote-item">
                <div class="quote-item-name">${item.name}</div>
                ${tierInfo}
                <div class="quote-item-price-unit">$${unitPrice.toFixed(2)}${item.tierId ? ' for this quantity' : ' per unit'}</div>
                ${item.selectedOptions.length ? `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">${item.selectedOptions.map(o => `${o.optionName}: ${o.optionValue}`).join(' · ')}</div>` : ''}
                <div class="item-image-area">
                    ${item.imageData
                ? `<div class="attached-image-preview"><img src="${item.imageData}" alt="Attached design"/><div class="attached-image-info"><span class="attached-image-name">${item.imageName || 'Design file'}</span><button class="remove-img-btn" onclick="removeItemImage(${i})">✕ Remove</button></div></div>`
                : `<label class="attach-image-label" for="img-input-${i}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Attach Design File</label><input type="file" id="img-input-${i}" accept="image/*,application/pdf" style="display:none" onchange="attachItemImage(${i}, this)"/>`}
                </div>
                <div class="quote-item-row">
                    <div class="qty-wrap">
                        <span>Qty:</span>
                        <input class="qty-input" type="number" value="${item.qty}" min="1"
                            ${item.tierId ? 'disabled title="Select a different quantity tier on the product card"' : ''}
                            onchange="updateQty(${i}, this.value)"/>
                    </div>
                    <div class="quote-item-total">$${(unitPrice * (item.tierId ? 1 : item.qty)).toFixed(2)}</div>
                </div>
                <button class="remove-btn" onclick="removeItem(${i})">✕</button>
            </div>`;
    }).join('');

    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('summaryItems').textContent = totalItems;
    document.getElementById('summaryTotal').textContent = `$${subtotal.toFixed(2)}`;
    summary.style.display = 'block';
}

function getCartSubtotal() {
    return cart.reduce((s, item) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((os, o) => os + (o.priceModifier || 0), 0);
        // Tiered items: basePrice IS the total for that tier, don't multiply by qty
        return s + (item.tierId ? unitPrice : unitPrice * item.qty);
    }, 0);
}

function attachItemImage(index, input) {
    const file = input.files[0]; if (!file) return;
    cart[index].imageFile = file; cart[index].imageName = file.name;
    const reader = new FileReader();
    reader.onload = e => { cart[index].imageData = e.target.result; renderCart(); };
    reader.readAsDataURL(file);
}
function removeItemImage(index) { cart[index].imageData = null; cart[index].imageName = null; cart[index].imageFile = null; renderCart(); }
function updateQty(index, val) { cart[index].qty = Math.max(1, parseInt(val) || 1); renderCart(); updateBadge(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); updateBadge(); }

function updateBadge() {
    const badge = document.getElementById('quoteBadge');
    const total = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function openQuotes() { renderCart(); document.getElementById('quotesOverlay').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeQuotes() { document.getElementById('quotesOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeIfOutside(e) { if (e.target === document.getElementById('quotesOverlay')) closeQuotes(); }

// ─── Checkout ─────────────────────────────────────────────────────────────────

async function openRequestModal() {
    if (!cart.length) { showToast('Add items to your cart first.'); return; }
    closeQuotes();
    document.getElementById('submittedTime').textContent = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
    });
    if (currentUser) {
        document.getElementById('contactName').value = currentUser.name;
        document.getElementById('contactEmail').value = currentUser.email;
    }
    document.getElementById('modalOrderDetails').innerHTML = cart.map(item => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + (o.priceModifier || 0), 0);
        const totalPrice = item.tierId ? unitPrice : unitPrice * item.qty;
        return `
            <div class="order-detail-card">
                <div>
                    <div style="font-weight:700;">${item.name}</div>
                    ${item.tierLabel ? `<div style="font-size:0.82rem;color:var(--accent2);">📦 ${item.tierLabel}</div>` : `<div class="order-detail-qty">Quantity: ${item.qty}</div>`}
                    ${item.imageName ? `<div class="order-detail-file">📎 ${item.imageName}</div>` : ''}
                </div>
                <div style="font-weight:700;">$${totalPrice.toFixed(2)}</div>
            </div>`;
    }).join('');
    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('modalSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalTotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalQtyDisplay').textContent = `×${totalItems} item${totalItems !== 1 ? 's' : ''}`;
    document.getElementById('requestModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    await initSquare();
}

function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('show');
    document.body.style.overflow = '';
    if (squareCard) { squareCard.destroy(); squareCard = null; }
}
function closeModalIfOutside(e) { if (e.target === document.getElementById('requestModal')) closeRequestModal(); }

async function initSquare() {
    try {
        if (!window.Square) { showToast('Payment system failed to load. Please refresh.'); return; }
        squarePayments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        squareCard = await squarePayments.card({
            style: {
                '.input-container': { borderRadius: '10px' },
                '.input-container.is-focus': { borderColor: '#7c3aed' }
            }
        });
        await squareCard.attach('#square-card-container');
    } catch {
        document.getElementById('square-card-container').innerHTML =
            '<p style="color:#ef4444;font-size:0.85rem;">Payment form failed to load.</p>';
    }
}

async function submitQuote() {
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }
    if (!squareCard) { showToast('Payment form not ready.'); return; }

    const btn = document.querySelector('#modalBox .btn-primary');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
        const fileIds = [];
        for (const item of cart) {
            if (item.imageFile) {
                const fd = new FormData();
                fd.append('file', item.imageFile);
                const r = await fetch(`${API_BASE}/api/Files/upload`, { method: 'POST', body: fd });
                if (r.ok) { const u = await r.json(); fileIds.push(u.fileId); }
            }
        }

        const tokenResult = await squareCard.tokenize();
        if (tokenResult.status !== 'OK') {
            showToast(`Payment error: ${tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.'}`);
            return;
        }

        const payRes = await fetch(`${API_BASE}/api/Payments/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: tokenResult.token, amountCents: Math.round(getCartSubtotal() * 100) })
        });
        if (!payRes.ok) {
            const e = await payRes.json();
            showToast(`Payment failed: ${e.errors?.[0] || 'Unknown error'}`);
            return;
        }
        const payment = await payRes.json();

        const orderRes = await fetch(`${API_BASE}/api/Orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser?.id ?? 0,
                guestEmail: currentUser ? '' : email,
                squarePaymentId: payment.paymentId,
                fileIds,
                items: cart.map(item => ({
                    productId: item.productId,
                    quantity: item.qty,
                    options: item.selectedOptions.map(o => ({ productOptionId: o.productOptionId }))
                }))
            })
        });
        if (!orderRes.ok) { showToast(`Order failed: ${await orderRes.text()}`); return; }
        const order = await orderRes.json();
        closeRequestModal();
        cart = []; updateBadge();
        showToast(`Order #${order.id} placed successfully! ✓`);
    } catch {
        showToast('Something went wrong. Please try again.');
    } finally {
        btn.disabled = false; btn.textContent = 'Submit Order';
    }
}

function checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('order') && params.get('paid') === 'true') {
        cart = []; updateBadge();
        showToast(`Order #${params.get('order')} placed successfully! ✓`);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ─── Customer Auth ────────────────────────────────────────────────────────────

function openSignIn() {
    if (currentUser) { openAccount(); return; }
    document.getElementById('signInForm').style.display = 'block';
    document.getElementById('createAccountForm').style.display = 'none';
    document.getElementById('signInModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSignIn() {
    document.getElementById('signInModal').classList.remove('show');
    document.body.style.overflow = '';
    ['signInEmail', 'signInPassword', 'createName', 'createEmail', 'createPassword'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}
function closeSignInIfOutside(e) { if (e.target === document.getElementById('signInModal')) closeSignIn(); }

function switchToCreateAccount() {
    document.getElementById('signInForm').style.display = 'none';
    document.getElementById('createAccountForm').style.display = 'block';
}
function switchToSignIn() {
    document.getElementById('signInForm').style.display = 'block';
    document.getElementById('createAccountForm').style.display = 'none';
}

async function handleSignIn() {
    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;
    if (!email) { showToast('Please enter your email.'); return; }
    if (!password) { showToast('Please enter your password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/Users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (res.status === 401) { showToast('Invalid email or password.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
        closeSignIn();
        updateNavForCustomer();
        showToast(`Welcome back, ${currentUser.name}!`);
    } catch { showToast('Sign in failed. Please try again.'); }
}

async function handleCreateAccount() {
    const name = document.getElementById('createName').value.trim();
    const email = document.getElementById('createEmail').value.trim();
    const password = document.getElementById('createPassword').value;
    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }
    if (!password) { showToast('Please enter a password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/Users/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        if (res.status === 409) { showToast('Email is already registered.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
        closeSignIn();
        updateNavForCustomer();
        showToast(`Account created! Welcome, ${currentUser.name}!`);
    } catch { showToast('Account creation failed. Please try again.'); }
}

// ─── Admin Auth ───────────────────────────────────────────────────────────────

function openAdminLoginModal() {
    document.getElementById('adminUsername').value = '';
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminLoginModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('adminUsername').focus(), 50);
}
function closeAdminLoginModal() {
    document.getElementById('adminLoginModal').classList.remove('show');
    document.body.style.overflow = '';
}
function closeAdminLoginIfOutside(e) {
    if (e.target === document.getElementById('adminLoginModal')) closeAdminLoginModal();
}

async function handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    if (!username) { showToast('Please enter your username.'); return; }
    if (!password) { showToast('Please enter your password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!res.ok) { showToast('Invalid admin credentials.'); return; }
        const data = await res.json();
        currentAdmin = { username, token: data.token };
        try { sessionStorage.setItem('adminSession', JSON.stringify(currentAdmin)); } catch { }
        closeAdminLoginModal();
        updateNavForAdmin();
        showToast('Welcome, Admin!');
        openAdminPanel();
    } catch { showToast('Admin login failed. Is the server running?'); }
}

// ─── Nav helpers ──────────────────────────────────────────────────────────────

function updateNavForCustomer() {
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = currentUser ? ` ${currentUser.name}` : ' Sign In';
}

function updateNavForAdmin() {
    document.getElementById('adminNavBtn').style.display = 'flex';
}

function loadSessionFromStorage() {
    try {
        const raw = localStorage.getItem('currentUser');
        if (raw) { currentUser = JSON.parse(raw); updateNavForCustomer(); }
    } catch { }
    try {
        const raw = sessionStorage.getItem('adminSession');
        if (raw) { currentAdmin = JSON.parse(raw); updateNavForAdmin(); }
    } catch { }
}

// ─── Account Modal ────────────────────────────────────────────────────────────

async function openAccount() {
    if (!currentUser) { openSignIn(); return; }
    document.getElementById('accountEmail').textContent = currentUser.email;
    const list = document.getElementById('accountOrdersList');
    list.innerHTML = '<div style="padding:1rem;color:var(--muted);">Loading orders...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/Orders/user/${currentUser.id}`);
        if (!res.ok) throw new Error();
        renderAccountOrders(await res.json());
    } catch {
        list.innerHTML = '<div style="padding:1rem;color:var(--muted);">Could not load orders.</div>';
    }
    document.getElementById('accountModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeAccount() { document.getElementById('accountModal').classList.remove('show'); document.body.style.overflow = ''; }
function closeAccountIfOutside(e) { if (e.target === document.getElementById('accountModal')) closeAccount(); }

function renderAccountOrders(orders) {
    const list = document.getElementById('accountOrdersList');
    if (!orders?.length) {
        list.innerHTML = '<div style="color:var(--muted);padding:1rem;">No orders to show.</div>';
        return;
    }
    list.innerHTML = orders.map(o => `
        <div class="order-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <div style="font-weight:700;">Order #${o.id}</div>
                    <div style="font-size:0.85rem;color:var(--muted);">${new Date(o.createdAt).toLocaleString()}</div>
                </div>
                <div style="font-weight:700;color:var(--accent);">$${o.totalPrice.toFixed(2)}</div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.9rem;">
                ${o.items.map(it => `
                    <div style="margin-bottom:6px;">
                        ${it.quantity}× ${it.productName}
                        <span style="color:var(--muted);">— $${(it.unitPrice * it.quantity).toFixed(2)}</span>
                    </div>`).join('')}
            </div>
            <div style="margin-top:4px;font-size:0.82rem;color:var(--muted);">
                Status: <strong style="color:var(--text);">${o.status}</strong>
            </div>
        </div>`).join('');
}

function signOut() {
    try { localStorage.removeItem('currentUser'); } catch { }
    currentUser = null;
    updateNavForCustomer();
    closeAccount();
    showToast('Signed out');
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

async function openAdminPanel() {
    if (!currentAdmin) { openAdminLoginModal(); return; }
    document.getElementById('adminOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    await adminLoadProducts();
}
function closeAdminPanel() { document.getElementById('adminOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeAdminIfOutside(e) { if (e.target === document.getElementById('adminOverlay')) closeAdminPanel(); }

function adminSignOut() {
    try { sessionStorage.removeItem('adminSession'); } catch { }
    currentAdmin = null;
    document.getElementById('adminNavBtn').style.display = 'none';
    closeAdminPanel();
    showToast('Admin signed out');
}

async function adminLoadProducts() {
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error();
        adminProducts = await res.json();
        adminRenderList();
    } catch { showToast('Failed to load products'); }
}

function adminRenderList() {
    const list = document.getElementById('adminProductList');
    document.getElementById('adminCountBadge').textContent = adminProducts.length;
    if (!adminProducts.length) {
        list.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">No products yet.</div>';
        return;
    }
    list.innerHTML = adminProducts.map((p, i) => `
        <div class="admin-product-card ${p.id === adminActiveId ? 'active' : ''}" style="animation-delay:${i * 0.03}s" onclick="adminStartEdit(${p.id})">
            <div style="flex:1;min-width:0;">
                <div class="admin-product-name">${escHtml(p.name)}</div>
                <div class="admin-product-desc">${escHtml(p.description || '')}</div>
                <div class="admin-product-price">
                    ${p.minPrice && p.maxPrice
            ? `$${Number(p.minPrice).toFixed(2)} – $${Number(p.maxPrice).toFixed(2)}`
            : `$${Number(p.basePrice).toFixed(2)}`}
                </div>
                <div style="font-size:11px;color:var(--muted);margin-top:2px;">
                    ${p.priceTiers?.length ? `${p.priceTiers.length} tier${p.priceTiers.length !== 1 ? 's' : ''}` : ''}
                    ${p.priceTiers?.length && p.options?.length ? ' · ' : ''}
                    ${p.options?.length ? `${p.options.length} option${p.options.length !== 1 ? 's' : ''}` : ''}
                </div>
            </div>
            <div style="display:flex;gap:4px;margin-left:10px;flex-shrink:0;">
                <button class="admin-icon-btn edit" title="Edit" onclick="adminStartEdit(${p.id});event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                </button>
                <button class="admin-icon-btn del" title="Delete" onclick="adminOpenDeleteModal(${p.id},'${escHtml(p.name).replace(/'/g, "\\'")}');event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>`).join('');
}

// ─── Admin form ───────────────────────────────────────────────────────────────

function adminStartAdd() {
    adminIsEditMode = false; adminActiveId = null;
    adminOptionsRows = []; adminTierRows = [];
    document.getElementById('adminProductId').value = '';
    document.getElementById('adminFName').value = '';
    document.getElementById('adminFDesc').value = '';
    document.getElementById('adminFPrice').value = '';
    document.getElementById('adminFMinPrice').value = '';
    document.getElementById('adminFMaxPrice').value = '';
    document.getElementById('adminFormTitle').textContent = 'New Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'NEW'; badge.className = 'admin-mode-badge new';
    adminRenderOptionsTable();
    adminRenderTiersTable();
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminStartEdit(id) {
    const p = adminProducts.find(x => x.id === id); if (!p) return;
    adminIsEditMode = true; adminActiveId = id;
    adminOptionsRows = (p.options || []).map(o => ({
        optionName: o.optionName,
        optionValue: o.optionValue,
        priceModifier: o.priceModifier
    }));
    adminTierRows = (p.priceTiers || []).map(t => ({
        minQty: t.minQty,
        price: t.price,
        label: t.label
    }));
    document.getElementById('adminProductId').value = p.id;
    document.getElementById('adminFName').value = p.name;
    document.getElementById('adminFDesc').value = p.description || '';
    document.getElementById('adminFPrice').value = p.basePrice;
    document.getElementById('adminFMinPrice').value = p.minPrice ?? '';
    document.getElementById('adminFMaxPrice').value = p.maxPrice ?? '';
    document.getElementById('adminFormTitle').textContent = 'Edit Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'EDITING'; badge.className = 'admin-mode-badge edit';
    adminRenderOptionsTable();
    adminRenderTiersTable();
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminCancelEdit() {
    adminActiveId = null; adminOptionsRows = []; adminTierRows = [];
    document.getElementById('adminPlaceholder').style.display = '';
    document.getElementById('adminEditForm').style.display = 'none';
    adminRenderList();
}

// ─── Options table ────────────────────────────────────────────────────────────

function adminAddOptionRow() {
    adminSyncOptionsFromDOM();
    adminOptionsRows.push({ optionName: '', optionValue: '', priceModifier: 0 });
    adminRenderOptionsTable();
    const inputs = document.querySelectorAll('.opt-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
}
function adminRemoveOptionRow(idx) {
    adminSyncOptionsFromDOM();
    adminOptionsRows.splice(idx, 1);
    adminRenderOptionsTable();
}
function adminSyncOptionsFromDOM() {
    document.querySelectorAll('.admin-opt-row').forEach((row, i) => {
        if (!adminOptionsRows[i]) return;
        adminOptionsRows[i].optionName = row.querySelector('.opt-name-input').value.trim();
        adminOptionsRows[i].optionValue = row.querySelector('.opt-value-input').value.trim();
        adminOptionsRows[i].priceModifier = parseFloat(row.querySelector('.opt-price-input').value) || 0;
    });
}
function adminRenderOptionsTable() {
    const c = document.getElementById('adminOptionsContainer');
    if (!adminOptionsRows.length) {
        c.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0 2px;">No options yet.</div>';
        return;
    }
    c.innerHTML =
        `<div class="opt-header-row"><span>Group</span><span>Value</span><span>+Price ($)</span><span></span></div>` +
        adminOptionsRows.map((o, i) => `
            <div class="admin-opt-row">
                <input class="opt-name-input"  placeholder="Size, Finish…"  value="${escHtml(o.optionName)}"  oninput="adminOptionsRows[${i}].optionName=this.value" />
                <input class="opt-value-input" placeholder="4×6, Glossy…"  value="${escHtml(o.optionValue)}" oninput="adminOptionsRows[${i}].optionValue=this.value" />
                <input class="opt-price-input" type="number" step="0.01" placeholder="0.00" value="${o.priceModifier}"
                       oninput="adminOptionsRows[${i}].priceModifier=parseFloat(this.value)||0" />
                <button type="button" class="admin-icon-btn del" onclick="adminRemoveOptionRow(${i})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`).join('');
}

// ─── Price tiers table ────────────────────────────────────────────────────────

function adminAddTierRow() {
    adminSyncTiersFromDOM();
    adminTierRows.push({ minQty: '', price: '', label: '' });
    adminRenderTiersTable();
    const inputs = document.querySelectorAll('.tier-qty-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
}
function adminRemoveTierRow(idx) {
    adminSyncTiersFromDOM();
    adminTierRows.splice(idx, 1);
    adminRenderTiersTable();
}
function adminSyncTiersFromDOM() {
    document.querySelectorAll('.admin-tier-row').forEach((row, i) => {
        if (!adminTierRows[i]) return;
        adminTierRows[i].minQty = parseInt(row.querySelector('.tier-qty-input').value) || 0;
        adminTierRows[i].price = parseFloat(row.querySelector('.tier-price-input').value) || 0;
        adminTierRows[i].label = row.querySelector('.tier-label-input').value.trim();
    });
}
function adminRenderTiersTable() {
    const c = document.getElementById('adminTiersContainer');
    if (!adminTierRows.length) {
        c.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:4px 0 2px;">No tiers yet — leave empty for flat-priced products.</div>';
        return;
    }
    c.innerHTML =
        `<div class="opt-header-row" style="grid-template-columns:80px 100px 1fr 32px;"><span>Min Qty</span><span>Price ($)</span><span>Label</span><span></span></div>` +
        adminTierRows.map((t, i) => `
            <div class="admin-tier-row" style="display:grid;grid-template-columns:80px 100px 1fr 32px;gap:6px;align-items:center;margin-bottom:5px;">
                <input class="tier-qty-input"   type="number" min="1" placeholder="100"  value="${t.minQty || ''}"
                       oninput="adminTierRows[${i}].minQty=parseInt(this.value)||0" />
                <input class="tier-price-input" type="number" step="0.01" placeholder="0.00" value="${t.price || ''}"
                       oninput="adminTierRows[${i}].price=parseFloat(this.value)||0" />
                <input class="tier-label-input" type="text" placeholder="100 cards — $25.00" value="${escHtml(t.label)}"
                       oninput="adminTierRows[${i}].label=this.value" />
                <button type="button" class="admin-icon-btn del" onclick="adminRemoveTierRow(${i})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`).join('');
}

// ─── Admin save ───────────────────────────────────────────────────────────────

async function adminSaveProduct(e) {
    e.preventDefault();
    adminSyncOptionsFromDOM();
    adminSyncTiersFromDOM();

    const btn = document.getElementById('adminSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    const productId = document.getElementById('adminProductId').value;
    const minPrice = document.getElementById('adminFMinPrice').value;
    const maxPrice = document.getElementById('adminFMaxPrice').value;

    const payload = {
        name: document.getElementById('adminFName').value.trim(),
        description: document.getElementById('adminFDesc').value.trim(),
        basePrice: parseFloat(document.getElementById('adminFPrice').value),
        minPrice: minPrice ? parseFloat(minPrice) : null,
        maxPrice: maxPrice ? parseFloat(maxPrice) : null,
        isActive: true,
        options: adminOptionsRows
            .filter(o => o.optionName.trim() && o.optionValue.trim())
            .map(o => ({ optionName: o.optionName.trim(), optionValue: o.optionValue.trim(), priceModifier: o.priceModifier })),
        priceTiers: adminTierRows
            .filter(t => t.minQty > 0 && t.price > 0)
            .map(t => ({ minQty: t.minQty, price: t.price, label: t.label.trim() }))
    };

    try {
        const url = adminIsEditMode ? `${API_BASE}/api/Products/${productId}` : `${API_BASE}/api/Products`;
        const method = adminIsEditMode ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
            showToast(adminIsEditMode ? 'Product updated!' : 'Product added!');
            await adminLoadProducts();
            const r2 = await fetch(`${API_BASE}/api/Products`);
            if (r2.ok) { products = await r2.json(); renderProducts(); }
            adminCancelEdit();
        } else {
            showToast(`Save failed: ${await res.text()}`);
        }
    } catch { showToast('Network error.'); }
    finally { btn.disabled = false; btn.textContent = 'Save Product'; }
}

// ─── Admin delete ─────────────────────────────────────────────────────────────

function adminOpenDeleteModal(id, name) {
    adminDeleteTargetId = id;
    document.getElementById('adminDeleteMsg').textContent = `Delete "${name}"? This cannot be undone.`;
    document.getElementById('adminDeleteModal').classList.add('show');
}
function adminCloseDeleteModal() {
    document.getElementById('adminDeleteModal').classList.remove('show');
    adminDeleteTargetId = null;
}
async function adminConfirmDelete() {
    if (!adminDeleteTargetId) return;
    try {
        const res = await fetch(`${API_BASE}/api/Products/${adminDeleteTargetId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Product deleted.');
            adminCloseDeleteModal(); adminCancelEdit();
            await adminLoadProducts();
            const r2 = await fetch(`${API_BASE}/api/Products`);
            if (r2.ok) { products = await r2.json(); renderProducts(); }
        } else { showToast('Delete failed.'); }
    } catch { showToast('Network error.'); }
}

// ─── Theme ────────────────────────────────────────────────────────────────────

function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('themeIcon');
    if (html.dataset.theme === 'dark') {
        html.dataset.theme = 'light';
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>';
    } else {
        html.dataset.theme = 'dark';
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}
function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();