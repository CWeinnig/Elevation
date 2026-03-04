const API_BASE = 'http://localhost:5249';
const SQUARE_APP_ID = 'sandbox-sq0idb-BwePK0oD1PR0SnDJLs3w5g';
const SQUARE_LOCATION_ID = 'YOUR_SANDBOX_LOCATION_ID';

let products = [];
let cart = [];
let currentUser = null;
let currentAdmin = null;
let squareCard = null;
let squarePayments = null;

// Admin state
let adminProducts = [];
let adminOrders = [];
let adminActiveId = null;
let adminIsEditMode = false;
let adminDeleteTargetId = null;
let adminActiveTab = 'products'; // 'products' | 'orders'

// Payment-link return state (quote flow)
let pendingPayOrderId = null;
let pendingPayToken = null;
let pendingPayInfo = null;

// ── Init ──────────────────────────────────────────────────────────────────────

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
    await checkPaymentReturn();
}

// ── Products ──────────────────────────────────────────────────────────────────

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
            <button class="btn-add-quote" onclick="quickAddToQuote(${p.id})">
                <svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Add to Cart
            </button>
        </div>
    `).join('');
}

function quickAddToQuote(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    addToCart({ productId: product.id, name: product.name, basePrice: product.basePrice, selectedOptions: [], qty: 1, imageData: null, imageName: null, imageFile: null });
    const card = document.getElementById('card-' + productId);
    card.classList.add('active-card');
    setTimeout(() => card.classList.remove('active-card'), 1500);
}

function addToCart(item) {
    const existing = cart.find(i => i.productId === item.productId);
    if (existing) { existing.qty += item.qty; } else { cart.push({ ...item }); }
    updateBadge();
    showToast(`"${item.name}" added to cart!`);
}

// ── Cart ──────────────────────────────────────────────────────────────────────

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
                ${item.selectedOptions.length > 0 ? `<div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">${item.selectedOptions.map(o => `${o.optionName}: ${o.optionValue}`).join(' · ')}</div>` : ''}
                <div class="item-image-area">
                    ${item.imageData
                ? `<div class="attached-image-preview"><img src="${item.imageData}" alt="Attached design"/><div class="attached-image-info"><span class="attached-image-name">${item.imageName || 'Design file'}</span><button class="remove-img-btn" onclick="removeItemImage(${i})">✕ Remove</button></div></div>`
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

function openQuotes() { renderCart(); document.getElementById('quotesOverlay').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeQuotes() { document.getElementById('quotesOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeIfOutside(e) { if (e.target === document.getElementById('quotesOverlay')) closeQuotes(); }

// ── Checkout Modal ────────────────────────────────────────────────────────────

async function openRequestModal() {
    if (cart.length === 0) { showToast('Add items to your cart first.'); return; }
    closeQuotes();
    document.getElementById('submittedTime').textContent = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    if (currentUser) { document.getElementById('contactName').value = currentUser.name; document.getElementById('contactEmail').value = currentUser.email; }

    renderModalOrderDetails();
    document.getElementById('requestModal').classList.add('show');
    document.body.style.overflow = 'hidden';

    // Show/hide design section & payment section based on mode
    updateCheckoutMode();
}

function updateCheckoutMode() {
    const isQuote = document.getElementById('checkoutModeQuote').checked;
    document.getElementById('designNotesSection').style.display = isQuote ? 'block' : 'none';
    document.getElementById('paymentSection').style.display = isQuote ? 'none' : 'block';
    document.getElementById('submitOrderBtn').textContent = isQuote ? 'Send Quote Request' : 'Submit Order';
    if (!isQuote && !squareCard) initSquare();
}

function renderModalOrderDetails() {
    document.getElementById('modalOrderDetails').innerHTML = cart.map(item => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + (o.priceModifier || 0), 0);
        return `<div class="order-detail-card"><div><div style="font-weight:700;">${item.name}</div><div class="order-detail-qty">Quantity: ${item.qty}</div>${item.imageName ? `<div class="order-detail-file">📎 ${item.imageName}</div>` : ''}</div><div style="font-weight:700;">$${(unitPrice * item.qty).toFixed(2)}</div></div>`;
    }).join('');
    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('modalSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalTotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalQtyDisplay').textContent = `×${totalItems} item${totalItems !== 1 ? 's' : ''}`;
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
    const isQuote = document.getElementById('checkoutModeQuote').checked;
    const designNotes = document.getElementById('designNotes').value.trim();

    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }
    if (isQuote && !designNotes) { showToast('Please describe your design needs.'); return; }
    if (!isQuote && !squareCard) { showToast('Payment form not ready.'); return; }

    const btn = document.getElementById('submitOrderBtn');
    btn.disabled = true; btn.textContent = isQuote ? 'Sending...' : 'Processing...';

    try {
        // Upload any attached files first
        const fileIds = [];
        for (const item of cart) {
            if (item.imageFile) {
                const fd = new FormData(); fd.append('file', item.imageFile);
                const r = await fetch(`${API_BASE}/api/Files/upload`, { method: 'POST', body: fd });
                if (r.ok) { const u = await r.json(); fileIds.push(u.fileId); }
            }
        }

        let squarePaymentId = '';

        if (!isQuote) {
            // Process payment immediately
            const tokenResult = await squareCard.tokenize();
            if (tokenResult.status !== 'OK') {
                showToast(`Payment error: ${tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.'}`);
                return;
            }
            const payRes = await fetch(`${API_BASE}/api/Payments/process`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId: tokenResult.token, amountCents: Math.round(getCartSubtotal() * 100) })
            });
            if (!payRes.ok) { const e = await payRes.json(); showToast(`Payment failed: ${e.errors?.[0] || 'Unknown'}`); return; }
            const payment = await payRes.json();
            squarePaymentId = payment.paymentId;
        }

        const orderRes = await fetch(`${API_BASE}/api/Orders`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser?.id ?? 0,
                guestEmail: currentUser ? '' : email,
                squarePaymentId,
                isQuoteRequest: isQuote,
                designNotes: isQuote ? designNotes : '',
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
        closeRequestModal(); cart = []; updateBadge();

        if (isQuote) {
            showToast(`Quote #${order.id} submitted! We'll send you a proof to review. ✓`);
        } else {
            showToast(`Order #${order.id} placed successfully! ✓`);
        }
    } catch (err) {
        showToast('Something went wrong. Please try again.');
    } finally {
        btn.disabled = false;
        btn.textContent = isQuote ? 'Send Quote Request' : 'Submit Order';
    }
}

