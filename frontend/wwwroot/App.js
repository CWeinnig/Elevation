
const PRODUCTS = [
  { id: 'bc12',   name: 'Business Cards - 12pt',  price: 50  },
  { id: 'bc14',   name: 'Business Cards - 14pt',  price: 65  },
  { id: 'scc',    name: 'Specifically Cut Cards',  price: 75  },
  { id: 'labels', name: 'Labels',                  price: 40  },
  { id: 'inv',    name: 'Invitations',             price: 80  },
  { id: 'fly',    name: 'Flyers',                  price: 35  },
  { id: 'yard',   name: 'Yard Signs',              price: 120 },
  { id: 'banner', name: 'Banners',                 price: 150 },
  { id: 'poster', name: 'Posters',                 price: 45  },
  { id: 'vm',     name: 'Vehicle Magnetic',        price: 200 },
  { id: 'vd',     name: 'Vinyl Decals',            price: 60  },
  { id: 'mm',     name: 'Marketing Materials',     price: 100 },
];


let cart = [];


function renderProducts() {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = PRODUCTS.map(p => `
    <div class="product-card" id="card-${p.id}">
      <div class="product-name">${p.name}</div>
      <div class="product-price">$${p.price}</div>
      <div class="product-unit">per unit (starting price)</div>
      <button class="btn-add-quote" onclick="quickAddToQuote('${p.id}')">
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


function updateCalculator() {
  const sel       = document.getElementById('calcProduct');
  const opt       = sel.options[sel.selectedIndex];
  const basePrice = parseFloat(opt.dataset.price || 0);
  const qty       = parseInt(document.getElementById('calcQty').value) || 1;

  if (!basePrice) {
    document.getElementById('calcOptions').style.display  = 'none';
    document.getElementById('priceEstimate').style.display = 'none';
    return;
  }

  document.getElementById('calcOptions').style.display  = 'block';
  document.getElementById('priceEstimate').style.display = 'block';

  const finishAdd = parseFloat(document.getElementById('finishOpt').selectedOptions[0].dataset.add || 0);
  const paperAdd  = parseFloat(document.getElementById('paperOpt').selectedOptions[0].dataset.add  || 0);
  const cornerAdd = parseFloat(document.getElementById('cornerOpt').selectedOptions[0].dataset.add || 0);
  const perUnit   = basePrice + finishAdd + paperAdd + cornerAdd;
  const subtotal  = perUnit * qty;

  document.getElementById('estBase').textContent    = `$${basePrice.toFixed(2)}`;
  document.getElementById('estPerUnit').textContent = `$${perUnit.toFixed(2)}`;
  document.getElementById('estQty').textContent     = `×${qty}`;
  document.getElementById('estSub').textContent     = `$${subtotal.toFixed(2)}`;
  document.getElementById('estTotal').textContent   = `$${subtotal.toFixed(2)}`;
}

function addToQuoteFromCalc() {
  const sel       = document.getElementById('calcProduct');
  const opt       = sel.options[sel.selectedIndex];
  const basePrice = parseFloat(opt.dataset.price || 0);

  if (!basePrice) {
    showToast('Please select a product first.');
    return;
  }

  const finishAdd = parseFloat(document.getElementById('finishOpt').selectedOptions[0].dataset.add || 0);
  const paperAdd  = parseFloat(document.getElementById('paperOpt').selectedOptions[0].dataset.add  || 0);
  const cornerAdd = parseFloat(document.getElementById('cornerOpt').selectedOptions[0].dataset.add || 0);
  const perUnit   = basePrice + finishAdd + paperAdd + cornerAdd;
  const qty       = parseInt(document.getElementById('calcQty').value) || 1;
  const id        = sel.value;
  const name      = PRODUCTS.find(p => p.id === id)?.name || opt.text.split(' ($')[0];

  addToCart(id, name, perUnit, qty);
}

function quickAddToQuote(id) {
  const prod = PRODUCTS.find(p => p.id === id);
  if (!prod) return;

  addToCart(id, prod.name, prod.price, 1);

  
  const card = document.getElementById('card-' + id);
  card.classList.add('active-card');
  setTimeout(() => card.classList.remove('active-card'), 1500);
}


function addToCart(id, name, price, qty) {
  const existing = cart.find(i => i.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id, name, price, qty });
  }
  updateBadge();
  showToast(`"${name}" added to quotes!`);
}

function renderCart() {
  const list    = document.getElementById('quotesList');
  const summary = document.getElementById('quoteSummary');

  if (cart.length === 0) {
    list.innerHTML = '<div class="empty-quote">Your quote cart is empty.<br>Add products to get started.</div>';
    summary.style.display = 'none';
    return;
  }

  list.innerHTML = cart.map((item, i) => `
    <div class="quote-item">
      <div class="quote-item-name">${item.name}</div>
      <div class="quote-item-price-unit">$${item.price.toFixed(2)} per unit</div>
      <div class="quote-item-row">
        <div class="qty-wrap">
          <span>Qty:</span>
          <input class="qty-input" type="number" value="${item.qty}" min="1"
                 onchange="updateQty(${i}, this.value)" />
        </div>
        <div class="quote-item-total">$${(item.price * item.qty).toFixed(2)}</div>
      </div>
      <button class="remove-btn" onclick="removeItem(${i})">✕</button>
    </div>
  `).join('');

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
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
  badge.textContent    = total;
  badge.style.display  = total > 0 ? 'inline-flex' : 'none';
}


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
  if (e.target === document.getElementById('quotesOverlay')) {
    closeQuotes();
  }
}

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
  orderDiv.innerHTML = cart.map(item => `
    <div class="order-detail-card">
      <div>
        <div style="font-weight:700;">${item.name}</div>
        <div class="order-detail-qty">Quantity: ${item.qty}</div>
      </div>
      <div style="font-weight:700;">$${(item.price * item.qty).toFixed(2)}</div>
    </div>
  `).join('');

  const subtotal   = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const totalItems = cart.reduce((s, i) => s + i.qty, 0);

  document.getElementById('modalSubtotal').textContent   = `$${subtotal.toFixed(2)}`;
  document.getElementById('modalTotal').textContent      = `$${subtotal.toFixed(2)}`;
  document.getElementById('modalQtyDisplay').textContent = `×${totalItems}`;

  document.getElementById('requestModal').classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeRequestModal() {
  document.getElementById('requestModal').classList.remove('show');
  document.body.style.overflow = '';
}

function closeModalIfOutside(e) {
  if (e.target === document.getElementById('requestModal')) {
    closeRequestModal();
  }
}

function submitQuote() {
  const name  = document.getElementById('contactName').value.trim();
  const email = document.getElementById('contactEmail').value.trim();

  if (!name)  { showToast('Please enter your name.');  return; }
  if (!email) { showToast('Please enter your email.'); return; }

  

  closeRequestModal();
  cart = [];
  updateBadge();
  showToast("Quote submitted! We'll be in touch within 24 hours. ✓");
}

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


function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

renderProducts();