const API_BASE = 'http://localhost:5249';

let products = [];
let cart = [];

async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error('Failed to load products');
        products = await res.json();
        renderProducts();
        populateCalculatorDropdown();
    } catch (e) {
        showToast('Could not connect to server. Please try again later.');
    }
}


// --- PRODUCT GRID ---

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    grid.innerHTML = products.map(p => `
    <div class="product-card" id="card-${p.id}">
      <div class="product-name">${p.name}</div>
      <div class="product-price">$${p.basePrice.toFixed(2)}</div>
      <div class="product-unit">per unit (starting price)</div>
      <button class="btn-add-quote" onclick="quickAddToQuote(${p.id})">
        <svg viewBox="0 0 24 24">
          <circle cx="9" cy="21" r="1"/>
          <circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        Add to Quote
      </button>
    </div>
  `).join('');
}

function quickAddToQuote(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    addToCart({
        productId: product.id,
        name: product.name,
        basePrice: product.basePrice,
        selectedOptions: [],
        qty: 1
    });

    const card = document.getElementById('card-' + productId);
    card.classList.add('active-card');
    setTimeout(() => card.classList.remove('active-card'), 1500);
}


// --- CALCULATOR ---

function populateCalculatorDropdown() {
    const sel = document.getElementById('calcProduct');
    sel.innerHTML = '<option value="">Choose a product...</option>';
    products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} ($${p.basePrice.toFixed(2)}/unit)`;
        sel.appendChild(opt);
    });
}

function updateCalculator() {
    const sel = document.getElementById('calcProduct');
    const productId = parseInt(sel.value);
    const product = products.find(p => p.id === productId);

    if (!product) {
        document.getElementById('calcOptions').style.display = 'none';
        document.getElementById('priceEstimate').style.display = 'none';
        return;
    }

    document.getElementById('calcOptions').style.display = 'block';
    document.getElementById('priceEstimate').style.display = 'block';

    renderCalculatorOptions(product);
    recalculate(product);
}

function renderCalculatorOptions(product) {
    const container = document.getElementById('calcOptions');

    // Group options by OptionName
    const groups = {};
    product.options.forEach(opt => {
        if (!groups[opt.optionName]) groups[opt.optionName] = [];
        groups[opt.optionName].push(opt);
    });

    const optionsGrid = document.getElementById('dynamicOptionsGrid');
    if (!optionsGrid) {
        // Create the grid dynamically if it doesn't exist
        const grid = document.createElement('div');
        grid.className = 'options-grid';
        grid.id = 'dynamicOptionsGrid';
        container.innerHTML = '';
        container.appendChild(grid);
    }

    document.getElementById('dynamicOptionsGrid').innerHTML = Object.entries(groups).map(([groupName, opts]) => `
    <div class="form-group">
      <label class="form-label">${groupName}</label>
      <select class="calc-option-select" onchange="recalculate(null)">
        ${opts.map(o => `
          <option value="${o.id}" data-add="${o.priceModifier}">
            ${o.optionValue}${o.priceModifier > 0 ? ` (+$${o.priceModifier.toFixed(2)})` : ''}
          </option>
        `).join('')}
      </select>
    </div>
  `).join('');
}

function recalculate(product) {
    if (!product) {
        const sel = document.getElementById('calcProduct');
        product = products.find(p => p.id === parseInt(sel.value));
    }
    if (!product) return;

    const qty = parseInt(document.getElementById('calcQty').value) || 1;
    let optionsTotal = 0;

    document.querySelectorAll('.calc-option-select').forEach(sel => {
        const add = parseFloat(sel.selectedOptions[0]?.dataset.add || 0);
        optionsTotal += add;
    });

    const perUnit = product.basePrice + optionsTotal;
    const subtotal = perUnit * qty;

    document.getElementById('estBase').textContent = `$${product.basePrice.toFixed(2)}`;
    document.getElementById('estPerUnit').textContent = `$${perUnit.toFixed(2)}`;
    document.getElementById('estQty').textContent = `×${qty}`;
    document.getElementById('estSub').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('estTotal').textContent = `$${subtotal.toFixed(2)}`;
}

function addToQuoteFromCalc() {
    const sel = document.getElementById('calcProduct');
    const product = products.find(p => p.id === parseInt(sel.value));

    if (!product) {
        showToast('Please select a product first.');
        return;
    }

    const qty = parseInt(document.getElementById('calcQty').value) || 1;
    let optionsTotal = 0;
    const selectedOptions = [];

    document.querySelectorAll('.calc-option-select').forEach(optSel => {
        const chosen = optSel.selectedOptions[0];
        const add = parseFloat(chosen?.dataset.add || 0);
        optionsTotal += add;
        selectedOptions.push({
            productOptionId: parseInt(optSel.value),
            optionName: optSel.closest('.form-group').querySelector('label').textContent,
            optionValue: chosen?.textContent.trim(),
            priceModifier: add
        });
    });

    addToCart({
        productId: product.id,
        name: product.name,
        basePrice: product.basePrice,
        selectedOptions,
        qty
    });
}


// --- CART ---

function addToCart(item) {
    const existing = cart.find(i => i.productId === item.productId);
    if (existing) {
        existing.qty += item.qty;
    } else {
        cart.push({ ...item });
    }
    updateBadge();
    showToast(`"${item.name}" added to quotes!`);
}

function renderCart() {
    const list = document.getElementById('quotesList');
    const summary = document.getElementById('quoteSummary');

    if (cart.length === 0) {
        list.innerHTML = '<div class="empty-quote">Your quote cart is empty.<br>Add products to get started.</div>';
        summary.style.display = 'none';
        return;
    }

    list.innerHTML = cart.map((item, i) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + o.priceModifier, 0);
        return `
      <div class="quote-item">
        <div class="quote-item-name">${item.name}</div>
        <div class="quote-item-price-unit">$${unitPrice.toFixed(2)} per unit</div>
        ${item.selectedOptions.length > 0 ? `
          <div style="font-size:0.8rem;color:var(--muted);margin-bottom:8px;">
            ${item.selectedOptions.map(o => `${o.optionName}: ${o.optionValue}`).join(' · ')}
          </div>` : ''}
        <div class="quote-item-row">
          <div class="qty-wrap">
            <span>Qty:</span>
            <input class="qty-input" type="number" value="${item.qty}" min="1"
                   onchange="updateQty(${i}, this.value)" />
          </div>
          <div class="quote-item-total">$${(unitPrice * item.qty).toFixed(2)}</div>
        </div>
        <button class="remove-btn" onclick="removeItem(${i})">✕</button>
      </div>
    `;
    }).join('');

    const subtotal = cart.reduce((s, item) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((os, o) => os + o.priceModifier, 0);
        return s + unitPrice * item.qty;
    }, 0);
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);

    document.getElementById('summaryItems').textContent = totalItems;
    document.getElementById('summaryTotal').textContent = `$${subtotal.toFixed(2)}`;
    summary.style.display = 'block';
}

function updateQty(index, val) {
    cart[index].qty = Math.max(1, parseInt(val) || 1);
    renderCart();
    updateBadge();
}

function removeItem(index) {
    cart.splice(index, 1);
    renderCart();
    updateBadge();
}

function updateBadge() {
    const badge = document.getElementById('quoteBadge');
    const total = cart.reduce((s, i) => s + i.qty, 0);
    badge.textContent = total;
    badge.style.display = total > 0 ? 'inline-flex' : 'none';
}


// --- QUOTE PANEL ---

function openQuotes() {
    renderCart();
    document.getElementById('quotesOverlay').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeQuotes() {
    document.getElementById('quotesOverlay').classList.remove('show');
    document.body.style.overflow = '';
}

function closeIfOutside(e) {
    if (e.target === document.getElementById('quotesOverlay')) closeQuotes();
}


// --- REQUEST MODAL ---

function openRequestModal() {
    if (cart.length === 0) {
        showToast('Add items to your quote first.');
        return;
    }

    closeQuotes();

    document.getElementById('submittedTime').textContent = new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    });

    const orderDiv = document.getElementById('modalOrderDetails');
    orderDiv.innerHTML = cart.map(item => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((s, o) => s + o.priceModifier, 0);
        return `
      <div class="order-detail-card">
        <div>
          <div style="font-weight:700;">${item.name}</div>
          ${item.selectedOptions.length > 0 ? `
            <div style="font-size:0.8rem;color:var(--muted);">
              ${item.selectedOptions.map(o => `${o.optionName}: ${o.optionValue}`).join(' · ')}
            </div>` : ''}
          <div class="order-detail-qty">Quantity: ${item.qty}</div>
        </div>
        <div style="font-weight:700;">$${(unitPrice * item.qty).toFixed(2)}</div>
      </div>
    `;
    }).join('');

    const subtotal = cart.reduce((s, item) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((os, o) => os + o.priceModifier, 0);
        return s + unitPrice * item.qty;
    }, 0);
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);

    document.getElementById('modalSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalTotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalQtyDisplay').textContent = `×${totalItems}`;

    document.getElementById('requestModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('show');
    document.body.style.overflow = '';
}

function closeModalIfOutside(e) {
    if (e.target === document.getElementById('requestModal')) closeRequestModal();
}

function submitQuote() {
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();

    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }

    closeRequestModal();
    cart = [];
    updateBadge();
    showToast("Quote submitted! We'll be in touch within 24 hours. ✓");
}


// --- THEME ---

function toggleTheme() {
    const html = document.documentElement;
    const icon = document.getElementById('themeIcon');

    if (html.dataset.theme === 'dark') {
        html.dataset.theme = 'light';
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>';
    } else {
        html.dataset.theme = 'dark';
        icon.innerHTML = `
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1"  x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22"  y1="4.22"  x2="5.64"  y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1"  y1="12" x2="3"  y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22"  y1="19.78" x2="5.64"  y2="18.36"/>
      <line x1="18.36" y1="5.64"  x2="19.78" y2="4.22"/>
    `;
    }
}


// --- TOAST ---

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}


init();