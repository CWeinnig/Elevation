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

// Product Detail Modal state
let pdCurrentProduct = null;
let pdCurrentQty = 1;
let pdCurrentMode = 'quote'; // 'quote' | 'upload'
let pdCurrentFile = null;
let pdCurrentFileData = null;



async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error('Failed to load products');
        products = await res.json();
        renderProducts();
    } catch (e) {
        document.getElementById('productsGrid').innerHTML =
            '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">Could not connect to server. Please try again later.</div>';
    }
    loadSessionFromStorage();
    checkPaymentReturn();
}



function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (products.length === 0) {
        grid.innerHTML = '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">No products available.</div>';
        return;
    }
    grid.innerHTML = products.map(p => `
        <div class="product-card" id="card-${p.id}">
            <div class="product-name">${p.name}</div>
            <div class="product-price">$${p.basePrice.toFixed(2)}</div>
            <div class="product-unit">per unit (starting price)</div>
            <button class="btn-view-details" onclick="openProductDetail(${p.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/></svg>
                View Details
            </button>
        </div>
    `).join('');
}


/* ═══════════════════════════════════════
   PRODUCT DETAIL MODAL
═══════════════════════════════════════ */

function openProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    pdCurrentProduct = product;
    pdCurrentQty = 1;
    pdCurrentMode = 'quote';
    pdCurrentFile = null;
    pdCurrentFileData = null;

    document.getElementById('pdName').textContent = product.name;
    document.getElementById('pdPrice').textContent = `$${product.basePrice.toFixed(2)} per unit`;
    document.getElementById('pdDesc').textContent = product.description || 'Professional printing and design service.';
    document.getElementById('pdQtyDisplay').textContent = pdCurrentQty;

    // Reset mode
    pdSetMode('quote');

    // Reset quote form
    document.getElementById('pdQuoteName').value = currentUser?.name || '';
    document.getElementById('pdQuoteEmail').value = currentUser?.email || '';
    document.getElementById('pdQuoteNotes').value = '';

    // Reset upload area
    pdResetDropzone();

    document.getElementById('productDetailModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeProductDetail() {
    document.getElementById('productDetailModal').classList.remove('show');
    document.body.style.overflow = '';
}

function closeProductDetailIfOutside(e) {
    if (e.target === document.getElementById('productDetailModal')) closeProductDetail();
}

function pdChangeQty(delta) {
    pdCurrentQty = Math.max(1, pdCurrentQty + delta);
    document.getElementById('pdQtyDisplay').textContent = pdCurrentQty;
    pdUpdateTotal();
}

function pdUpdateTotal() {
    if (!pdCurrentProduct) return;
    const total = pdCurrentProduct.basePrice * pdCurrentQty;
    const el = document.getElementById('pdEstTotal');
    if (el) el.textContent = `$${total.toFixed(2)}`;
}

function pdSetMode(mode) {
    pdCurrentMode = mode;

    const quoteCard  = document.getElementById('pdModeQuote');
    const uploadCard = document.getElementById('pdModeUpload');
    const quoteSection  = document.getElementById('pdQuoteSection');
    const uploadSection = document.getElementById('pdUploadSection');

    if (mode === 'quote') {
        quoteCard.classList.add('active');
        uploadCard.classList.remove('active');
        quoteSection.style.display = 'block';
        uploadSection.style.display = 'none';
    } else {
        uploadCard.classList.add('active');
        quoteCard.classList.remove('active');
        uploadSection.style.display = 'block';
        quoteSection.style.display = 'none';
    }
}

