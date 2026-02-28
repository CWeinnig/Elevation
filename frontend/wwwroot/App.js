const API_BASE = 'http://localhost:5249';
const SQUARE_APP_ID = 'sandbox-sq0idb-BwePK0oD1PR0SnDJLs3w5g';
const SQUARE_LOCATION_ID = 'YOUR_SANDBOX_LOCATION_ID'; // Paste your Location ID from Square dashboard

let products = [];
let cart = [];
let currentUser = null;
let squareCard = null;
let squarePayments = null;

async function init() {
    try {
        const res = await fetch(`${API_BASE}/api/Products`);
        if (!res.ok) throw new Error('Failed to load products');
        products = await res.json();
        renderProducts();
    } catch (e) {
        document.getElementById('productsGrid').innerHTML =
            '<div style="color:var(--muted);padding:2rem;">Could not connect to server. Please try again later.</div>';
    }
}


// --- PRODUCT GRID ---

function renderProducts() {
    const grid = document.getElementById('productsGrid');
    if (products.length === 0) {
        grid.innerHTML = '<div style="color:var(--muted);padding:2rem;">No products available.</div>';
        return;
    }

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
        Add to Cart
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


// --- CART ---

function addToCart(item) {
    const existing = cart.find(i => i.productId === item.productId);
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

    if (cart.length === 0) {
        list.innerHTML = '<div class="empty-quote">Your cart is empty.<br>Add products to get started.</div>';
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

    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);

    document.getElementById('summaryItems').textContent = totalItems;
    document.getElementById('summaryTotal').textContent = `$${subtotal.toFixed(2)}`;
    summary.style.display = 'block';
}

function getCartSubtotal() {
    return cart.reduce((s, item) => {
        const unitPrice = item.basePrice + item.selectedOptions.reduce((os, o) => os + o.priceModifier, 0);
        return s + unitPrice * item.qty;
    }, 0);
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


// --- CART PANEL ---

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

async function openRequestModal() {
    if (cart.length === 0) {
        showToast('Add items to your cart first.');
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

    const subtotal = getCartSubtotal();
    const totalItems = cart.reduce((s, i) => s + i.qty, 0);

    document.getElementById('modalSubtotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalTotal').textContent = `$${subtotal.toFixed(2)}`;
    document.getElementById('modalQtyDisplay').textContent = `×${totalItems}`;

    document.getElementById('requestModal').classList.add('show');
    document.body.style.overflow = 'hidden';

    await initSquare();
}

function closeRequestModal() {
    document.getElementById('requestModal').classList.remove('show');
    document.body.style.overflow = '';
    if (squareCard) {
        squareCard.destroy();
        squareCard = null;
    }
}

function closeModalIfOutside(e) {
    if (e.target === document.getElementById('requestModal')) closeRequestModal();
}


// --- SQUARE PAYMENT ---

async function initSquare() {
    try {
        if (!window.Square) {
            showToast('Payment system failed to load. Please refresh.');
            return;
        }

        squarePayments = window.Square.payments(SQUARE_APP_ID, SQUARE_LOCATION_ID);
        squareCard = await squarePayments.card({
            style: {
                '.input-container': { borderRadius: '10px' },
                '.input-container.is-focus': { borderColor: '#7c3aed' },
            }
        });
        await squareCard.attach('#square-card-container');
    } catch (e) {
        console.error('Square init error:', e);
        document.getElementById('square-card-container').innerHTML =
            '<p style="color:#ef4444;font-size:0.85rem;">Payment form failed to load.</p>';
    }
}

async function submitQuote() {
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();

    if (!name) { showToast('Please enter your name.'); return; }
    if (!email) { showToast('Please enter your email.'); return; }

    if (!squareCard) {
        showToast('Payment form not ready. Please wait.');
        return;
    }

    const submitBtn = document.querySelector('#modalBox .btn-primary:last-of-type');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    try {
        // 1. Tokenize the card with Square
        const tokenResult = await squareCard.tokenize();
        if (tokenResult.status !== 'OK') {
            const errs = tokenResult.errors?.map(e => e.message).join(', ') || 'Card error.';
            showToast(`Payment error: ${errs}`);
            return;
        }

        const sourceId = tokenResult.token;
        const amountCents = Math.round(getCartSubtotal() * 100);

        // 2. Send token to backend to charge
        const paymentRes = await fetch(`${API_BASE}/api/Payments/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceId, amountCents })
        });

        if (!paymentRes.ok) {
            const err = await paymentRes.json();
            showToast(`Payment failed: ${err.errors?.[0] || 'Unknown error'}`);
            return;
        }

        const payment = await paymentRes.json();

        // 3. Create the order in our system
        const orderPayload = {
            userId: currentUser?.id ?? 0,
            guestEmail: currentUser ? '' : email,
            squarePaymentId: payment.paymentId,
            fileIds: [],
            items: cart.map(item => ({
                productId: item.productId,
                quantity: item.qty,
                options: item.selectedOptions.map(o => ({ productOptionId: o.productOptionId }))
            }))
        };

        const orderRes = await fetch(`${API_BASE}/api/Orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });

        if (!orderRes.ok) {
            const err = await orderRes.text();
            showToast(`Order failed: ${err}`);
            return;
        }

        const order = await orderRes.json();

        // 4. Success
        closeRequestModal();
        cart = [];
        updateBadge();
        showToast(`Order #${order.id} placed successfully! ✓`);

    } catch (err) {
        console.error('Checkout error:', err);
        showToast('Something went wrong. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Order';
    }
}


// --- SIGN IN / REGISTER ---

function openSignIn() {
    if (currentUser) {
        showToast(`Signed in as ${currentUser.name}`);
        return;
    }
    switchToSignIn();
    document.getElementById('signInModal').classList.add('show');
    document.body.style.overflow = 'hidden';
}

function closeSignIn() {
    document.getElementById('signInModal').classList.remove('show');
    document.body.style.overflow = '';
    document.getElementById('signInEmail').value = '';
    document.getElementById('signInPassword').value = '';
    document.getElementById('createName').value = '';
    document.getElementById('createEmail').value = '';
    document.getElementById('createPassword').value = '';
}

function closeSignInIfOutside(e) {
    if (e.target === document.getElementById('signInModal')) closeSignIn();
}

function switchToCreateAccount() {
    document.getElementById('signInForm').style.display = 'none';
    document.getElementById('createAccountForm').style.display = 'block';
    document.querySelector('#signInBox h2').textContent = 'Create an Account';
    document.querySelector('#signInBox .signin-subtitle').textContent = 'Join to save quotes and track your orders';
}

function switchToSignIn() {
    document.getElementById('signInForm').style.display = 'block';
    document.getElementById('createAccountForm').style.display = 'none';
    document.querySelector('#signInBox h2').textContent = 'Sign In to Your Account';
    document.querySelector('#signInBox .signin-subtitle').textContent = 'Access your saved cart and order history';
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
        closeSignIn();
        updateNavUser();
        showToast(`Welcome back, ${currentUser.name}!`);
    } catch {
        showToast('Sign in failed. Please try again.');
    }
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
        closeSignIn();
        updateNavUser();
        showToast(`Account created! Welcome, ${currentUser.name}!`);
    } catch {
        showToast('Account creation failed. Please try again.');
    }
}

function updateNavUser() {
    const label = document.getElementById('navUserLabel');
    if (currentUser) {
        label.textContent = currentUser.name;
    } else {
        label.textContent = 'Sign In';
    }
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