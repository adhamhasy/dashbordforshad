import { db, ref, onValue, push, set } from "./firebase-config.js";

let cart = {};
let allProducts = []; // Stores products from Firebase for searching

// 1. FETCH PRODUCTS FROM FIREBASE
// This listens for any changes you make in the worker.html dashboard
onValue(ref(db, "products"), (snapshot) => {
  const data = snapshot.val();
  allProducts = [];

  if (!data) {
    document.getElementById("product-list").innerHTML = `
            <div class="col-12 text-center mt-5">
                <p class="text-muted">No products found. Add some from the dashboard!</p>
            </div>`;
    return;
  }

  for (let id in data) {
    allProducts.push({ id, ...data[id] });
  }
  renderProducts(allProducts);
});

window.renderProducts = (items) => {
  const list = document.getElementById("product-list");
  list.innerHTML = items
    .map((p) => {
      const hasDiscount =
        p.discountPrice && Number(p.discountPrice) < Number(p.price);
      const displayPrice = hasDiscount ? p.discountPrice : p.price;

      return `
        <div class="col-6 col-md-3 mb-4">
            <div class="card border-0 bg-transparent">
                <div style="position:relative">
                    <img src="${p.img}" class="card-img-top shadow-sm" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 20px;">
                    ${hasDiscount ? '<span class="badge bg-dark" style="position:absolute; top:10px; left:10px;">SALE</span>' : ""}
                </div>
                <div class="card-body px-1 py-2 text-center">
                    <h6 class="fw-bold mb-1 small text-truncate">${p.name}</h6>
                    <p class="mb-2 small">
                        ${hasDiscount ? `<del class="text-danger me-1" style="font-weight:400;">${p.price}</del>` : ""}
                        <span class="fw-bold text-dark">${displayPrice} EGP</span>
                    </p>
                    <button class="btn btn-dark w-100 rounded-pill btn-sm" onclick="addToCart('${p.id}', '${p.name}', ${displayPrice})">Add to Bag</button>
                </div>
            </div>
        </div>`;
    })
    .join("");
};
// 3. SEARCH FILTER
window.filterPerfumes = () => {
  const term = document.getElementById("searchInput").value.toLowerCase();
  const filtered = allProducts.filter((p) =>
    p.name.toLowerCase().includes(term),
  );
  renderProducts(filtered);
};

// 4. CART LOGIC
window.addToCart = (id, name, price) => {
  if (cart[id]) {
    cart[id].qty++;
  } else {
    cart[id] = { name: name, price: price, qty: 1 };
  }
  updateUI();

  // Show "Added" Toast
  const t = document.getElementById("toast");
  t.classList.add("show-toast");
  setTimeout(() => t.classList.remove("show-toast"), 2000);
};

function updateUI() {
  const totalQty = Object.values(cart).reduce((a, b) => a + b.qty, 0);
  document.getElementById("cart-count").innerText = totalQty;
}

// 5. CHECKOUT MODAL LOGIC (+/- Buttons)
window.openCheckout = () => {
  const listDiv = document.getElementById("cart-items-list");
  const totalEl = document.getElementById("total-price");
  let total = 0;

  if (Object.keys(cart).length === 0) {
    listDiv.innerHTML =
      "<p class='text-center text-muted py-4'>Your bag is empty.</p>";
    totalEl.innerText = "0";
  } else {
    listDiv.innerHTML = Object.keys(cart)
      .map((id) => {
        const item = cart[id];
        total += item.price * item.qty;
        return `
                <div class="d-flex justify-content-between align-items-center mb-3 p-3 bg-light rounded-4">
                    <div>
                        <div class="fw-bold small">${item.name}</div>
                        <div class="text-muted small">${item.price} EGP</div>
                    </div>
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${id}', -1)">-</button>
                        <span class="mx-3 fw-bold">${item.qty}</span>
                        <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${id}', 1)">+</button>
                    </div>
                </div>`;
      })
      .join("");
    totalEl.innerText = total;
  }

  const cartModal = new bootstrap.Modal(document.getElementById("cartModal"));
  cartModal.show();
};

window.updateQty = (id, change) => {
  cart[id].qty += change;
  if (cart[id].qty <= 0) delete cart[id];
  updateUI();

  // Refresh the modal view immediately
  const listDiv = document.getElementById("cart-items-list");
  const totalEl = document.getElementById("total-price");
  let total = 0;

  if (Object.keys(cart).length === 0) {
    listDiv.innerHTML =
      "<p class='text-center text-muted py-4'>Your bag is empty.</p>";
    totalEl.innerText = "0";
  } else {
    listDiv.innerHTML = Object.keys(cart)
      .map((key) => {
        const item = cart[key];
        total += item.price * item.qty;
        return `
                <div class="d-flex justify-content-between align-items-center mb-3 p-3 bg-light rounded-4">
                    <div><div class="fw-bold small">${item.name}</div><div class="text-muted small">${item.price} EGP</div></div>
                    <div class="d-flex align-items-center">
                        <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${key}', -1)">-</button>
                        <span class="mx-3 fw-bold">${item.qty}</span>
                        <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${key}', 1)">+</button>
                    </div>
                </div>`;
      })
      .join("");
    totalEl.innerText = total;
  }
};

// 6. CONFIRM ORDER (Send to Firebase)
window.confirmOrder = async () => {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const area = document.getElementById("area").value;

  if (!name || !phone || !area || Object.keys(cart).length === 0) {
    alert("Please complete your info and add items!");
    return;
  }

  const orderData = {
    custName: name,
    custPhone: "+20" + phone,
    custArea: area,
    items: Object.values(cart)
      .map((i) => `${i.qty}x ${i.name}`)
      .join(", "),
    total: Object.values(cart).reduce((a, b) => a + b.price * b.qty, 0),
    time: new Date().toLocaleString("en-EG"),
    status: "New",
  };

  try {
    await push(ref(db, "orders"), orderData);

    // Hide Modal
    const modalEl = document.getElementById("cartModal");
    bootstrap.Modal.getInstance(modalEl).hide();

    // Success Toast
    document.getElementById("successToast").classList.add("show-success");

    // Reset Cart
    cart = {};
    updateUI();

    setTimeout(() => location.reload(), 3000);
  } catch (e) {
    console.error(e);
    alert("Error sending order. Check Firebase rules!");
  }
};
