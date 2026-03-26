const API_BASE = 'http://localhost:5249';
// const API_BASE = 'https://djdesigns-hvdedvg3ahbddhfj.centralus-01.azurewebsites.net';
const SQUARE_APP_ID = 'sandbox-sq0idb-BwePK0oD1PR0SnDJLs3w5g';
const SQUARE_LOCATION_ID = 'L77QZ2Q33YZSD';

// FIX #4 — single top-level constant for flat shipping rate
const SHIPPING_COST = 8.99;

let products = [];
let cart = [];
let currentUser = null;   // { id, name, email, role, createdAt }
let squareCard = null;
let squarePayments = null;

// Admin state
let adminProducts = [];
let adminOrders = [];
let adminActiveId = null;
let adminIsEditMode = false;
let adminDeleteTargetId = null;
let adminActiveTab = 'products';
let adminActiveOrderId = null;

// Payment-link return state
let pendingPayOrderId = null;
let pendingPayToken = null;
let pendingPayInfo = null;

// Quotes history state
let submittedQuotes = [];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAdmin() { return currentUser && currentUser.role === 'Admin'; }

/** Build headers that include admin identity when logged in as admin */
function adminHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-User-Id': currentUser ? String(currentUser.id) : '',
        'X-User-Role': currentUser ? currentUser.role : ''
    };
}