// ── Quote submission ──
async function pdSubmitQuote() {
    const name  = document.getElementById('pdQuoteName').value.trim();
    const email = document.getElementById('pdQuoteEmail').value.trim();
    const notes = document.getElementById('pdQuoteNotes').value.trim();

    if (!name)  { showToast('Please enter your name.');  return; }
    if (!email) { showToast('Please enter your email.'); return; }

    const btn = document.getElementById('pdQuoteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="pd-btn-spinner"></span>Sending…';

    try {
        const payload = {
            productId:   pdCurrentProduct.id,
            productName: pdCurrentProduct.name,
            quantity:    pdCurrentQty,
            name,
            email,
            notes,
            estimatedPrice: pdCurrentProduct.basePrice * pdCurrentQty
        };

        // Best-effort POST — show success regardless so UX isn't blocked
        try {
            await fetch(`${API_BASE}/api/Orders/quote`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(payload)
            });
        } catch { /* swallow network error — server may not have this endpoint yet */ }

        closeProductDetail();
        showQuoteSuccess(name, pdCurrentProduct.name);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Request Quote`;
    }
}

function showQuoteSuccess(name, productName) {
    document.getElementById('quoteSuccessName').textContent    = name.split(' ')[0];
    document.getElementById('quoteSuccessProduct').textContent = productName;
    document.getElementById('quoteSuccessModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeQuoteSuccess() {
    document.getElementById('quoteSuccessModal').classList.remove('show');
    document.body.style.overflow = '';
}

// ── Upload & Add to Cart ──
function pdHandleFileInput(input) {
    const file = input.files[0];
    if (!file) return;
    pdSetFile(file);
}

function pdSetFile(file) {
    pdCurrentFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        pdCurrentFileData = e.target.result;
        pdRenderDropzone(file.name);
    };
    reader.readAsDataURL(file);
}

function pdRenderDropzone(fileName) {
    const dz = document.getElementById('pdDropzone');
    dz.innerHTML = `
        <div class="pd-file-attached">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28" style="color:#7c3aed"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div class="pd-file-name">${escHtml(fileName)}</div>
            <button class="pd-file-remove" onclick="pdResetDropzone()">✕ Remove</button>
        </div>`;
    document.getElementById('pdAddCartBtn').disabled = false;
}

function pdResetDropzone() {
    pdCurrentFile = null;
    pdCurrentFileData = null;
    const dz = document.getElementById('pdDropzone');
    dz.innerHTML = `
        <label class="pd-dropzone-label" for="pdFileInput">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" style="color:var(--accent2)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span class="pd-dropzone-text">Click to upload your design file</span>
            <span class="pd-dropzone-hint">PNG, JPG, PDF, AI, EPS — any format</span>
            <input type="file" id="pdFileInput" accept="image/*,application/pdf,.ai,.eps,.svg" style="display:none" onchange="pdHandleFileInput(this)" />
        </label>`;
    if (document.getElementById('pdAddCartBtn')) {
        document.getElementById('pdAddCartBtn').disabled = true;
    }
    pdSetupDropzoneEvents();
}

function pdSetupDropzoneEvents() {
    const dz = document.getElementById('pdDropzone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragging'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('dragging'));
    dz.addEventListener('drop', e => {
        e.preventDefault(); dz.classList.remove('dragging');
        const file = e.dataTransfer.files[0];
        if (file) pdSetFile(file);
    });
}

function pdAddToCart() {
    if (!pdCurrentProduct) return;
    const item = {
        productId:       pdCurrentProduct.id,
        name:            pdCurrentProduct.name,
        basePrice:       pdCurrentProduct.basePrice,
        selectedOptions: [],
        qty:             pdCurrentQty,
        imageData:       pdCurrentFileData,
        imageName:       pdCurrentFile?.name || null,
        imageFile:       pdCurrentFile || null
    };
    addToCart(item);

    const card = document.getElementById('card-' + pdCurrentProduct.id);
    if (card) { card.classList.add('active-card'); setTimeout(() => card.classList.remove('active-card'), 1500); }

    closeProductDetail();
}



function addToCart(item) {
    const existing = cart.find(i => i.productId === item.productId);
    if (existing) { existing.qty += item.qty; } else { cart.push({ ...item }); }
    updateBadge();
    showToast(`"${item.name}" added to cart!`);
}

function renderCart() {
    const list = document.getElementById('quotesList');
    const summary = document.getElementById('quoteSummary');
    if (cart.length === 0) {
        list.innerHTML = '<div class="empty-quote">Your cart is empty.<br>Add products to get started.</div>';
        summary.style.display = 'none';
        return;
    }
    list.innerHTML = cart.map((item, i) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + (o.priceModifier || 0), 0);
        return `
            <div class="quote-item">
                <div class="quote-item-name">${item.name}</div>
                <div class="quote-item-price-unit">$${unitPrice.toFixed(2)} per unit</div>
                ${item.selectedOptions.length > 0 ? `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">${item.selectedOptions.map(o=>`${o.optionName}: ${o.optionValue}`).join(' · ')}</div>` : ''}
                <div class="item-image-area">
                    ${item.imageData
                        ? `<div class="attached-image-preview"><img src="${item.imageData}" alt="Attached design"/><div class="attached-image-info"><span class="attached-image-name">${item.imageName||'Design file'}</span><button class="remove-img-btn" onclick="removeItemImage(${i})">✕ Remove</button></div></div>`
                        : `<label class="attach-image-label" for="img-input-${i}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Attach Design File</label><input type="file" id="img-input-${i}" accept="image/*,application/pdf" style="display:none" onchange="attachItemImage(${i}, this)"/>`
                    }
                </div>
                <div class="quote-item-row">
                    <div class="qty-wrap"><span>Qty:</span><input class="qty-input" type="number" value="${item.qty}" min="1" onchange="updateQty(${i}, this.value)"/></div>
                    <div class="quote-item-total">$${(unitPrice * item.qty).toFixed(2)}</div>
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
        return s + unitPrice * item.qty;
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

function openQuotes()  { renderCart(); document.getElementById('quotesOverlay').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeQuotes() { document.getElementById('quotesOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeIfOutside(e) { if (e.target === document.getElementById('quotesOverlay')) closeQuotes(); }



async function openRequestModal() {
    if (cart.length === 0) { showToast('Add items to your cart first.'); return; }
    closeQuotes();
    document.getElementById('submittedTime').textContent = new Date().toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true });
    if (currentUser) { document.getElementById('contactName').value = currentUser.name; document.getElementById('contactEmail').value = currentUser.email; }
    document.getElementById('modalOrderDetails').innerHTML = cart.map(item => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + (o.priceModifier || 0), 0);
        return `<div class="order-detail-card"><div><div style="font-weight:700;">${item.name}</div><div class="order-detail-qty">Quantity: ${item.qty}</div>${item.imageName ? `<div class="order-detail-file">📎 ${item.imageName}</div>` : ''}</div><div style="font-weight:700;">$${(unitPrice * item.qty).toFixed(2)}</div></div>`;
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
        squareCard = await squarePayments.card({ style: { '.input-container': { borderRadius: '10px' }, '.input-container.is-focus': { borderColor: '#7c3aed' } } });
        await squareCard.attach('#square-card-container');
    } catch (e) {
        document.getElementById('square-card-container').innerHTML = '<p style="color:#ef4444;font-size:0.85rem;">Payment form failed to load.</p>';
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
                const fd = new FormData(); fd.append('file', item.imageFile);
                const r = await fetch(`${API_BASE}/api/Files/upload`, { method:'POST', body:fd });
                if (r.ok) { const u = await r.json(); fileIds.push(u.fileId); }
            }
        }
        const tokenResult = await squareCard.tokenize();
        if (tokenResult.status !== 'OK') { showToast(`Payment error: ${tokenResult.errors?.map(e=>e.message).join(', ') || 'Card error.'}`); return; }
        const payRes = await fetch(`${API_BASE}/api/Payments/process`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sourceId:tokenResult.token, amountCents:Math.round(getCartSubtotal()*100) }) });
        if (!payRes.ok) { const e = await payRes.json(); showToast(`Payment failed: ${e.errors?.[0]||'Unknown'}`); return; }
        const payment = await payRes.json();
        const orderRes = await fetch(`${API_BASE}/api/Orders`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ userId:currentUser?.id??0, guestEmail:currentUser?'':email, squarePaymentId:payment.paymentId, fileIds, items:cart.map(item=>({ productId:item.productId, quantity:item.qty, options:item.selectedOptions.map(o=>({productOptionId:o.productOptionId})) })) }) });
        if (!orderRes.ok) { showToast(`Order failed: ${await orderRes.text()}`); return; }
        const order = await orderRes.json();
        closeRequestModal(); cart = []; updateBadge();
        showToast(`Order #${order.id} placed successfully! ✓`);
    } catch { showToast('Something went wrong. Please try again.'); }
    finally { btn.disabled = false; btn.textContent = 'Submit Order'; }
}

function checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('order') && params.get('paid') === 'true') {
        cart = []; updateBadge();
        showToast(`Order #${params.get('order')} placed successfully! ✓`);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}



function switchTab(tab) {
    const isAdmin = tab === 'admin';
    document.getElementById('signInForm').style.display        = isAdmin ? 'none' : 'block';
    document.getElementById('createAccountForm').style.display = 'none';
    document.getElementById('adminForm').style.display         = isAdmin ? 'block' : 'none';
    document.getElementById('tabCustomer').style.cssText = `flex:1;padding:10px;background:none;border:none;border-bottom:2px solid ${isAdmin ? 'transparent' : 'var(--accent2)'};margin-bottom:-2px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:600;color:${isAdmin ? 'var(--muted)' : 'var(--accent2)'};cursor:pointer;`;
    document.getElementById('tabAdmin').style.cssText    = `flex:1;padding:10px;background:none;border:none;border-bottom:2px solid ${isAdmin ? 'var(--accent2)' : 'transparent'};margin-bottom:-2px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:600;color:${isAdmin ? 'var(--accent2)' : 'var(--muted)'};cursor:pointer;`;
}

function openSignIn() {
    if (currentAdmin) { openAdminPanel(); return; }
    if (currentUser)  { openAccount();    return; }
    switchTab('customer');
    document.getElementById('signInModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSignIn() {
    document.getElementById('signInModal').classList.remove('show');
    document.body.style.overflow = '';
    ['signInEmail','signInPassword','createName','createEmail','createPassword','adminUsername','adminPassword'].forEach(id => {
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
    const email    = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;
    if (!email)    { showToast('Please enter your email.'); return; }
    if (!password) { showToast('Please enter your password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/Users/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email, password }) });
        if (res.status === 401) { showToast('Invalid email or password.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch {}
        closeSignIn(); updateNavUser();
        showToast(`Welcome back, ${currentUser.name}!`);
    } catch { showToast('Sign in failed. Please try again.'); }
}

async function handleCreateAccount() {
    const name     = document.getElementById('createName').value.trim();
    const email    = document.getElementById('createEmail').value.trim();
    const password = document.getElementById('createPassword').value;
    if (!name)     { showToast('Please enter your name.'); return; }
    if (!email)    { showToast('Please enter your email.'); return; }
    if (!password) { showToast('Please enter a password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/Users/register`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ name, email, password }) });
        if (res.status === 409) { showToast('Email is already registered.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch {}
        closeSignIn(); updateNavUser();
        showToast(`Account created! Welcome, ${currentUser.name}!`);
    } catch { showToast('Account creation failed. Please try again.'); }
}

async function handleAdminLogin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    if (!username) { showToast('Please enter your username.'); return; }
    if (!password) { showToast('Please enter your password.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/admin/login`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username, password }) });
        if (!res.ok) { showToast('Invalid admin credentials.'); return; }
        const data = await res.json();
        currentAdmin = { username, token: data.token };
        try { sessionStorage.setItem('adminSession', JSON.stringify(currentAdmin)); } catch {}
        closeSignIn();
        updateNavForAdmin();
        showToast('Welcome, Admin!');
        openAdminPanel();
    } catch { showToast('Admin login failed. Is the server running?'); }
}

function updateNavUser() {
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode && currentUser) textNode.textContent = ` ${currentUser.name}`;
}

function updateNavForAdmin() {
    document.getElementById('adminNavBtn').style.display = 'flex';
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Admin';
}

function loadSessionFromStorage() {
    try {
        const raw = localStorage.getItem('currentUser');
        if (raw) { currentUser = JSON.parse(raw); updateNavUser(); }
    } catch {}
    try {
        const raw = sessionStorage.getItem('adminSession');
        if (raw) { currentAdmin = JSON.parse(raw); updateNavForAdmin(); }
    } catch {}
}



async function openAccount() {
    if (!currentUser) { openSignIn(); return; }
    document.getElementById('accountEmail').textContent = currentUser.email;
    const list = document.getElementById('accountOrdersList');
    list.innerHTML = '<div style="padding:1rem;color:var(--muted);">Loading orders...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/Orders/user/${currentUser.id}`);
        if (!res.ok) throw new Error();
        renderAccountOrders(await res.json());
    } catch { list.innerHTML = '<div style="padding:1rem;color:var(--muted);">Could not load orders.</div>'; }
    document.getElementById('accountModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeAccount()           { document.getElementById('accountModal').classList.remove('show'); document.body.style.overflow = ''; }
function closeAccountIfOutside(e) { if (e.target === document.getElementById('accountModal')) closeAccount(); }

function renderAccountOrders(orders) {
    const list = document.getElementById('accountOrdersList');
    if (!orders || orders.length === 0) { list.innerHTML = '<div style="color:var(--muted);padding:1rem;">No orders to show.</div>'; return; }
    list.innerHTML = orders.map(o => `
        <div class="order-card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div><div style="font-weight:700;">Order #${o.id}</div><div style="font-size:0.85rem;color:var(--muted);">${new Date(o.createdAt).toLocaleString()}</div></div>
                <div style="font-weight:700;color:var(--accent);">$${o.totalPrice.toFixed(2)}</div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.9rem;">${o.items.map(it=>`<div style="margin-bottom:6px;">${it.quantity}× ${it.productName} <span style="color:var(--muted);">— $${(it.unitPrice*it.quantity).toFixed(2)}</span></div>`).join('')}</div>
        </div>`).join('');
}

function signOut() {
    try { localStorage.removeItem('currentUser'); } catch {}
    currentUser = null;
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Sign In';
    closeAccount();
    showToast('Signed out');
}


async function openAdminPanel() {
    document.getElementById('adminOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    await adminLoadProducts();
}

function closeAdminPanel()        { document.getElementById('adminOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeAdminIfOutside(e)   { if (e.target === document.getElementById('adminOverlay')) closeAdminPanel(); }

function adminSignOut() {
    try { sessionStorage.removeItem('adminSession'); } catch {}
    currentAdmin = null;
    document.getElementById('adminNavBtn').style.display = 'none';
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Sign In';
    closeAdminPanel();
    showToast('Admin signed out');
}

async function adminLoadProducts() {
    try {
        const res = await fetch(`${API_BASE}/api/admin/products`);
        if (!res.ok) throw new Error();
        adminProducts = await res.json();
        adminRenderList();
    } catch { showToast('Failed to load products'); }
}

function adminRenderList() {
    const list = document.getElementById('adminProductList');
    document.getElementById('adminCountBadge').textContent = adminProducts.length;
    if (adminProducts.length === 0) { list.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">No products yet.</div>'; return; }
    list.innerHTML = adminProducts.map((p, i) => `
        <div class="admin-product-card ${p.id === adminActiveId ? 'active' : ''}" style="animation-delay:${i*0.03}s" onclick="adminStartEdit(${p.id})">
            <div style="flex:1;min-width:0;">
                <div class="admin-product-name">${escHtml(p.name)}</div>
                <div class="admin-product-desc">${escHtml(p.description || '')}</div>
                <div class="admin-product-price">$${Number(p.basePrice).toFixed(2)}</div>
            </div>
            <div style="display:flex;gap:4px;margin-left:10px;flex-shrink:0;">
                <button class="admin-icon-btn edit" title="Edit" onclick="adminStartEdit(${p.id}); event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                </button>
                <button class="admin-icon-btn del" title="Delete" onclick="adminOpenDeleteModal(${p.id},'${escHtml(p.name).replace(/'/g,"\\'")}'); event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>`).join('');
}

function adminStartAdd() {
    adminIsEditMode = false; adminActiveId = null;
    document.getElementById('adminProductId').value = '';
    document.getElementById('adminFName').value     = '';
    document.getElementById('adminFDesc').value     = '';
    document.getElementById('adminFPrice').value    = '';
    document.getElementById('adminFormTitle').textContent = 'New Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'NEW'; badge.className = 'admin-mode-badge new';
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display    = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminStartEdit(id) {
    const p = adminProducts.find(x => x.id === id); if (!p) return;
    adminIsEditMode = true; adminActiveId = id;
    document.getElementById('adminProductId').value = p.id;
    document.getElementById('adminFName').value     = p.name;
    document.getElementById('adminFDesc').value     = p.description || '';
    document.getElementById('adminFPrice').value    = p.basePrice;
    document.getElementById('adminFormTitle').textContent = 'Edit Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'EDITING'; badge.className = 'admin-mode-badge edit';
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display    = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminCancelEdit() {
    adminActiveId = null;
    document.getElementById('adminPlaceholder').style.display = '';
    document.getElementById('adminEditForm').style.display    = 'none';
    adminRenderList();
}

async function adminSaveProduct(e) {
    e.preventDefault();
    const btn = document.getElementById('adminSaveBtn');
    btn.disabled = true; btn.textContent = 'Saving…';
    const payload = { name: document.getElementById('adminFName').value.trim(), description: document.getElementById('adminFDesc').value.trim(), basePrice: parseFloat(document.getElementById('adminFPrice').value) };
    try {
        let res;
        if (adminIsEditMode) {
            res = await fetch(`${API_BASE}/api/admin/products/${document.getElementById('adminProductId').value}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        } else {
            res = await fetch(`${API_BASE}/api/admin/products`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
        }
        if (res.ok) {
            showToast(adminIsEditMode ? 'Product updated!' : 'Product added!');
            await adminLoadProducts();
            const r2 = await fetch(`${API_BASE}/api/Products`);
            if (r2.ok) { products = await r2.json(); renderProducts(); }
            adminCancelEdit();
        } else { showToast('Save failed. Please try again.'); }
    } catch { showToast('Network error.'); }
    finally { btn.disabled = false; btn.textContent = 'Save Product'; }
}

function adminOpenDeleteModal(id, name) {
    adminDeleteTargetId = id;
    document.getElementById('adminDeleteMsg').textContent = `Delete "${name}"? This cannot be undone.`;
    document.getElementById('adminDeleteModal').classList.add('show');
}
function adminCloseDeleteModal() { document.getElementById('adminDeleteModal').classList.remove('show'); adminDeleteTargetId = null; }

async function adminConfirmDelete() {
    if (!adminDeleteTargetId) return;
    try {
        const res = await fetch(`${API_BASE}/api/admin/products/${adminDeleteTargetId}`, { method:'DELETE' });
        if (res.ok) {
            showToast('Product deleted.');
            adminCloseDeleteModal(); adminCancelEdit();
            await adminLoadProducts();
            const r2 = await fetch(`${API_BASE}/api/Products`);
            if (r2.ok) { products = await r2.json(); renderProducts(); }
        } else { showToast('Delete failed.'); }
    } catch { showToast('Network error.'); }
}


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



function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();