// ── Payment Link Return (Quote → Pay flow) ────────────────────────────────────

async function checkPaymentReturn() {
    const params = new URLSearchParams(window.location.search);

    // Standard order confirmation return
    if (params.get('order') && params.get('paid') === 'true') {
        cart = []; updateBadge();
        showToast(`Order #${params.get('order')} placed successfully! ✓`);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

    // Quote payment link return: ?payOrder=ID&token=TOKEN
    const payOrderId = params.get('payOrder');
    const payToken = params.get('token');
    if (payOrderId && payToken) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const res = await fetch(`${API_BASE}/api/Orders/${payOrderId}/payment-info?token=${encodeURIComponent(payToken)}`);
            if (!res.ok) { showToast('This payment link is invalid or has already been used.'); return; }
            const info = await res.json();
            pendingPayOrderId = payOrderId;
            pendingPayToken = payToken;
            pendingPayInfo = info;
            openProofPaymentModal(info);
        } catch {
            showToast('Could not load payment info. Please contact us.');
        }
    }
}

function openProofPaymentModal(info) {
    document.getElementById('proofPayEmail').textContent = info.email;
    document.getElementById('proofPayTotal').textContent = `$${Number(info.totalPrice).toFixed(2)}`;
    const itemsEl = document.getElementById('proofPayItems');
    itemsEl.innerHTML = (info.items || []).map(i =>
        `<div class="order-detail-card"><div><div style="font-weight:700;">${i.productName}</div><div class="order-detail-qty">Qty: ${i.quantity}</div></div><div style="font-weight:700;">$${(i.unitPrice * i.quantity).toFixed(2)}</div></div>`
    ).join('');
    document.getElementById('proofPayModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    initProofPaySquare();
}

async function initProofPaySquare() {
    try {
        if (!window.Square) return;
        const payments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        const card = await payments.card({ style: { '.input-container': { borderRadius: '10px' }, '.input-container.is-focus': { borderColor: '#7c3aed' } } });
        await card.attach('#proof-pay-card-container');
        window._proofPayCard = card;
    } catch (e) {
        document.getElementById('proof-pay-card-container').innerHTML = '<p style="color:#ef4444;font-size:0.85rem;">Payment form failed to load.</p>';
    }
}

function closeProofPayModal() {
    document.getElementById('proofPayModal').classList.remove('show');
    document.body.style.overflow = '';
    if (window._proofPayCard) { window._proofPayCard.destroy(); window._proofPayCard = null; }
}

async function submitProofPayment() {
    if (!window._proofPayCard) { showToast('Payment form not ready.'); return; }
    const btn = document.getElementById('proofPayBtn');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
        const tokenResult = await window._proofPayCard.tokenize();
        if (tokenResult.status !== 'OK') {
            showToast(`Payment error: ${tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.'}`);
            return;
        }
        const amountCents = Math.round(Number(pendingPayInfo.totalPrice) * 100);
        const payRes = await fetch(`${API_BASE}/api/Payments/process`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: tokenResult.token, amountCents })
        });
        if (!payRes.ok) { const e = await payRes.json(); showToast(`Payment failed: ${e.errors?.[0] || 'Unknown'}`); return; }
        const payment = await payRes.json();

        const completeRes = await fetch(`${API_BASE}/api/Orders/${pendingPayOrderId}/complete-payment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentToken: pendingPayToken, squarePaymentId: payment.paymentId })
        });
        if (!completeRes.ok) { showToast('Could not record payment. Please contact us.'); return; }

        closeProofPayModal();
        showToast(`Payment confirmed for Order #${pendingPayOrderId}! ✓`);
        pendingPayOrderId = null; pendingPayToken = null; pendingPayInfo = null;
    } catch {
        showToast('Something went wrong. Please try again.');
    } finally {
        btn.disabled = false; btn.textContent = 'Pay Now';
    }
}