// Ensure date strings from the backend are treated as UTC before formatting
function parseDate(str) {
    if (!str) return new Date(str);
    // If the string has no timezone indicator, append Z to treat as UTC
    const s = String(str);
    return new Date(/[Zz]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatPhone(raw) {
    const digits = String(raw).replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits.length ? `(${digits}` : '';
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function attachPhoneFormatter(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.addEventListener('input', function () {
        const pos = this.selectionStart;
        const prev = this.value;
        this.value = formatPhone(this.value);
        const delta = this.value.length - prev.length;
        this.setSelectionRange(pos + delta, pos + delta);
    });
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3500);
}

function getStatusColor(status) {
    const map = {
        'QuoteRequested': { bg: 'rgba(124,58,237,0.12)', text: '#7c3aed' },
        'ProofSent': { bg: 'rgba(6,182,212,0.12)', text: '#06b6d4' },
        'ProofApproved': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
        'AwaitingPayment': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
        'Paid': { bg: 'rgba(16,185,129,0.12)', text: '#10b981' },
        'Completed': { bg: 'rgba(16,185,129,0.15)', text: '#059669' },
        'Shipped': { bg: 'rgba(6,182,212,0.15)', text: '#0891b2' },
        'Cancelled': { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
        'RevisionRequested': { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
        'CancellationRequested': { bg: 'rgba(239,68,68,0.12)', text: '#ef4444' },
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
        'Shipped': 'Shipped',
        'Completed': 'Completed',
        'Cancelled': 'Cancelled',
        'RevisionRequested': 'Revision Requested',
        'CancellationRequested': 'Cancellation Requested',
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

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    loadSessionFromStorage();
    loadQuotesFromStorage();
    updateQuotesBadge();
    attachPhoneFormatter('contactPhone');
    attachPhoneFormatter('pdQuotePhone');
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error('Failed to load products');
        products = await res.json();
        renderProducts();
    } catch (e) {
        document.getElementById('productsGrid').innerHTML =
            '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">Could not connect to server. Please try again later.</div>';
    }
    await checkPaymentReturn();
}

// ── Products ──────────────────────────────────────────────────────────────────

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const query = document.getElementById('productSearch')?.value.trim().toLowerCase() || '';
    const filtered = query ? products.filter(p => p.name.toLowerCase().includes(query)) : products;
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="color:var(--muted);padding:2rem;grid-column:1/-1;">No products found.</div>';
        return;
    }
    grid.innerHTML = filtered.map(p => {
        const tiers = p.priceTiers || [];
        const startPrice = tiers.length ? tiers[0].price : p.basePrice;
        const priceLabel = tiers.length ? `From $${startPrice.toFixed(2)}` : `$${startPrice.toFixed(2)}`;
        return `
        <div class="product-card" id="card-${p.id}">
            <div class="product-name">${p.name}</div>
            <div class="product-price">${priceLabel}</div>
            <div class="product-unit">${tiers.length ? 'price varies by quantity' : 'per unit (starting price)'}</div>
            <button class="btn-view-details" onclick="openProductDetail(${p.id})">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" d="M21 21l-4.35-4.35"/></svg>
                View Details
            </button>
        </div>`;
    }).join('');
}

// ── Product Detail Modal ───────────────────────────────────────────────────────

let pdSelectedOptions = new Set();
let pdCurrentMode = 'quote';

function openProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    pdCurrentProduct = product;
    pdCurrentFile = null;
    pdCurrentFileData = null;
    pdSelectedOptions = new Set();
    pdOptionModifiers = {};

    const tiers = (product.priceTiers || []).slice().sort((a, b) => a.minQty - b.minQty);
    pdCurrentQty = tiers.length ? tiers[0].minQty : 1;

    document.getElementById('pdName').textContent = product.name;
    document.getElementById('pdDesc').textContent = product.description || 'Professional printing and design service.';

    const headerPrice = document.getElementById('pdPrice');
    if (headerPrice) {
        headerPrice.textContent = tiers.length
            ? `From $${tiers[0].price.toFixed(2)}`
            : `$${product.basePrice.toFixed(2)} per unit`;
    }

    const priceEl = document.getElementById('pdPriceSection');
    priceEl.innerHTML = '';

    const qtySection = document.getElementById('pdQtySection');
    if (tiers.length) {
        qtySection.innerHTML = `
            <label style="font-size:13px;color:var(--muted);font-weight:600;margin-bottom:6px;display:block;">Quantity &amp; Price</label>
            <div style="position:relative;">
                <select id="pdQtySelect" onchange="pdSelectTierQty(this.value)" style="
                    width:100%;padding:10px 14px;
                    border:1px solid var(--border);border-radius:8px;
                    background:var(--bg);color:var(--text);
                    font-family:'DM Sans',sans-serif;font-size:14px;font-weight:600;
                    cursor:pointer;appearance:none;-webkit-appearance:none;
                    background-image:url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><polyline points=%226 9 12 15 18 9%22/></svg>');
                    background-repeat:no-repeat;background-position:right 12px center;">
                    ${tiers.map((t, i) => {
            const next = tiers[i + 1];
            const label = next ? `${t.minQty} – ${next.minQty - 1}` : `${t.minQty}+`;
            return `<option value="${t.minQty}">${label} &nbsp;&nbsp; $${t.price.toFixed(2)}</option>`;
        }).join('')}
                </select>
            </div>`;
    } else {
        qtySection.innerHTML = `
            <label style="font-size:13px;color:var(--muted);font-weight:600;margin-bottom:6px;display:block;">Quantity</label>
            <div style="display:flex;align-items:center;gap:12px;">
                <button onclick="pdChangeQty(-1)" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">−</button>
                <span id="pdQtyDisplay" style="font-size:18px;font-weight:700;min-width:32px;text-align:center;">${pdCurrentQty}</span>
                <button onclick="pdChangeQty(1)" style="width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--card);color:var(--text);font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;">+</button>
            </div>`;
    }

    const optionsSection = document.getElementById('pdOptionsSection');
    const opts = product.options || [];
    if (opts.length) {
        const groups = {};
        opts.forEach(o => { if (!groups[o.optionName]) groups[o.optionName] = []; groups[o.optionName].push(o); });
        optionsSection.style.display = 'block';
        optionsSection.innerHTML = `<div style="font-size:13px;font-weight:700;margin-bottom:10px;">Add-Ons</div>` +
            Object.entries(groups).map(([groupName, groupOpts]) => `
                <div style="margin-bottom:10px;">
                    ${Object.keys(groups).length > 1 ? `<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">${escHtml(groupName)}</div>` : ''}
                    ${groupOpts.map(o => `
                        <label style="display:flex;align-items:center;gap:8px;padding:7px 0;cursor:pointer;font-size:14px;border-bottom:1px solid var(--border);">
                            <input type="checkbox" value="${o.id}" onchange="pdToggleOption(${o.id}, ${o.priceModifier}, this.checked)"
                                style="width:16px;height:16px;accent-color:var(--accent2);cursor:pointer;flex-shrink:0;" />
                            <span>${escHtml(o.optionValue)}</span>
                            ${o.priceModifier ? `<span style="margin-left:auto;color:var(--accent2);font-weight:600;white-space:nowrap;">+$${o.priceModifier.toFixed(2)}</span>` : ''}
                        </label>`).join('')}
                </div>`).join('');
    } else {
        optionsSection.style.display = 'none';
        optionsSection.innerHTML = '';
    }

    pdSetMode('quote');
    document.getElementById('pdQuoteName').value = currentUser?.name || '';
    document.getElementById('pdQuoteEmail').value = currentUser?.email || '';
    document.getElementById('pdQuoteNotes').value = '';
    const phoneEl = document.getElementById('pdQuotePhone');
    if (phoneEl) phoneEl.value = '';
    pdResetDropzone();
    pdUpdateTotal();
    document.getElementById('productDetailModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeProductDetail() {
    const modal = document.getElementById('productDetailModal');
    if (modal) modal.classList.remove('show');
    document.body.style.overflow = '';
    pdOptionModifiers = {};
}

function closeProductDetailIfOutside(e) { }

function pdSelectTierQty(val) {
    pdCurrentQty = parseInt(val);
    pdUpdateTotal();
}

function pdGetActiveTierPrice() {
    const tiers = (pdCurrentProduct?.priceTiers || []).slice().sort((a, b) => a.minQty - b.minQty);
    let price = pdCurrentProduct?.basePrice || 0;
    for (const t of tiers) { if (pdCurrentQty >= t.minQty) price = t.price; }
    return price;
}

let pdOptionModifiers = {};

function pdToggleOption(id, modifier, checked) {
    if (checked) pdOptionModifiers[id] = modifier;
    else delete pdOptionModifiers[id];
    pdUpdateTotal();
}

function pdUpdateTotal() {
    if (!pdCurrentProduct) return;
    const el = document.getElementById('pdEstTotal');
    if (!el) return;
    const tiers = pdCurrentProduct.priceTiers || [];
    const addons = Object.values(pdOptionModifiers).reduce((s, m) => s + m, 0);
    let total;
    if (tiers.length) {
        total = pdGetActiveTierPrice() + addons;
    } else {
        total = (pdCurrentProduct.basePrice + addons) * pdCurrentQty;
    }
    el.textContent = `$${total.toFixed(2)}`;
}

function pdChangeQty(delta) {
    pdCurrentQty = Math.max(1, pdCurrentQty + delta);
    const el = document.getElementById('pdQtyDisplay');
    if (el) el.textContent = pdCurrentQty;
    pdUpdateTotal();
}

function pdSetMode(mode) {
    pdCurrentMode = mode;
    const quoteCard = document.getElementById('pdModeQuote');
    const uploadCard = document.getElementById('pdModeUpload');
    const quoteSection = document.getElementById('pdQuoteSection');
    const uploadSection = document.getElementById('pdUploadSection');
    if (mode === 'quote') {
        quoteCard.classList.add('active'); uploadCard.classList.remove('active');
        quoteSection.style.display = 'block'; uploadSection.style.display = 'none';
    } else {
        uploadCard.classList.add('active'); quoteCard.classList.remove('active');
        uploadSection.style.display = 'block'; quoteSection.style.display = 'none';
    }
}

async function pdSubmitQuote() {
    const name = document.getElementById('pdQuoteName').value.trim();
    const email = document.getElementById('pdQuoteEmail').value.trim();
    const phone = document.getElementById('pdQuotePhone')?.value.trim() || '';
    const notes = document.getElementById('pdQuoteNotes').value.trim();
    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }
    if (!notes) { showToast('Please describe your design — this helps us prepare your quote.'); return; }

    const selectedOptionIds = Object.keys(pdOptionModifiers).map(id => ({ productOptionId: parseInt(id) }));

    const btn = document.getElementById('pdQuoteBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="pd-btn-spinner"></span>Sending…';

    try {
        const fileIds = [];
        const quoteFile = document.getElementById('pdQuoteFileInput')?.files[0];
        const fileToUpload = quoteFile || pdCurrentFile;
        if (fileToUpload) {
            const fd = new FormData(); fd.append('file', fileToUpload);
            const r = await fetch(`${API_BASE}/api/Files/upload`, { method: 'POST', body: fd });
            if (r.ok) { const u = await r.json(); fileIds.push(u.fileId); }
        }

        const orderRes = await fetch(`${API_BASE}/api/Orders`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser?.id ?? 0,
                guestEmail: currentUser ? '' : email,
                squarePaymentId: '',
                isQuoteRequest: true,
                designNotes: notes,
                customerPhone: phone,
                fileIds,
                items: [{ productId: pdCurrentProduct.id, quantity: pdCurrentQty, options: selectedOptionIds }]
            })
        });

        if (!orderRes.ok) { showToast('Could not submit quote. Please try again.'); return; }

        const addonTotal = Object.values(pdOptionModifiers).reduce((s, m) => s + m, 0);
        const baseTotal = pdCurrentProduct.priceTiers?.length ? pdGetActiveTierPrice() : pdCurrentProduct.basePrice * pdCurrentQty;
        submittedQuotes.unshift({
            id: Date.now(),
            productId: pdCurrentProduct.id,
            productName: pdCurrentProduct.name,
            quantity: pdCurrentQty,
            name, email, notes,
            estimatedPrice: baseTotal + addonTotal,
            submittedAt: new Date().toISOString(),
            status: 'Pending'
        });
        saveQuotesToStorage();
        updateQuotesBadge();
        closeProductDetail();
        showQuoteSuccess(name, pdCurrentProduct.name);
    } catch { showToast('Something went wrong. Please try again.'); }
    finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Request Quote`;
    }
}

function showQuoteSuccess(name, productName) {
    document.getElementById('quoteSuccessName').textContent = name.split(' ')[0];
    document.getElementById('quoteSuccessProduct').textContent = productName;
    document.getElementById('quoteSuccessModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeQuoteSuccess() {
    document.getElementById('quoteSuccessModal').classList.remove('show');
    document.body.style.overflow = '';
}

// ── Quotes History ────────────────────────────────────────────────────────────

function saveQuotesToStorage() { try { localStorage.setItem('submittedQuotes', JSON.stringify(submittedQuotes)); } catch { } }
function loadQuotesFromStorage() {
    try { const raw = localStorage.getItem('submittedQuotes'); if (raw) submittedQuotes = JSON.parse(raw); } catch { }
}
async function syncQuotesFromServer() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/api/Orders/user/${currentUser.id}`);
        if (!res.ok) return;
        const orders = await res.json();
        submittedQuotes = orders
            .filter(o => o.isQuoteRequest)
            .map(o => ({
                id: o.id,
                productId: o.items?.[0]?.productId ?? 0,
                productName: o.items?.[0]?.productName ?? 'Order #' + o.id,
                quantity: o.items?.[0]?.quantity ?? 1,
                name: currentUser.name,
                email: currentUser.email,
                notes: o.designNotes || '',
                estimatedPrice: o.totalPrice,
                submittedAt: o.createdAt,
                status: o.status
            }));
        saveQuotesToStorage();
    } catch { }
    updateQuotesBadge();
}

function updateQuotesBadge() {
    const badge = document.getElementById('quoteHistoryBadge');
    if (!badge) return;
    badge.textContent = submittedQuotes.length;
    badge.style.display = submittedQuotes.length > 0 ? 'inline-flex' : 'none';
}
function openQuotesHistory() {
    renderQuotesHistory();
    document.getElementById('quotesHistoryOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
}
function closeQuotesHistory() { document.getElementById('quotesHistoryOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeQuotesHistoryIfOutside(e) { }

function renderQuotesHistory() {
    const list = document.getElementById('quotesHistoryList');
    if (submittedQuotes.length === 0) {
        list.innerHTML = `<div class="empty-quote" style="padding:3rem 1rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" style="opacity:0.3;margin-bottom:12px;display:block;margin-left:auto;margin-right:auto;">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                <rect x="9" y="3" width="6" height="4" rx="1"/>
                <path d="M9 12h6M9 16h4"/>
            </svg>
            No quote requests yet.<br>
            <span style="font-size:0.82rem;">Request a quote on any product to see it here.</span>
        </div>`;
        return;
    }
    list.innerHTML = submittedQuotes.map((q, i) => {
        const date = parseDate(q.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        const sc = getStatusColor(q.status);
        const canApprove = q.status === 'ProofSent';
        return `<div class="qh-card" style="animation-delay:${i * 0.04}s">
            <div class="qh-card-top">
                <div class="qh-product-name">${escHtml(q.productName)}</div>
                <span class="qh-status-badge" style="background:${sc.bg};color:${sc.text};">${formatStatus(q.status)}</span>
            </div>
            <div class="qh-meta">
                <span>Qty: <strong>${q.quantity}</strong></span>
                <span style="color:var(--accent);font-weight:700;">$${Number(q.estimatedPrice).toFixed(2)}</span>
            </div>
            ${q.notes ? `<div class="qh-notes">"${escHtml(q.notes)}"</div>` : ''}
            ${canApprove ? `<button onclick="openProofReviewModal(${q.id}, null)" style="margin-top:8px;width:100%;padding:8px 14px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:0.85rem;font-weight:600;cursor:pointer;">Review Proof</button>` : ''}
            <div class="qh-footer">
                <span class="qh-date">${date}</span>
                <button class="qh-remove-btn" onclick="removeQuote(${q.id})">Remove</button>
            </div>
        </div>`;
    }).join('');
}
function removeQuote(id) {
    submittedQuotes = submittedQuotes.filter(q => q.id !== id);
    saveQuotesToStorage(); updateQuotesBadge(); renderQuotesHistory();
}

// ── Dropzone (product detail upload mode) ─────────────────────────────────────

function pdHandleFileInput(input) { const file = input.files[0]; if (file) pdSetFile(file); }

function pdSetFile(file) {
    pdCurrentFile = file;
    const reader = new FileReader();
    reader.onload = e => { pdCurrentFileData = e.target.result; pdRenderDropzone(file.name); };
    reader.readAsDataURL(file);
}

function pdRenderDropzone(fileName) {
    const dz = document.getElementById('pdDropzone');
    dz.innerHTML = `<div class="pd-file-attached">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28" style="color:#7c3aed"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div class="pd-file-name">${escHtml(fileName)}</div>
        <button class="pd-file-remove" onclick="pdResetDropzone()">✕ Remove</button>
    </div>`;
    document.getElementById('pdAddCartBtn').disabled = false;
}

function pdResetDropzone() {
    pdCurrentFile = null; pdCurrentFileData = null;
    const dz = document.getElementById('pdDropzone');
    dz.innerHTML = `<label class="pd-dropzone-label" for="pdFileInput">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32" style="color:var(--accent2)"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <span class="pd-dropzone-text">Click to upload or drag &amp; drop</span>
        <span class="pd-dropzone-hint">PNG, JPG, PDF, AI, EPS — any format</span>
        <input type="file" id="pdFileInput" accept="image/*,application/pdf,.ai,.eps,.svg" style="display:none" onchange="pdHandleFileInput(this)" />
    </label>`;
    const btn = document.getElementById('pdAddCartBtn');
    if (btn) btn.disabled = true;
    pdSetupDropzoneEvents();
}

function pdSetupDropzoneEvents() {
    const dz = document.getElementById('pdDropzone');
    if (!dz) return;
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragging'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
    dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragging'); const f = e.dataTransfer.files[0]; if (f) pdSetFile(f); });
}

function pdAddToCart() {
    if (!pdCurrentProduct) return;
    const tiers = pdCurrentProduct.priceTiers || [];
    const selectedOpts = Object.entries(pdOptionModifiers).map(([id, mod]) => {
        const opt = (pdCurrentProduct.options || []).find(o => o.id == id);
        return opt ? { productOptionId: opt.id, optionName: opt.optionName, optionValue: opt.optionValue, priceModifier: mod } : null;
    }).filter(Boolean);
    const isTiered = tiers.length > 0;
    addToCart({
        productId: pdCurrentProduct.id,
        name: pdCurrentProduct.name + (isTiered ? ` (qty ${pdCurrentQty})` : ''),
        basePrice: isTiered ? pdGetActiveTierPrice() : pdCurrentProduct.basePrice,
        selectedOptions: selectedOpts,
        qty: isTiered ? 1 : pdCurrentQty,
        imageData: pdCurrentFileData,
        imageName: pdCurrentFile?.name || null,
        imageFile: pdCurrentFile || null
    });
    const card = document.getElementById('card-' + pdCurrentProduct.id);
    if (card) { card.classList.add('active-card'); setTimeout(() => card.classList.remove('active-card'), 1500); }
    closeProductDetail();
}

function addToCart(item) {
    cart.push({ ...item });
    saveCart();
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
        const addonTotal = (item.selectedOptions || []).reduce((s, o) => s + (o.priceModifier || 0), 0);
        const unitPrice = item.basePrice + addonTotal;
        const lineTotal = (unitPrice * item.qty).toFixed(2);

        const optionPills = (item.selectedOptions || []).map(o =>
            `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);border-radius:20px;padding:2px 9px;font-size:0.75rem;color:var(--accent2);font-weight:600;white-space:nowrap;">
                ${escHtml(o.optionValue)}${o.priceModifier ? `<span style="opacity:0.7;">+$${Number(o.priceModifier).toFixed(2)}</span>` : ''}
            </span>`
        ).join('');

        const imageSection = item.imageData
            ? `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.18);border-radius:9px;">
                <img src="${item.imageData}" alt="Design" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0;"/>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:0.78rem;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(item.imageName || 'Design file')}</div>
                    <div style="font-size:0.72rem;color:var(--muted);">Attached design file</div>
                </div>

              </div>`
            : `<label for="img-input-${i}" style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border:1.5px dashed var(--border);border-radius:8px;font-size:0.78rem;font-family:'DM Sans',sans-serif;color:var(--muted);cursor:pointer;transition:border-color 0.15s,color 0.15s;" onmouseover="this.style.borderColor='#7c3aed';this.style.color='#7c3aed'" onmouseout="this.style.borderColor='';this.style.color=''">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Attach design file
              </label>
              <input type="file" id="img-input-${i}" accept="image/*,application/pdf" style="display:none" onchange="attachItemImage(${i}, this)"/>`;

        return `
            <div class="quote-item" style="padding:1rem 1rem 0.85rem;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
                    <div style="font-weight:700;font-size:0.95rem;line-height:1.3;">${escHtml(item.name)}</div>
                    <button onclick="removeItem(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;font-size:1.1rem;line-height:1;padding:0;flex-shrink:0;margin-top:1px;" title="Remove item">✕</button>
                </div>
                <div style="font-size:0.8rem;color:var(--muted);margin-bottom:${optionPills ? '8px' : '10px'};">
                    $${item.basePrice.toFixed(2)} base${addonTotal > 0 ? ` + $${addonTotal.toFixed(2)} add-ons` : ''}
                </div>
                ${optionPills ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;">${optionPills}</div>` : ''}
                <div style="margin-bottom:10px;">${imageSection}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:0.82rem;color:var(--muted);font-weight:500;">Qty</span>
                        <input class="qty-input" type="number" value="${item.qty}" min="1"
                            onchange="updateQty(${i}, this.value)"
                            style="width:58px;padding:5px 8px;font-size:0.88rem;border-radius:7px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;text-align:center;"/>
                    </div>
                    <div style="font-size:1rem;font-weight:800;color:var(--accent);">$${lineTotal}</div>
                </div>
            </div>`;
    }).join('');
    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);
    document.getElementById('summaryItems').textContent = totalItems;
    document.getElementById('summaryTotal').textContent = `$${subtotal.toFixed(2)}`;
    summary.style.display = 'block';
}

function cartStorageKey() { return currentUser ? `cart_${currentUser.id}` : null; }
function saveCart() { const k = cartStorageKey(); if (k) try { localStorage.setItem(k, JSON.stringify(cart)); } catch { } }
function loadCart() {
    const k = cartStorageKey();
    if (!k) { cart = []; return; }
    try { const raw = localStorage.getItem(k); cart = raw ? JSON.parse(raw) : []; } catch { cart = []; }
}
function clearCart() { const k = cartStorageKey(); if (k) try { localStorage.removeItem(k); } catch { } cart = []; }

function getCartSubtotal() {
    return cart.reduce((s, item) => {
        const addonTotal = (item.selectedOptions || []).reduce((os, o) => os + (o.priceModifier || 0), 0);
        return s + (item.basePrice + addonTotal) * item.qty;
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
function updateQty(index, val) { cart[index].qty = Math.max(1, parseInt(val) || 1); renderCart(); updateBadge(); saveCart(); }
function removeItem(index) { cart.splice(index, 1); renderCart(); updateBadge(); saveCart(); }

function updateBadge() {
    const badge = document.getElementById('quoteBadge');
    const total = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}

function openQuotes() { renderCart(); document.getElementById('quotesOverlay').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeQuotes() { document.getElementById('quotesOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeIfOutside(e) { }

// ── Checkout Modal ────────────────────────────────────────────────────────────

async function openRequestModal() {
    if (cart.length === 0) { showToast('Add items to your cart first.'); return; }
    closeQuotes();
    if (currentUser) {
        document.getElementById('contactName').value = currentUser.name;
        document.getElementById('contactEmail').value = currentUser.email;
        document.getElementById('shipName').value = currentUser.name;
    }
    const contactNameEl = document.getElementById('contactName');
    const shipNameEl = document.getElementById('shipName');
    contactNameEl.oninput = () => {
        if (!shipNameEl._manuallyEdited) shipNameEl.value = contactNameEl.value;
    };
    shipNameEl.oninput = () => { shipNameEl._manuallyEdited = true; };

    renderModalOrderDetails();
    document.getElementById('requestModal').classList.add('show');
    document.body.style.overflow = 'hidden';
    updateCheckoutMode();
}

function updateCheckoutMode() {
    document.getElementById('designNotesSection').style.display = 'none';
    document.getElementById('paymentSection').style.display = 'block';
    document.getElementById('submitOrderBtn').textContent = 'Submit Order';
    if (!squareCard) initSquare();
}

function renderModalOrderDetails() {
    // Uses the top-level SHIPPING_COST constant (Fix #4)
    document.getElementById('modalOrderDetails').innerHTML = cart.map(item => {
        const addonTotal = (item.selectedOptions || []).reduce((s, o) => s + (o.priceModifier || 0), 0);
        const lineTotal = (item.basePrice + addonTotal) * item.qty;
        const optLines = (item.selectedOptions || []).filter(o => o.priceModifier).map(o =>
            `<div style="font-size:12px;color:var(--muted);margin-top:2px;">+ ${escHtml(o.optionValue)} <span style="color:var(--accent2);">+$${Number(o.priceModifier).toFixed(2)} each</span></div>`
        ).join('');
        const imageHtml = item.imageData
            ? `<img src="${item.imageData}" alt="Design" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:1.5px solid var(--border);flex-shrink:0;" />`
            : `<div style="width:52px;height:52px;border-radius:8px;border:1.5px dashed var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="20" height="20" style="color:var(--muted)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
               </div>`;
        return `
        <div class="order-detail-card" style="display:flex;align-items:center;gap:12px;padding:10px 12px;">
            ${imageHtml}
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(item.name)}</div>
                <div class="order-detail-qty">${item.qty} × $${item.basePrice.toFixed(2)}</div>
                ${optLines}
                ${item.imageName ? `<div style="font-size:11px;color:var(--accent2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📎 ${escHtml(item.imageName)}</div>` : ''}
            </div>
            <div style="font-weight:700;color:var(--accent);white-space:nowrap;">$${lineTotal.toFixed(2)}</div>
        </div>`;
    }).join('') + (() => {
        const subtotal = getCartSubtotal();
        const total = subtotal + SHIPPING_COST;
        return `
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);">
                <span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);">
                <span>Shipping (flat rate)</span><span>$${SHIPPING_COST.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding-top:6px;border-top:1px solid var(--border);">
                <span>Total</span><span style="color:var(--accent);">$${total.toFixed(2)}</span>
            </div>
        </div>`;
    })();
}

function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('show');
    document.body.style.overflow = '';
    if (squareCard) { squareCard.destroy(); squareCard = null; }
    const shipNameEl = document.getElementById('shipName');
    if (shipNameEl) shipNameEl._manuallyEdited = false;
    const contactNameEl = document.getElementById('contactName');
    if (contactNameEl) contactNameEl.oninput = null;
}
function closeModalIfOutside(e) { }

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
    const phone = document.getElementById('contactPhone')?.value.trim() || '';
    const isQuote = false;
    const designNotes = (document.getElementById('customDetails')?.value.trim() || document.getElementById('designNotes')?.value.trim() || '');

    const shipName = document.getElementById('shipName').value.trim();
    const shipStreet = document.getElementById('shipStreet').value.trim();
    const shipCity = document.getElementById('shipCity').value.trim();
    const shipState = document.getElementById('shipState').value.trim();
    const shipZip = document.getElementById('shipZip').value.trim();

    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }
    if (!shipName) { showToast('Please enter the shipping name.'); return; }
    if (!shipStreet) { showToast('Please enter a shipping address.'); return; }
    if (!shipCity) { showToast('Please enter the city.'); return; }
    if (!shipState) { showToast('Please enter the state.'); return; }
    if (!shipZip) { showToast('Please enter the ZIP code.'); return; }
    if (isQuote && !designNotes) { showToast('Please describe your design needs.'); return; }
    if (!isQuote && !squareCard) { showToast('Payment form not ready.'); return; }

    // Uses top-level SHIPPING_COST constant (Fix #4)
    const grandTotal = getCartSubtotal() + SHIPPING_COST;

    const btn = document.getElementById('submitOrderBtn');
    btn.disabled = true; btn.textContent = isQuote ? 'Sending...' : 'Processing...';

    try {
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
            const tokenResult = await squareCard.tokenize();
            if (tokenResult.status !== 'OK') {
                showToast(`Payment error: ${tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.'}`);
                return;
            }
            const payRes = await fetch(`${API_BASE}/api/Payments/process`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId: tokenResult.token, amountCents: Math.round(grandTotal * 100) })
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
                designNotes: designNotes,
                customerPhone: phone,
                fileIds,
                shipToName: shipName,
                shipToStreet: shipStreet,
                shipToCity: shipCity,
                shipToState: shipState,
                shipToZip: shipZip,
                items: cart.map(item => ({
                    productId: item.productId,
                    quantity: item.qty,
                    options: (item.selectedOptions || []).map(o => ({ productOptionId: o.productOptionId }))
                }))
            })
        });

        if (!orderRes.ok) { showToast(`Order failed: ${await orderRes.text()}`); return; }
        await orderRes.json();
        closeRequestModal(); clearCart(); updateBadge();

        if (isQuote) {
            showToast(`Quote submitted! We'll be in touch with a proof soon. ✓`);
        } else {
            showToast(`Order placed successfully! You'll receive a confirmation email. ✓`);
            if (currentUser) openAccount();
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

    if (params.get('proofResult') === 'invalid') {
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast('This proof link is invalid or has already been used. Check your account for the latest status.');
        return;
    }

    if (params.get('order') && params.get('paid') === 'true') {
        clearCart(); updateBadge();
        showToast(`Order placed successfully! You'll receive a confirmation email. ✓`);
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
    }

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

// FIX #2 — shipping cost line + correct total (items subtotal + shipping)
function openProofPaymentModal(info) {
    document.getElementById('proofPayEmail').textContent = info.email;

    // Clear shipping address fields every time the modal opens
    ['proofShipName', 'proofShipStreet', 'proofShipCity', 'proofShipState', 'proofShipZip'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Compute subtotal from items (same logic as checkout modal)
    const itemsSubtotal = (info.items || []).reduce((sum, i) => {
        const addonTotal = (i.options || []).reduce((s, o) => s + (o.priceModifier || 0), 0);
        const lineTotal = i.isTiered ? i.unitPrice : i.unitPrice * i.quantity;
        return sum + lineTotal + addonTotal;
    }, 0);
    const grandTotal = itemsSubtotal + SHIPPING_COST;

    // Store for submitProofPayment to charge Square correctly
    if (pendingPayInfo) pendingPayInfo._grandTotal = grandTotal;

    const itemsEl = document.getElementById('proofPayItems');
    itemsEl.innerHTML = (info.items || []).map(i => {
        const optionLines = (i.options || []).filter(o => o.priceModifier !== 0).map(o =>
            `<div style="font-size:12px;color:var(--muted);margin-top:2px;">+ ${o.optionValue} <span style="color:var(--accent2);">+$${Number(o.priceModifier).toFixed(2)} each</span></div>`
        ).join('');
        const qtyLine = i.isTiered ? `Qty: ${i.quantity}` : `${i.quantity} × $${i.unitPrice.toFixed(2)}`;
        const lineTotal = i.isTiered ? i.unitPrice : i.unitPrice * i.quantity;
        return `<div class="order-detail-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;">
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:0.9rem;">${i.productName}</div>
                <div class="order-detail-qty">${qtyLine}</div>
                ${optionLines}
            </div>
            <div style="font-weight:700;color:var(--accent);white-space:nowrap;">$${lineTotal.toFixed(2)}</div>
        </div>`;
    }).join('') + `
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);">
                <span>Subtotal</span><span>$${itemsSubtotal.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--muted);">
                <span>Shipping (flat rate)</span><span>$${SHIPPING_COST.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:700;padding-top:6px;border-top:1px solid var(--border);">
                <span>Total</span><span style="color:var(--accent);">$${grandTotal.toFixed(2)}</span>
            </div>
        </div>`;

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

async function reopenPaymentModal(orderId, token) {
    try {
        const res = await fetch(`${API_BASE}/api/Orders/${orderId}/payment-info?token=${encodeURIComponent(token)}`);
        if (!res.ok) { showToast('Payment link is no longer valid. Please contact us.'); return; }
        const info = await res.json();
        pendingPayOrderId = String(orderId);
        pendingPayToken = token;
        pendingPayInfo = info;
        closeAccount();
        openProofPaymentModal(info);
    } catch { showToast('Could not load payment info. Please contact us.'); }
}

function closeProofPayModal() {
    document.getElementById('proofPayModal').classList.remove('show');
    document.body.style.overflow = '';
    if (window._proofPayCard) { window._proofPayCard.destroy(); window._proofPayCard = null; }
}

// FIX #1 — collect and send shipping address fields from proof payment modal
async function submitProofPayment() {
    if (!window._proofPayCard) { showToast('Payment form not ready.'); return; }

    const shipName = document.getElementById('proofShipName')?.value.trim() || '';
    const shipStreet = document.getElementById('proofShipStreet')?.value.trim() || '';
    const shipCity = document.getElementById('proofShipCity')?.value.trim() || '';
    const shipState = document.getElementById('proofShipState')?.value.trim() || '';
    const shipZip = document.getElementById('proofShipZip')?.value.trim() || '';

    if (!shipName) { showToast('Please enter the shipping name.'); return; }
    if (!shipStreet) { showToast('Please enter a shipping address.'); return; }
    if (!shipCity) { showToast('Please enter the city.'); return; }
    if (!shipState) { showToast('Please enter the state.'); return; }
    if (!shipZip) { showToast('Please enter the ZIP code.'); return; }

    const btn = document.getElementById('proofPayBtn');
    btn.disabled = true; btn.textContent = 'Processing...';
    try {
        const tokenResult = await window._proofPayCard.tokenize();
        if (tokenResult.status !== 'OK') {
            showToast(`Payment error: ${tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.'}`);
            return;
        }
        // Use _grandTotal (items + shipping) set by openProofPaymentModal; fall back to
        // totalPrice + SHIPPING_COST if the modal somehow wasn't used (belt-and-suspenders).
        const grandTotal = pendingPayInfo._grandTotal ?? (Number(pendingPayInfo.totalPrice) + SHIPPING_COST);
        const amountCents = Math.round(grandTotal * 100);
        const payRes = await fetch(`${API_BASE}/api/Payments/process`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId: tokenResult.token, amountCents })
        });
        if (!payRes.ok) { const e = await payRes.json(); showToast(`Payment failed: ${e.errors?.[0] || 'Unknown'}`); return; }
        const payment = await payRes.json();

        const completeRes = await fetch(`${API_BASE}/api/Orders/${pendingPayOrderId}/complete-payment`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paymentToken: pendingPayToken,
                squarePaymentId: payment.paymentId,
                shipToName: shipName,
                shipToStreet: shipStreet,
                shipToCity: shipCity,
                shipToState: shipState,
                shipToZip: shipZip
            })
        });
        if (!completeRes.ok) { showToast('Could not record payment. Please contact us.'); return; }

        closeProofPayModal();
        showToast(`Payment confirmed! We'll begin production right away. ✓`);
        pendingPayOrderId = null; pendingPayToken = null; pendingPayInfo = null;
    } catch {
        showToast('Something went wrong. Please try again.');
    } finally {
        btn.disabled = false; btn.textContent = 'Pay Now';
    }
}

// ── Sign In / Auth — UNIFIED ──────────────────────────────────────────────────

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

function closeSignInIfOutside(e) { }

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
        if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            if (body.code === 'EMAIL_NOT_CONFIRMED') {
                showEmailNotConfirmedBanner(email);
            } else {
                showToast('Sign in failed. Please try again.');
            }
            return;
        }
        if (!res.ok) throw new Error();
        currentUser = await res.json();
        try { localStorage.setItem('currentUser', JSON.stringify(currentUser)); } catch { }
        closeSignIn();
        updateNavAfterLogin();
        loadCart();
        updateBadge();
        await syncQuotesFromServer();
        if (isAdmin()) {
            showToast(`Welcome back, ${currentUser.name}! Admin access granted.`);
        } else {
            showToast(`Welcome back, ${currentUser.name}!`);
        }
    } catch { showToast('Sign in failed. Please try again.'); }
}

async function showEmailNotConfirmedBanner(email) {
    const form = document.getElementById('signInForm');
    form.innerHTML = `
        <div style="text-align:center;padding:8px 0 16px;">
            <div style="font-size:2rem;margin-bottom:12px;">✉️</div>
            <h3 style="margin:0 0 8px;font-size:1.1rem;font-weight:700;color:var(--text);">Confirm your email</h3>
            <p style="margin:0 0 16px;font-size:0.9rem;color:var(--muted);line-height:1.5;">
                We sent a confirmation link to <strong>${escHtml(email)}</strong>.<br>
                Please check your inbox and click the link before signing in.
            </p>
            <button onclick="resendConfirmationEmail('${escHtml(email)}')" style="
                padding:10px 24px;background:linear-gradient(135deg,#7c3aed,#5b21b6);
                color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;
                font-size:0.9rem;font-weight:600;cursor:pointer;margin-bottom:12px;width:100%;">
                Resend Confirmation Email
            </button>
            <button onclick="resetSignInForm()" style="
                padding:8px 24px;background:transparent;color:var(--muted);
                border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;
                font-size:0.85rem;cursor:pointer;width:100%;">
                Back to Sign In
            </button>
        </div>`;
}