// ── Sign In / Auth ────────────────────────────────────────────────────────────

function switchTab(tab) {
    const isAdmin = tab === 'admin';
    document.getElementById('signInForm').style.display = isAdmin ? 'none' : 'block';
    document.getElementById('createAccountForm').style.display = 'none';
    document.getElementById('adminForm').style.display = isAdmin ? 'block' : 'none';
    document.getElementById('tabCustomer').style.cssText = `flex:1;padding:10px;background:none;border:none;border-bottom:2px solid ${isAdmin ? 'transparent' : 'var(--accent2)'};margin-bottom:-2px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:600;color:${isAdmin ? 'var(--muted)' : 'var(--accent2)'};cursor:pointer;`;
    document.getElementById('tabAdmin').style.cssText = `flex:1;padding:10px;background:none;border:none;border-bottom:2px solid ${isAdmin ? 'var(--accent2)' : 'transparent'};margin-bottom:-2px;font-family:'DM Sans',sans-serif;font-size:0.9rem;font-weight:600;color:${isAdmin ? 'var(--accent2)' : 'var(--muted)'};cursor:pointer;`;
}

function openSignIn() {
    if (currentAdmin) { openAdminPanel(); return; }
    if (currentUser) { openAccount(); return; }
    switchTab('customer');
    document.getElementById('signInModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSignIn() {
    document.getElementById('signInModal').classList.remove('show');
    document.body.style.overflow = '';
    ['signInEmail', 'signInPassword', 'createName', 'createEmail', 'createPassword', 'adminUsername', 'adminPassword'].forEach(id => {
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
        const res = await fetch(`${API_BASE}/api/Users/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        if (res.status === 401) { showToast('Invalid email or password.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
        closeSignIn(); updateNavUser();
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
        const res = await fetch(`${API_BASE}/api/Users/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
        if (res.status === 409) { showToast('Email is already registered.'); return; }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
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
        const res = await fetch(`${API_BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        if (!res.ok) { showToast('Invalid admin credentials.'); return; }
        const data = await res.json();
        currentAdmin = { username, token: data.token };
        try { sessionStorage.setItem('adminSession', JSON.stringify(currentAdmin)); } catch { }
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
    } catch { }
    try {
        const raw = sessionStorage.getItem('adminSession');
        if (raw) { currentAdmin = JSON.parse(raw); updateNavForAdmin(); }
    } catch { }
}

// ── Account Modal ─────────────────────────────────────────────────────────────

async function openAccount() {
    if (!currentUser) { openSignIn(); return; }
    document.getElementById('accountEmail').textContent = currentUser.email;
    document.getElementById('accountUpdateMsg').textContent = '';
    document.getElementById('updateCurrentPw').value = '';
    document.getElementById('updateNewEmail').value = '';
    document.getElementById('updateNewPw').value = '';

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

function closeAccount() { document.getElementById('accountModal').classList.remove('show'); document.body.style.overflow = ''; }
function closeAccountIfOutside(e) { if (e.target === document.getElementById('accountModal')) closeAccount(); }

function renderAccountOrders(orders) {
    const list = document.getElementById('accountOrdersList');
    if (!orders || orders.length === 0) { list.innerHTML = '<div style="color:var(--muted);padding:1rem;">No orders to show.</div>'; return; }
    list.innerHTML = orders.map(o => {
        const isQuote = o.isQuoteRequest;
        const statusColor = getStatusColor(o.status);
        const proofFiles = (o.uploadedFiles || []).filter(f => f.originalFileName?.startsWith('PROOF_'));
        const proofSection = proofFiles.length > 0 ? `
            <div style="margin-top:0.75rem;padding:0.6rem 0.75rem;background:rgba(6,182,212,0.08);border-radius:8px;border:1px solid rgba(6,182,212,0.2);">
                <div style="font-size:0.78rem;font-weight:700;color:var(--accent);margin-bottom:6px;">📄 Proofs Ready for Review</div>
                ${proofFiles.map(f => `<a href="${API_BASE}${f.downloadUrl}" target="_blank" style="font-size:0.82rem;color:var(--accent2);display:block;margin-bottom:3px;">⬇ ${f.originalFileName.replace('PROOF_', '')}</a>`).join('')}
                ${o.status === 'ProofSent' ? `<button onclick="approveProof(${o.id})" style="margin-top:8px;padding:6px 14px;background:linear-gradient(135deg,#7c3aed,#06b6d4);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:0.82rem;font-weight:600;cursor:pointer;">✓ Approve Proof & Get Payment Link</button>` : ''}
            </div>` : '';
        return `
        <div class="order-card">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                <div>
                    <div style="font-weight:700;">${isQuote ? '📋 Quote' : '📦 Order'} #${o.id}</div>
                    <div style="font-size:0.85rem;color:var(--muted);">${new Date(o.createdAt).toLocaleString()}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:20px;background:${statusColor.bg};color:${statusColor.text}">${formatStatus(o.status)}</span>
                    <span style="font-weight:700;color:var(--accent);">$${o.totalPrice.toFixed(2)}</span>
                </div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.9rem;">${o.items.map(it => `<div style="margin-bottom:4px;">${it.quantity}× ${it.productName} <span style="color:var(--muted);">— $${(it.unitPrice * it.quantity).toFixed(2)}</span></div>`).join('')}</div>
            ${o.designNotes ? `<div style="margin-top:6px;font-size:0.8rem;color:var(--muted);font-style:italic;">Notes: ${escHtml(o.designNotes)}</div>` : ''}
            ${proofSection}
        </div>`;
    }).join('');
}

async function approveProof(orderId) {
    // We need the PaymentToken — fetch the order's payment info endpoint won't work without the token.
    // Instead, call a dedicated approve endpoint; user is logged in so we use their userId as auth.
    // The approve-proof endpoint needs the token. Since we don't store it client-side,
    // we'll ask the server for a customer-facing approve route using userId as verification.
    // For now we call the admin-style endpoint with a note that auth should be added in production.
    showToast('Contacting server...');
    try {
        // Fetch the order to get token from a customer-auth endpoint
        const infoRes = await fetch(`${API_BASE}/api/Orders/${orderId}/customer-approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        if (!infoRes.ok) { showToast('Could not approve proof. Please contact us.'); return; }
        const data = await infoRes.json();
        showToast('Proof approved! Check your email for the payment link. ✓');
        openAccount(); // Refresh
    } catch { showToast('Something went wrong.'); }
}

async function handleUpdateAccount() {
    const currentPw = document.getElementById('updateCurrentPw').value;
    const newEmail = document.getElementById('updateNewEmail').value.trim();
    const newPw = document.getElementById('updateNewPw').value;
    const msgEl = document.getElementById('accountUpdateMsg');

    if (!currentPw) { msgEl.textContent = 'Enter your current password to make changes.'; msgEl.style.color = '#ef4444'; return; }
    if (!newEmail && !newPw) { msgEl.textContent = 'Enter a new email or password to update.'; msgEl.style.color = '#ef4444'; return; }

    try {
        const res = await fetch(`${API_BASE}/api/Users/${currentUser.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword: currentPw, newEmail: newEmail || null, newPassword: newPw || null })
        });
        if (res.status === 401) { msgEl.textContent = 'Current password is incorrect.'; msgEl.style.color = '#ef4444'; return; }
        if (res.status === 409) { msgEl.textContent = 'That email is already in use.'; msgEl.style.color = '#ef4444'; return; }
        if (!res.ok) throw new Error();
        const updated = await res.json();
        currentUser = { ...currentUser, ...updated };
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
        updateNavUser();
        document.getElementById('accountEmail').textContent = currentUser.email;
        msgEl.textContent = 'Account updated successfully!';
        msgEl.style.color = '#10b981';
        document.getElementById('updateCurrentPw').value = '';
        document.getElementById('updateNewEmail').value = '';
        document.getElementById('updateNewPw').value = '';
    } catch { msgEl.textContent = 'Update failed. Please try again.'; msgEl.style.color = '#ef4444'; }
}

function signOut() {
    try { localStorage.removeItem('currentUser'); } catch { }
    currentUser = null;
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Sign In';
    closeAccount();
    showToast('Signed out');
}

// ── Admin Panel ───────────────────────────────────────────────────────────────

async function openAdminPanel() {
    document.getElementById('adminOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    switchAdminTab(adminActiveTab);
}

function closeAdminPanel() { document.getElementById('adminOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeAdminIfOutside(e) { if (e.target === document.getElementById('adminOverlay')) closeAdminPanel(); }

function switchAdminTab(tab) {
    adminActiveTab = tab;
    document.getElementById('adminTabProducts').classList.toggle('active', tab === 'products');
    document.getElementById('adminTabOrders').classList.toggle('active', tab === 'orders');
    document.getElementById('adminProductsPane').style.display = tab === 'products' ? 'grid' : 'none';
    document.getElementById('adminOrdersPane').style.display = tab === 'orders' ? 'flex' : 'none';
    if (tab === 'products') adminLoadProducts();
    if (tab === 'orders') adminLoadOrders();
}

function adminSignOut() {
    try { sessionStorage.removeItem('adminSession'); } catch { }
    currentAdmin = null;
    document.getElementById('adminNavBtn').style.display = 'none';
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Sign In';
    closeAdminPanel();
    showToast('Admin signed out');
}

// ── Admin: Products ───────────────────────────────────────────────────────────

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
        <div class="admin-product-card ${p.id === adminActiveId ? 'active' : ''}" style="animation-delay:${i * 0.03}s" onclick="adminStartEdit(${p.id})">
            <div style="flex:1;min-width:0;">
                <div class="admin-product-name">${escHtml(p.name)}</div>
                <div class="admin-product-desc">${escHtml(p.description || '')}</div>
                <div class="admin-product-price">$${Number(p.basePrice).toFixed(2)}</div>
            </div>
            <div style="display:flex;gap:4px;margin-left:10px;flex-shrink:0;">
                <button class="admin-icon-btn edit" title="Edit" onclick="adminStartEdit(${p.id}); event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                </button>
                <button class="admin-icon-btn del" title="Delete" onclick="adminOpenDeleteModal(${p.id},'${escHtml(p.name).replace(/'/g, "\\'")}'); event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        </div>`).join('');
}

function adminStartAdd() {
    adminIsEditMode = false; adminActiveId = null;
    document.getElementById('adminProductId').value = '';
    document.getElementById('adminFName').value = '';
    document.getElementById('adminFDesc').value = '';
    document.getElementById('adminFPrice').value = '';
    document.getElementById('adminFormTitle').textContent = 'New Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'NEW'; badge.className = 'admin-mode-badge new';
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminStartEdit(id) {
    const p = adminProducts.find(x => x.id === id); if (!p) return;
    adminIsEditMode = true; adminActiveId = id;
    document.getElementById('adminProductId').value = p.id;
    document.getElementById('adminFName').value = p.name;
    document.getElementById('adminFDesc').value = p.description || '';
    document.getElementById('adminFPrice').value = p.basePrice;
    document.getElementById('adminFormTitle').textContent = 'Edit Product';
    const badge = document.getElementById('adminModeBadge');
    badge.textContent = 'EDITING'; badge.className = 'admin-mode-badge edit';
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    adminRenderList();
}

function adminCancelEdit() {
    adminActiveId = null;
    document.getElementById('adminPlaceholder').style.display = '';
    document.getElementById('adminEditForm').style.display = 'none';
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
            res = await fetch(`${API_BASE}/api/admin/products/${document.getElementById('adminProductId').value}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        } else {
            res = await fetch(`${API_BASE}/api/admin/products`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        const res = await fetch(`${API_BASE}/api/admin/products/${adminDeleteTargetId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Product deleted.');
            adminCloseDeleteModal(); adminCancelEdit();
            await adminLoadProducts();
            const r2 = await fetch(`${API_BASE}/api/Products`);
            if (r2.ok) { products = await r2.json(); renderProducts(); }
        } else { showToast('Delete failed.'); }
    } catch { showToast('Network error.'); }
}

// ── Admin: Orders ─────────────────────────────────────────────────────────────

async function adminLoadOrders() {
    const container = document.getElementById('adminOrdersPane');
    container.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">Loading orders...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/Orders`);
        if (!res.ok) throw new Error();
        adminOrders = await res.json();
        adminRenderOrders();
    } catch { container.innerHTML = '<div style="padding:2rem;color:var(--muted);">Failed to load orders.</div>'; }
}

function adminRenderOrders() {
    const container = document.getElementById('adminOrdersPane');
    if (adminOrders.length === 0) {
        container.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">No orders yet.</div>';
        return;
    }

    // Group: quotes first, then standard orders
    const quotes = adminOrders.filter(o => o.isQuoteRequest);
    const orders = adminOrders.filter(o => !o.isQuoteRequest);

    container.innerHTML = `
        <div class="admin-orders-layout">
            <div class="admin-orders-list" id="adminOrdersList">
                ${adminOrders.map(o => adminOrderCard(o)).join('')}
            </div>
            <div class="admin-order-detail" id="adminOrderDetail">
                <div class="admin-placeholder" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="opacity:0.25;margin-bottom:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>
                    <p style="font-size:0.9rem;color:var(--muted);">Select an order to view details</p>
                </div>
            </div>
        </div>`;
}

function adminOrderCard(o) {
    const sc = getStatusColor(o.status);
    const label = o.isQuoteRequest ? '📋 Quote' : '📦 Order';
    const contact = o.guestEmail || `User #${o.userId}`;
    return `
        <div class="admin-order-card" onclick="adminSelectOrder(${o.id})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div>
                    <div style="font-size:13px;font-weight:700;">${label} #${o.id}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:1px;">${contact}</div>
                </div>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;background:${sc.bg};color:${sc.text}">${formatStatus(o.status)}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">${new Date(o.createdAt).toLocaleDateString()}</div>
            <div style="font-size:13px;font-weight:700;color:var(--accent);margin-top:2px;">$${o.totalPrice.toFixed(2)}</div>
        </div>`;
}

async function adminSelectOrder(id) {
    const order = adminOrders.find(o => o.id === id);
    if (!order) return;

    // Highlight selected
    document.querySelectorAll('.admin-order-card').forEach(c => c.classList.remove('active'));
    const cards = document.querySelectorAll('.admin-order-card');
    cards.forEach(c => { if (c.textContent.includes(`#${id}`)) c.classList.add('active'); });

    const sc = getStatusColor(order.status);
    const proofFiles = (order.uploadedFiles || []).filter(f => f.originalFileName?.startsWith('PROOF_'));
    const designFiles = (order.uploadedFiles || []).filter(f => !f.originalFileName?.startsWith('PROOF_'));

    const statusOptions = order.isQuoteRequest
        ? ['QuoteRequested', 'ProofSent', 'ProofApproved', 'AwaitingPayment', 'Paid', 'Completed', 'Cancelled']
        : ['Paid', 'Completed', 'Cancelled'];

    document.getElementById('adminOrderDetail').innerHTML = `
        <div style="padding:24px;overflow-y:auto;flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-size:18px;font-weight:700;">${order.isQuoteRequest ? '📋 Quote' : '📦 Order'} #${order.id}</div>
                    <div style="font-size:12px;color:var(--muted);margin-top:2px;">${new Date(order.createdAt).toLocaleString()}</div>
                </div>
                <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:${sc.bg};color:${sc.text}">${formatStatus(order.status)}</span>
            </div>

            <div class="admin-detail-section">
                <div class="admin-detail-label">Contact</div>
                <div>${order.guestEmail || `Registered User #${order.userId}`}</div>
            </div>

            <div class="admin-detail-section">
                <div class="admin-detail-label">Items</div>
                ${(order.items || []).map(i => `
                    <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-bottom:1px solid var(--border);">
                        <span>${i.quantity}× ${i.productName}${i.options?.length ? ' <span style="color:var(--muted);">(' + i.options.map(o => o.optionValue).join(', ') + ')</span>' : ''}</span>
                        <span style="font-weight:600;">$${(i.unitPrice * i.quantity).toFixed(2)}</span>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding-top:8px;">
                    <span>Total</span><span style="color:var(--accent);">$${order.totalPrice.toFixed(2)}</span>
                </div>
            </div>

            ${order.designNotes ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Design Notes</div>
                <div style="font-size:13px;font-style:italic;color:var(--muted);">"${escHtml(order.designNotes)}"</div>
            </div>` : ''}

            ${designFiles.length > 0 ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Customer Files</div>
                ${designFiles.map(f => `<a href="${API_BASE}${f.downloadUrl}" target="_blank" style="display:block;font-size:13px;color:var(--accent2);margin-bottom:4px;">⬇ ${f.originalFileName}</a>`).join('')}
            </div>` : ''}

            ${proofFiles.length > 0 ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Uploaded Proofs</div>
                ${proofFiles.map(f => `<a href="${API_BASE}${f.downloadUrl}" target="_blank" style="display:block;font-size:13px;color:var(--accent);margin-bottom:4px;">⬇ ${f.originalFileName.replace('PROOF_', '')}</a>`).join('')}
            </div>` : ''}

            ${order.isQuoteRequest && ['QuoteRequested', 'ProofSent'].includes(order.status) ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Upload Proof</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="file" id="proofFileInput-${order.id}" accept=".pdf,.png,.jpg,.jpeg,.ai,.eps,.svg" style="font-size:13px;flex:1;min-width:0;" />
                    <button onclick="adminUploadProof(${order.id})" style="padding:8px 16px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Upload Proof</button>
                </div>
            </div>` : ''}

            <div class="admin-detail-section">
                <div class="admin-detail-label">Update Status</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <select id="statusSelect-${order.id}" style="flex:1;padding:8px 12px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;">
                        ${statusOptions.map(s => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${formatStatus(s)}</option>`).join('')}
                    </select>
                    <button onclick="adminUpdateStatus(${order.id})" style="padding:8px 16px;background:var(--surface);border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;color:var(--text);">Update</button>
                </div>
            </div>
        </div>`;
}

async function adminUploadProof(orderId) {
    const input = document.getElementById(`proofFileInput-${orderId}`);
    if (!input || !input.files[0]) { showToast('Select a file first.'); return; }
    const fd = new FormData();
    fd.append('file', input.files[0]);
    try {
        const res = await fetch(`${API_BASE}/api/Orders/${orderId}/proof`, { method: 'POST', body: fd });
        if (!res.ok) { showToast('Upload failed.'); return; }
        showToast('Proof uploaded! Status set to Proof Sent. ✓');
        await adminLoadOrders();
        adminSelectOrder(orderId);
    } catch { showToast('Network error.'); }
}

async function adminUpdateStatus(orderId) {
    const select = document.getElementById(`statusSelect-${orderId}`);
    if (!select) return;
    try {
        const res = await fetch(`${API_BASE}/api/Orders/${orderId}/status`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newStatus: select.value })
        });
        if (!res.ok) { showToast('Status update failed.'); return; }
        showToast('Status updated! ✓');
        await adminLoadOrders();
        adminSelectOrder(orderId);
    } catch { showToast('Network error.'); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusColor(status) {
    const map = {
        'QuoteRequested': { bg: 'rgba(124,58,237,0.12)', text: '#7c3aed' },
        'ProofSent': { bg: 'rgba(6,182,212,0.12)', text: '#06b6d4' },
        'ProofApproved': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
        'AwaitingPayment': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
        'Paid': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
        'Completed': { bg: 'rgba(16,185,129,0.15)', text: '#059669' },
        'Cancelled': { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
        'Pending': { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
    };
    return map[status] || { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' };
}

function formatStatus(status) {
    const map = {
        'QuoteRequested': 'Quote Requested',
        'ProofSent': 'Proof Sent',
        'ProofApproved': 'Proof Approved',
        'AwaitingPayment': 'Awaiting Payment',
        'Paid': 'Paid',
        'Completed': 'Completed',
        'Cancelled': 'Cancelled',
        'Pending': 'Pending',
    };
    return map[status] || status;
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
    setTimeout(() => t.classList.remove('show'), 3500);
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

init();