async function resendConfirmationEmail(email) {
    try {
        await fetch(`${API_BASE}/api/Users/resend-confirmation`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        showToast('Confirmation email resent! Check your inbox.');
    } catch { showToast('Could not resend. Please try again.'); }
}

function resetSignInForm() {
    const form = document.getElementById('signInForm');
    form.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <input id="signInEmail" type="email" placeholder="Email" style="padding:10px 14px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:0.95rem;" />
            <input id="signInPassword" type="password" placeholder="Password" style="padding:10px 14px;border-radius:8px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:0.95rem;" />
            <button onclick="handleSignIn()" style="padding:11px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:0.95rem;font-weight:600;cursor:pointer;">Sign In</button>
            <p style="margin:0;font-size:0.85rem;color:var(--muted);text-align:center;">Don't have an account? <a href="#" onclick="switchToCreateAccount();return false;" style="color:var(--accent2);">Create one</a></p>
        </div>`;
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
        updateNavAfterLogin();
        showToast(`Account created! Welcome, ${currentUser.name}!`);
    } catch { showToast('Account creation failed. Please try again.'); }
}

function updateNavAfterLogin() {
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ` ${currentUser.name}`;
    const adminBtn = document.getElementById('adminNavBtn');
    adminBtn.style.display = isAdmin() ? 'flex' : 'none';
}

function loadSessionFromStorage() {
    try {
        const raw = localStorage.getItem('currentUser');
        if (raw) {
            currentUser = JSON.parse(raw);
            updateNavAfterLogin();
            loadCart();
            updateBadge();
            syncQuotesFromServer();
        }
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
function closeAccountIfOutside(e) { }

const _accountProofFilesMap = {};

// FIX #3 — show shipping address block and tracking card when status is Shipped
function renderAccountOrders(orders) {
    const list = document.getElementById('accountOrdersList');
    if (!orders || orders.length === 0) { list.innerHTML = '<div style="color:var(--muted);padding:1rem;">No orders to show.</div>'; return; }
    list.innerHTML = orders.map(o => {
        const isQuote = o.isQuoteRequest;
        const statusColor = getStatusColor(o.status);
        const proofFiles = (o.uploadedFiles || []).filter(f => f.originalFileName?.startsWith('PROOF_'));
        _accountProofFilesMap[o.id] = proofFiles;

        // Shipping address block (show when address is on file)
        const hasAddress = o.shipToStreet && o.shipToStreet.trim();
        const shippingAddressHtml = hasAddress ? `
            <div style="margin-top:0.5rem;font-size:0.82rem;color:var(--muted);">
                <span style="font-weight:600;color:var(--text);">Ship to:</span>
                ${o.shipToName ? escHtml(o.shipToName) + ' — ' : ''}${escHtml(o.shipToStreet)}, ${escHtml(o.shipToCity)}, ${escHtml(o.shipToState)} ${escHtml(o.shipToZip)}
            </div>` : '';

        // Tracking card — shown when status is Shipped and tracking info exists
        const trackingHtml = (o.status === 'Shipped' && o.trackingNumber) ? (() => {
            const _carrier = (o.shippingCarrier || '').toLowerCase();
            const trackingUrl = _carrier.includes('fedex')
                ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(o.trackingNumber)}`
                : _carrier.includes('ups')
                    ? `https://www.ups.com/track?tracknum=${encodeURIComponent(o.trackingNumber)}`
                    : `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(o.trackingNumber)}`;
            const eta = o.estimatedDelivery
                ? `Est. delivery: <strong>${parseDate(o.estimatedDelivery).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>`
                : '';
            return `
            <div style="margin-top:0.75rem;padding:0.65rem 0.85rem;background:rgba(6,182,212,0.08);border-radius:9px;border:1px solid rgba(6,182,212,0.25);">
                <div style="font-size:0.78rem;font-weight:700;color:#0891b2;margin-bottom:5px;">🚚 Your order has shipped!</div>
                <div style="font-size:0.82rem;color:var(--text);margin-bottom:2px;">
                    <span style="color:var(--muted);">Carrier:</span> <strong>${escHtml(o.shippingCarrier || '—')}</strong>
                </div>
                <div style="font-size:0.82rem;color:var(--text);margin-bottom:${eta ? '4px' : '0'};">
                    <span style="color:var(--muted);">Tracking:</span> <strong>${escHtml(o.trackingNumber)}</strong>
                </div>
                ${eta ? `<div style="font-size:0.82rem;color:var(--muted);">${eta}</div>` : ''}
                <a href="${trackingUrl}" target="_blank" rel="noopener"
                   style="display:inline-block;margin-top:8px;padding:5px 14px;background:linear-gradient(135deg,#06b6d4,#0891b2);color:#fff;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:0.8rem;font-weight:600;text-decoration:none;">
                    Track Package →
                </a>
            </div>`;
        })() : '';

        const proofSection = proofFiles.length > 0 ? `
            <div style="margin-top:0.75rem;padding:0.6rem 0.75rem;background:rgba(6,182,212,0.08);border-radius:8px;border:1px solid rgba(6,182,212,0.2);">
                <div style="font-size:0.78rem;font-weight:700;color:var(--accent);margin-bottom:6px;">Proofs Ready for Review</div>
                ${proofFiles.map((f, idx) => '<a href="' + API_BASE + '/api/Files/' + f.id + '/download" download="' + f.originalFileName.replace('PROOF_', '') + '" style="font-size:0.82rem;color:var(--accent2);display:block;margin-bottom:3px;">⬇ Proof' + (proofFiles.length > 1 ? ' ' + (idx + 1) : '') + '</a>').join('')}
                ${o.status === 'ProofSent' ? `<button onclick="openProofReviewModal(${o.id}, null)" style="margin-top:8px;padding:6px 16px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:0.85rem;font-weight:600;cursor:pointer;">Review Proof</button>` : ''}
                ${o.status === 'AwaitingPayment' ? `<button onclick="reopenPaymentModal(${o.id}, '${o.paymentToken}')" style="margin-top:8px;padding:6px 16px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:0.85rem;font-weight:600;cursor:pointer;">Complete Payment</button>` : ''}
            </div>` : '';

        return `
        <div class="order-card">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                <div>
                    <div style="font-weight:700;">${isQuote ? 'Quote Request' : 'Order'}</div>
                    <div style="font-size:0.85rem;color:var(--muted);">${parseDate(o.createdAt).toLocaleString()}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:0.75rem;font-weight:700;padding:3px 10px;border-radius:20px;background:${statusColor.bg};color:${statusColor.text}">${formatStatus(o.status)}</span>
                    <span style="font-weight:700;color:var(--accent);">$${o.totalPrice.toFixed(2)}</span>
                </div>
            </div>
            <div style="margin-top:0.5rem;font-size:0.9rem;">${o.items.map(it => {
            const optionLines = (it.options || []).filter(op => op.priceModifier !== 0).map(op =>
                `<div style="font-size:0.8rem;color:var(--muted);padding-left:8px;">+ ${escHtml(op.optionValue)} <span style="color:var(--accent2);">+$${op.priceModifier.toFixed(2)} each</span></div>`
            ).join('');
            const baseLineTotal = it.isTiered ? it.unitPrice : it.unitPrice * it.quantity;
            return `<div style="margin-bottom:6px;"><div>${it.quantity}x ${escHtml(it.productName)} <span style="color:var(--muted);">— $${baseLineTotal.toFixed(2)}</span></div>${optionLines}</div>`;
        }).join('')}</div>
            ${o.designNotes ? `<div style="margin-top:6px;font-size:0.8rem;color:var(--muted);font-style:italic;">Notes: ${escHtml(o.designNotes)}</div>` : ''}
            ${shippingAddressHtml}
            ${trackingHtml}
            ${proofSection}
        </div>`;
    }).join('');
}

// ── Proof Review Modal ───────────────────────────────────────────────────────

let proofReviewOrderId = null;
let proofReviewToken = null;

function openProofReviewModal(orderId, token) {
    closeAccount();
    const proofFiles = _accountProofFilesMap[orderId] || [];
    proofReviewOrderId = orderId;
    proofReviewToken = token || null;
    document.getElementById('proofReviewSubtitle').textContent = '';
    document.getElementById('proofReviewComments').value = '';

    const filesEl = document.getElementById('proofReviewFiles');
    if (proofFiles && proofFiles.length > 0) {
        filesEl.innerHTML = `
            <div style="padding:0.75rem;background:rgba(6,182,212,0.08);border-radius:8px;border:1px solid rgba(6,182,212,0.2);">
                <div style="font-size:0.78rem;font-weight:700;color:var(--accent);margin-bottom:6px;">📄 Your Proof Files</div>
                ${proofFiles.map((f, idx) => '<a href="' + API_BASE + '/api/Files/' + f.id + '/download" target="_blank" style="font-size:0.85rem;color:var(--accent2);display:block;margin-bottom:3px;">⬇ Proof' + (proofFiles.length > 1 ? ' ' + (idx + 1) : '') + '</a>').join('')}
            </div>`;
    } else {
        filesEl.innerHTML = '';
    }

    document.getElementById('proofReviewModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeProofReviewModal() {
    document.getElementById('proofReviewModal').classList.remove('show');
    document.body.style.overflow = '';
    proofReviewOrderId = null;
    proofReviewToken = null;
}

async function submitProofFeedback(action) {
    if (!proofReviewOrderId) return;

    const comments = document.getElementById('proofReviewComments').value.trim();

    if (action === 'revision' && !comments) {
        showToast('Please describe what changes you need before submitting.');
        return;
    }
    if (action === 'cancel') {
        if (!confirm('Are you sure you want to request cancellation? Our team will review and follow up with you.')) return;
    }

    const body = { action, comments };
    if (proofReviewToken) body.token = proofReviewToken;
    else if (currentUser) body.userId = currentUser.id;

    try {
        const res = await fetch(`${API_BASE}/api/Orders/${proofReviewOrderId}/proof-feedback`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) { showToast('Something went wrong. Please try again.'); return; }
        const data = await res.json();

        closeProofReviewModal();

        if (action === 'approve') {
            showToast('Proof approved! Check your email for the payment link. ✓');
            if (data.paymentUrl) {
                const params = new URLSearchParams(data.paymentUrl.replace('/?', ''));
                const payOrder = params.get('payOrder');
                const token = params.get('token');
                if (payOrder && token) {
                    window.location.search = `?payOrder=${payOrder}&token=${token}`;
                }
            }
        } else if (action === 'revision') {
            showToast("Changes requested! We'll review your feedback and send a revised proof. ✓");
        } else if (action === 'cancel') {
            showToast('Cancellation request sent. Our team will follow up with you shortly.');
        }

        if (typeof openAccount === 'function' && currentUser) openAccount();
    } catch { showToast('Something went wrong. Please try again.'); }
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
        updateNavAfterLogin();
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
    try { localStorage.removeItem('submittedQuotes'); } catch { }
    clearCart();
    currentUser = null;
    submittedQuotes = [];
    updateQuotesBadge();
    const btn = document.getElementById('authNavBtn');
    const textNode = [...btn.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
    if (textNode) textNode.textContent = ' Sign In';
    document.getElementById('adminNavBtn').style.display = 'none';
    closeAccount();
    closeAdminPanel();
    showToast('Signed out');
}

// ── Admin Panel ───────────────────────────────────────────────────────────────

async function openAdminPanel() {
    if (!isAdmin()) { showToast('Admin access required.'); return; }
    document.getElementById('adminOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
    switchAdminTab(adminActiveTab);
}

function closeAdminPanel() { document.getElementById('adminOverlay').classList.remove('show'); document.body.style.overflow = ''; }
function closeAdminIfOutside(e) { }

function switchAdminTab(tab) {
    const prev = adminActiveTab;
    adminActiveTab = tab;
    ['products', 'orders', 'files'].forEach(t => {
        const btn = document.getElementById(`adminTab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle('active', t === tab);
    });
    document.getElementById('adminProductsPane').style.display = tab === 'products' ? 'grid' : 'none';
    document.getElementById('adminOrdersPane').style.display = tab === 'orders' ? 'flex' : 'none';
    document.getElementById('adminFilesPane').style.display = tab === 'files' ? 'block' : 'none';
    if (tab === 'products') {
        if (adminProducts.length === 0) {
            adminLoadProducts().then(() => { if (adminActiveId) adminStartEdit(adminActiveId); });
        } else {
            adminRenderList();
            if (adminActiveId) adminStartEdit(adminActiveId);
        }
    }
    if (tab === 'orders') {
        if (adminOrders.length === 0) {
            adminLoadOrders().then(() => { if (adminActiveOrderId) adminSelectOrder(adminActiveOrderId); });
        } else {
            adminRenderOrders();
            if (adminActiveOrderId) adminSelectOrder(adminActiveOrderId);
        }
    }
    if (tab === 'files') adminLoadFiles();
}

function adminSignOut() { signOut(); }

// ── Admin: Products ───────────────────────────────────────────────────────────

async function adminLoadProducts() {
    try {
        const res = await fetch(`${API_BASE}/api/Products/all`, {
            headers: { 'X-User-Id': String(currentUser?.id), 'X-User-Role': currentUser?.role || '' }
        });
        const r = res.ok ? res : await fetch(`${API_BASE}/api/Products`);
        if (!r.ok) throw new Error();
        adminProducts = await r.json();
        adminRenderList();
    } catch { showToast('Failed to load products'); }
}

function adminRenderList() {
    const list = document.getElementById('adminProductList');
    const query = document.getElementById('adminProductSearch')?.value.trim().toLowerCase() || '';
    const filtered = query ? adminProducts.filter(p => p.name.toLowerCase().includes(query)) : adminProducts;
    document.getElementById('adminCountBadge').textContent = adminProducts.length;
    if (filtered.length === 0) { list.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">No products found.</div>'; return; }
    list.innerHTML = filtered.map((p, i) => `
        <div class="admin-product-card ${p.id === adminActiveId ? 'active' : ''}" data-product-id="${p.id}" style="animation-delay:${i * 0.03}s" onclick="adminStartEdit(${p.id})">
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
    adminRenderTierRows([]);
    adminRenderOptionRows([]);
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    document.querySelectorAll('.admin-product-card').forEach(c => c.classList.remove('active'));
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
    adminRenderTierRows(p.priceTiers || []);
    adminRenderOptionRows(p.options || []);
    document.getElementById('adminPlaceholder').style.display = 'none';
    document.getElementById('adminEditForm').style.display = 'flex';
    document.getElementById('adminFName').focus();
    document.querySelectorAll('.admin-product-card').forEach(c => c.classList.toggle('active', c.dataset.productId == id));
}

// ── Tier rows ─────────────────────────────────────────────────────────────────

function adminRenderTierRows(tiers) {
    const c = document.getElementById('adminTiersContainer');
    const empty = document.getElementById('adminTiersEmpty');
    const header = document.getElementById('adminTierHeader');
    c.innerHTML = '';
    if (tiers.length === 0) {
        if (empty) empty.style.display = '';
        if (header) header.style.display = 'none';
        return;
    }
    if (empty) empty.style.display = 'none';
    if (header) header.style.display = 'grid';
    tiers.forEach((t, i) => c.appendChild(adminMakeTierRow(t.minQty, t.price, i)));
}

function adminMakeTierRow(minQty = '', price = '', index = Date.now()) {
    const row = document.createElement('div');
    row.className = 'admin-tier-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center;';
    row.innerHTML = `
        <input type="number" class="tier-qty" min="1" step="1" placeholder="Qty" value="${minQty}"
            style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
        <input type="number" class="tier-price" min="0" step="0.01" placeholder="Price" value="${price}"
            style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
        <button type="button" onclick="adminRemoveTierRow(this)"
            style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;padding:4px;line-height:1;">✕</button>`;
    return row;
}

function adminAddTierRow() {
    const c = document.getElementById('adminTiersContainer');
    const empty = document.getElementById('adminTiersEmpty');
    const header = document.getElementById('adminTierHeader');
    if (empty) empty.style.display = 'none';
    if (header) header.style.display = 'grid';
    c.appendChild(adminMakeTierRow());
}

function adminRemoveTierRow(btn) {
    btn.closest('.admin-tier-row').remove();
    const c = document.getElementById('adminTiersContainer');
    if (!c.querySelector('.admin-tier-row')) {
        document.getElementById('adminTiersEmpty').style.display = '';
        document.getElementById('adminTierHeader').style.display = 'none';
    }
}

function adminCollectTiers() {
    return [...document.querySelectorAll('#adminTiersContainer .admin-tier-row')]
        .map(row => ({
            minQty: parseInt(row.querySelector('.tier-qty').value) || 0,
            price: parseFloat(row.querySelector('.tier-price').value) || 0,
            label: ''
        }))
        .filter(t => t.minQty > 0 && t.price > 0)
        .sort((a, b) => a.minQty - b.minQty);
}

// ── Option rows ───────────────────────────────────────────────────────────────

function adminRenderOptionRows(options) {
    const c = document.getElementById('adminOptionsContainer');
    const empty = document.getElementById('adminOptionsEmpty');
    c.innerHTML = '';
    if (options.length === 0) { if (empty) empty.style.display = ''; return; }
    if (empty) empty.style.display = 'none';
    options.forEach(o => c.appendChild(adminMakeOptionRow(o.optionName, o.optionValue, o.priceModifier)));
}

function adminMakeOptionRow(name = '', value = '', modifier = 0) {
    const row = document.createElement('div');
    row.className = 'admin-option-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 80px auto;gap:6px;margin-bottom:6px;align-items:center;';
    row.innerHTML = `
        <input type="text" class="opt-name" placeholder="Group (e.g. Finish)" value="${escHtml(name)}"
            style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
        <input type="text" class="opt-value" placeholder="Label (e.g. Double Sided)" value="${escHtml(value)}"
            style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
        <input type="number" class="opt-mod" step="0.01" placeholder="+$0.00" value="${modifier || ''}"
            style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;width:100%;" />
        <button type="button" onclick="adminRemoveOptionRow(this)"
            style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:16px;padding:4px;line-height:1;">✕</button>`;
    return row;
}

function adminAddOptionRow() {
    const c = document.getElementById('adminOptionsContainer');
    const empty = document.getElementById('adminOptionsEmpty');
    if (empty) empty.style.display = 'none';
    c.appendChild(adminMakeOptionRow());
}

function adminRemoveOptionRow(btn) {
    btn.closest('.admin-option-row').remove();
    const c = document.getElementById('adminOptionsContainer');
    if (!c.querySelector('.admin-option-row'))
        document.getElementById('adminOptionsEmpty').style.display = '';
}

function adminCollectOptions() {
    return [...document.querySelectorAll('#adminOptionsContainer .admin-option-row')]
        .map(row => ({
            optionName: row.querySelector('.opt-name').value.trim(),
            optionValue: row.querySelector('.opt-value').value.trim(),
            priceModifier: parseFloat(row.querySelector('.opt-mod').value) || 0
        }))
        .filter(o => o.optionName && o.optionValue);
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
    const tiers = adminCollectTiers();
    const options = adminCollectOptions();
    const payload = {
        name: document.getElementById('adminFName').value.trim(),
        description: document.getElementById('adminFDesc').value.trim(),
        basePrice: parseFloat(document.getElementById('adminFPrice').value),
        minPrice: tiers.length ? tiers[0].price : 0,
        maxPrice: tiers.length ? tiers[tiers.length - 1].price : 0,
        isActive: true,
        options,
        priceTiers: tiers
    };
    try {
        let res;
        const productId = document.getElementById('adminProductId').value;
        if (adminIsEditMode && productId) {
            res = await fetch(`${API_BASE}/api/Products/${productId}`, {
                method: 'PUT', headers: adminHeaders(), body: JSON.stringify(payload)
            });
        } else {
            res = await fetch(`${API_BASE}/api/Products`, {
                method: 'POST', headers: adminHeaders(), body: JSON.stringify(payload)
            });
        }
        if (res.ok || res.status === 204) {
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
        const res = await fetch(`${API_BASE}/api/Products/${adminDeleteTargetId}`, {
            method: 'DELETE',
            headers: adminHeaders()
        });
        if (res.ok || res.status === 204) {
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

    container.innerHTML = `
        <div class="admin-orders-layout">
            <div class="admin-orders-list" id="adminOrdersList" style="display:flex;flex-direction:column;gap:0;">
                <div style="padding:10px 10px 6px;flex-shrink:0;">
                    <input id="adminOrderSearch" type="text" placeholder="Search by name, email, order #…"
                        oninput="adminFilterOrders()"
                        style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;outline:none;box-sizing:border-box;" />
                </div>
                <div id="adminOrderCards" class="admin-product-list" style="display:flex;flex-direction:column;gap:6px;padding:0 10px 10px;">
                    ${adminOrders.map(o => adminOrderCard(o)).join('')}
                </div>
            </div>
            <div class="admin-order-detail" id="adminOrderDetail">
                <div class="admin-placeholder" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" style="opacity:0.25;margin-bottom:12px;"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"/></svg>
                    <p style="font-size:0.9rem;color:var(--muted);">Select an order to view details</p>
                </div>
            </div>
        </div>`;
}

function adminFilterOrders() {
    const query = document.getElementById('adminOrderSearch')?.value.trim().toLowerCase() || '';
    const cards = document.getElementById('adminOrderCards');
    if (!cards) return;
    const filtered = query ? adminOrders.filter(o => {
        const name = (o.customerName || '').toLowerCase();
        const email = (o.customerEmail || o.guestEmail || '').toLowerCase();
        const id = String(o.id);
        return name.includes(query) || email.includes(query) || id.includes(query);
    }) : adminOrders;
    if (filtered.length === 0) {
        cards.innerHTML = '<div style="padding:1.5rem;color:var(--muted);text-align:center;font-size:13px;">No orders match your search.</div>';
        return;
    }
    cards.innerHTML = filtered.map(o => adminOrderCard(o)).join('');
    // Re-highlight active order if still in results
    if (adminActiveOrderId) {
        cards.querySelectorAll('.admin-order-card').forEach(c => {
            c.classList.toggle('active', c.textContent.includes(`#${adminActiveOrderId}`));
        });
    }
}

function adminOrderCard(o) {
    const sc = getStatusColor(o.status);
    const label = o.isQuoteRequest ? 'Quote' : 'Order';
    const contact = o.customerName || o.customerEmail || o.guestEmail || `User #${o.userId}`;
    return `
        <div class="admin-order-card" onclick="adminSelectOrder(${o.id})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div>
                    <div style="font-size:13px;font-weight:700;">${label} #${o.id}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:1px;">${contact}</div>
                </div>
                <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap;background:${sc.bg};color:${sc.text}">${formatStatus(o.status)}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">${parseDate(o.createdAt).toLocaleDateString()}</div>
            <div style="font-size:13px;font-weight:700;color:var(--accent);margin-top:2px;">$${o.totalPrice.toFixed(2)}</div>
        </div>`;
}

async function adminSelectOrder(id) {
    adminActiveOrderId = id;
    const order = adminOrders.find(o => o.id === id);
    if (!order) return;

    const cardContainer = document.getElementById('adminOrderCards') || document;
    cardContainer.querySelectorAll('.admin-order-card').forEach(c => {
        c.classList.toggle('active', c.textContent.includes(`#${id}`));
    });

    const sc = getStatusColor(order.status);
    const proofFiles = (order.uploadedFiles || []).filter(f => f.originalFileName?.startsWith('PROOF_'));
    const designFiles = (order.uploadedFiles || []).filter(f => !f.originalFileName?.startsWith('PROOF_'));

    const statusOptions = order.isQuoteRequest
        ? ['QuoteRequested', 'ProofSent', 'RevisionRequested', 'CancellationRequested', 'ProofApproved', 'AwaitingPayment', 'Paid', 'Shipped', 'Completed', 'Cancelled']
        : ['Paid', 'Shipped', 'Completed', 'Cancelled'];

    document.getElementById('adminOrderDetail').innerHTML = `
        <div style="padding:24px;overflow-y:auto;flex:1;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-size:18px;font-weight:700;">${order.isQuoteRequest ? 'Quote' : 'Order'} #${order.id}</div>
                    <div style="font-size:12px;color:var(--muted);margin-top:2px;">${parseDate(order.createdAt).toLocaleString()}</div>
                </div>
                <span style="font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;background:${sc.bg};color:${sc.text}">${formatStatus(order.status)}</span>
            </div>

            <div class="admin-detail-section">
                <div class="admin-detail-label">Contact</div>
                ${order.customerName ? `<div style="font-weight:600;font-size:13px;">${escHtml(order.customerName)}</div>` : ''}
                <div style="font-size:13px;margin-top:2px;">
                    <a href="mailto:${escHtml(order.customerEmail || order.guestEmail || '')}" style="color:var(--accent2);">${escHtml(order.customerEmail || order.guestEmail || `User #${order.userId}`)}</a>
                </div>
                ${order.customerPhone ? `<div style="font-size:13px;margin-top:2px;color:var(--muted);">${escHtml(formatPhone(order.customerPhone))}</div>` : ''}
            </div>

            <div class="admin-detail-section">
                <div class="admin-detail-label">Items</div>
                ${(order.items || []).map(i => {
        const linePrice = i.isTiered ? i.unitPrice : i.unitPrice * i.quantity;
        const qtyLabel = i.isTiered ? `qty ${i.quantity}` : `${i.quantity}×`;
        const optionLines = (i.options || []).filter(o => o.priceModifier !== 0).map(o =>
            `<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0 2px 12px;color:var(--muted);">
                <span>+ ${escHtml(o.optionValue)}</span>
                <span>+$${o.priceModifier.toFixed(2)}</span>
            </div>`
        ).join('');
        return `
            <div style="padding:4px 0;border-bottom:1px solid var(--border);">
                <div style="display:flex;justify-content:space-between;font-size:13px;">
                    <span><strong>${qtyLabel}</strong> ${escHtml(i.productName)}</span>
                    <span style="font-weight:600;">$${linePrice.toFixed(2)}</span>
                </div>
                ${optionLines}
            </div>`;
    }).join('')}
                ${order.shippingCost > 0 ? `
                <div style="display:flex;justify-content:space-between;font-size:13px;padding-top:6px;color:var(--muted);">
                    <span>Shipping</span><span>$${Number(order.shippingCost).toFixed(2)}</span>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;">
                    <span>Total</span><span style="color:var(--accent);">$${order.totalPrice.toFixed(2)}</span>
                </div>
            </div>

            <div class="admin-detail-section">
                <div class="admin-detail-label">Shipping</div>
                ${order.shipToStreet ? `
                    <div style="font-size:13px;color:var(--text);line-height:1.6;">
                        ${order.shipToName ? `<span style="font-weight:600;">${escHtml(order.shipToName)}</span> — ` : ''}${escHtml(order.shipToStreet)}, ${escHtml(order.shipToCity)}, ${escHtml(order.shipToState)} ${escHtml(order.shipToZip)}
                    </div>
                ` : `<div style="font-size:13px;color:var(--muted);">No shipping address on file.</div>`}
                ${order.trackingNumber ? `
                    <div style="margin-top:8px;padding:8px 10px;background:rgba(16,185,129,0.08);border-radius:8px;border:1px solid rgba(16,185,129,0.2);font-size:13px;">
                        <span style="font-weight:600;color:#059669;">Shipped</span> via ${escHtml(order.shippingCarrier)} —
                        <strong>${escHtml(order.trackingNumber)}</strong>
                        ${order.estimatedDelivery ? `<span style="color:var(--muted);"> · Est. ${parseDate(order.estimatedDelivery).toLocaleDateString()}</span>` : ''}
                    </div>
                ` : (order.shipToStreet && ['Paid', 'Completed'].includes(order.status) ? `
                    <div style="margin-top:10px;">
                        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                            <select id="shipCarrier-${order.id}" style="padding:6px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;">
                                <option value="">Carrier…</option>
                                <option value="USPS">USPS</option>
                                <option value="FedEx">FedEx</option>
                                <option value="UPS">UPS</option>
                            </select>
                            <input type="text" id="shipTracking-${order.id}" placeholder="Tracking #" style="flex:1;min-width:120px;padding:6px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;" />
                            <input type="date" id="shipEta-${order.id}" title="Est. delivery (optional)" style="padding:6px 10px;border-radius:7px;border:1.5px solid var(--border);background:var(--bg);color:var(--text);font-family:'DM Sans',sans-serif;font-size:13px;" />
                            <button onclick="adminMarkShipped(${order.id})" style="padding:6px 14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Ship ✓</button>
                        </div>
                    </div>
                ` : '')}
            </div>

            ${order.designNotes ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">${order.isQuoteRequest ? 'Design Notes' : 'Special Instructions'}</div>
                <div style="font-size:13px;font-style:italic;color:var(--muted);">"${escHtml(order.designNotes)}"</div>
            </div>` : ''}

            ${order.proofComments ? `
            <div class="admin-detail-section" style="border-left:3px solid #f59e0b;padding-left:10px;">
                <div class="admin-detail-label" style="color:#f59e0b;">Customer Proof Feedback</div>
                <div style="font-size:13px;color:var(--text);">"${escHtml(order.proofComments)}"</div>
            </div>` : ''}

            ${designFiles.length > 0 ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Customer Files</div>
                ${designFiles.map(f => `<a href="${API_BASE}/api/Files/${f.id}/download" download="${f.originalFileName}" style="display:block;font-size:13px;color:var(--accent2);margin-bottom:4px;">⬇ ${f.originalFileName}</a>`).join('')}
            </div>` : ''}

            ${proofFiles.length > 0 ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Uploaded Proofs</div>
                ${proofFiles.map(f => `<a href="${API_BASE}/api/Files/${f.id}/download" download="${f.originalFileName.replace('PROOF_', '')}" style="display:block;font-size:13px;color:var(--accent);margin-bottom:4px;">⬇ ${f.originalFileName.replace('PROOF_', '')}</a>`).join('')}
            </div>` : ''}

            ${order.isQuoteRequest && ['QuoteRequested', 'ProofSent', 'RevisionRequested'].includes(order.status) ? `
            <div class="admin-detail-section">
                <div class="admin-detail-label">Upload Proof</div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input type="file" id="proofFileInput-${order.id}" accept=".pdf,.png,.jpg,.jpeg,.ai,.eps,.svg" style="font-size:13px;flex:1;min-width:0;" />
                    <button onclick="adminUploadProof(${order.id})" style="padding:8px 16px;background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;border:none;border-radius:8px;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">Upload</button>
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
        showToast('Proof uploaded! Status set to Proof Sent.');
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
        showToast('Status updated! Customer notified.');
        await adminLoadOrders();
        adminSelectOrder(orderId);
    } catch { showToast('Network error.'); }
}

async function adminMarkShipped(orderId) {
    const carrier = document.getElementById(`shipCarrier-${orderId}`)?.value;
    const tracking = document.getElementById(`shipTracking-${orderId}`)?.value.trim();
    const eta = document.getElementById(`shipEta-${orderId}`)?.value;
    if (!carrier) { showToast('Please select a carrier.'); return; }
    if (!tracking) { showToast('Please enter a tracking number.'); return; }
    try {
        const res = await fetch(`${API_BASE}/api/Orders/${orderId}/ship`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shippingCarrier: carrier, trackingNumber: tracking, estimatedDelivery: eta || null })
        });
        if (!res.ok) { showToast('Failed to mark as shipped.'); return; }
        showToast('Order marked as shipped! Customer notified. ✓');
        await adminLoadOrders();
        adminSelectOrder(orderId);
    } catch { showToast('Network error.'); }
}

// ── Admin: File Archive ────────────────────────────────────────────────────────

async function adminLoadFiles() {
    const container = document.getElementById('adminFilesList');
    container.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">Loading files...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/Files/all`);
        if (!res.ok) throw new Error();
        const files = await res.json();
        adminRenderFiles(files);
    } catch {
        container.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">Failed to load files.</div>';
    }
}

function adminRenderFiles(files) {
    const container = document.getElementById('adminFilesList');
    if (!files || files.length === 0) {
        container.innerHTML = '<div style="padding:2rem;color:var(--muted);text-align:center;">No files uploaded yet.</div>';
        return;
    }

    const grouped = {};
    files.forEach(f => {
        const key = f.orderId ? `Order #${f.orderId}` : 'Unattached';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(f);
    });

    container.innerHTML = Object.entries(grouped).map(([group, groupFiles]) => `
        <div style="margin-bottom:24px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border);">${group}</div>
            <div style="display:grid;gap:8px;">
                ${groupFiles.map(f => {
        const isProof = f.originalFileName?.startsWith('PROOF_');
        const displayName = isProof ? f.originalFileName.replace('PROOF_', '') : f.originalFileName;
        const icon = isProof ? '🖨️' : '📎';
        const tagColor = isProof ? 'rgba(6,182,212,0.12)' : 'rgba(124,58,237,0.12)';
        const tagText = isProof ? '#06b6d4' : '#7c3aed';
        const tagLabel = isProof ? 'Proof' : 'Customer File';
        return `
                        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--surface);border-radius:10px;border:1px solid var(--border);">
                            <span style="font-size:18px;">${icon}</span>
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(displayName)}</div>
                                <div style="font-size:11px;color:var(--muted);">${parseDate(f.uploadedAt).toLocaleString()}</div>
                            </div>
                            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${tagColor};color:${tagText};white-space:nowrap;">${tagLabel}</span>
                            <a href="${API_BASE}/api/Files/${f.id}/download" download="${escHtml(displayName)}" style="padding:6px 12px;background:var(--accent2);color:#fff;border-radius:7px;font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap;">⬇ Download</a>
                        </div>`;
    }).join('')}
            </div>
        </div>
    `).join('');
}

init();