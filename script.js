import { db, ref, onValue, push, set } from "./firebase-config.js";

let cart = {};
let allProducts = [];
let selectedCategory = "All";
let currentSelectedStars = 0;

// Helper: Calculate average star rating & count from a reviews object
function getAverageRating(reviewsObj) {
  if (!reviewsObj) return { avg: 0, count: 0 };
  const vals = Object.values(reviewsObj);
  if (vals.length === 0) return { avg: 0, count: 0 };
  const sum = vals.reduce((a, b) => a + Number(b.rating || 0), 0);
  return { avg: (sum / vals.length).toFixed(1), count: vals.length };
}

// Check if customer already reviewed this item on this browser/device
function hasUserReviewed(productId) {
  const reviewedItems = JSON.parse(localStorage.getItem("reviewed_products") || "[]");
  return reviewedItems.includes(productId);
}

// Mark product as reviewed in localStorage
function markUserReviewed(productId) {
  const reviewedItems = JSON.parse(localStorage.getItem("reviewed_products") || "[]");
  if (!reviewedItems.includes(productId)) {
    reviewedItems.push(productId);
    localStorage.setItem("reviewed_products", JSON.stringify(reviewedItems));
  }
}

// 1. FETCH PRODUCTS FROM FIREBASE
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

  renderCategoryButtons();
  renderSubFilters();
  filterAndSortProducts();
});

// 2. GENERATE CATEGORY BUTTONS
function renderCategoryButtons() {
  const container = document.getElementById("category-filters");
  const categories = ["All", ...new Set(allProducts.map((p) => p.category || "Other"))];

  container.innerHTML = categories
    .map((cat) => {
      const activeClass = cat === selectedCategory ? "btn-dark active-category" : "btn-outline-dark";
      return `<button class="btn ${activeClass} rounded-pill px-4 btn-sm" onclick="selectCategory('${cat}', this)">${cat}</button>`;
    })
    .join("");
}

window.selectCategory = (category, btnEl) => {
  selectedCategory = category;
  document.querySelectorAll("#category-filters button").forEach((b) => {
    b.className = "btn btn-outline-dark rounded-pill px-4 btn-sm";
  });
  btnEl.className = "btn btn-dark active-category rounded-pill px-4 btn-sm";
  
  renderSubFilters(); // Refresh available sub-filters for this category
  filterAndSortProducts();
};

// 3. GENERATE SUB-FILTERS (Colors & Phone Types)
function renderSubFilters() {
  const colorSelect = document.getElementById("colorFilter");
  const phoneTypeSelect = document.getElementById("phoneTypeFilter");

  // Filter products by current active category first to only show relevant colors/models
  const categoryProducts = selectedCategory === "All"
    ? allProducts
    : allProducts.filter((p) => (p.category || "Other") === selectedCategory);

  const colorsSet = new Set();
  const phoneTypesSet = new Set();

  categoryProducts.forEach((p) => {
    if (p.color) {
      p.color.split(",").forEach((c) => colorsSet.add(c.trim()));
    }
    if (p.phoneType) {
      p.phoneType.split(",").forEach((pt) => phoneTypesSet.add(pt.trim()));
    }
  });

  const currentColor = colorSelect.value || "All";
  const currentPhoneType = phoneTypeSelect.value || "All";

  colorSelect.innerHTML = `<option value="All">All Colors</option>` +
    Array.from(colorsSet)
      .filter(Boolean)
      .map((c) => `<option value="${c}" ${c === currentColor ? "selected" : ""}>${c}</option>`)
      .join("");

  phoneTypeSelect.innerHTML = `<option value="All">All Phone Types / Models</option>` +
    Array.from(phoneTypesSet)
      .filter(Boolean)
      .map((pt) => `<option value="${pt}" ${pt === currentPhoneType ? "selected" : ""}>${pt}</option>`)
      .join("");
}

// 4. RENDER PRODUCTS
window.renderProducts = (items) => {
  const list = document.getElementById("product-list");
  list.innerHTML = items
    .map((p) => {
      const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
      const displayPrice = hasDiscount ? p.discountPrice : p.price;
      const { avg, count } = getAverageRating(p.reviews);

      return `
        <div class="col-6 col-md-3 mb-4">
            <div class="card border-0 bg-transparent product-card" style="cursor: pointer;">
                <div style="position:relative" onclick="openProductModal('${p.id}')">
                    <img src="${p.img}" class="card-img-top shadow-sm" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 20px;">
                    ${hasDiscount ? '<span class="badge bg-dark" style="position:absolute; top:10px; left:10px;">SALE</span>' : ""}
                    <span class="badge bg-secondary" style="position:absolute; bottom:10px; left:10px; font-size: 0.7rem;">${p.category || "Other"}</span>
                </div>
                <div class="card-body px-1 py-2 text-center" onclick="openProductModal('${p.id}')">
                    <h6 class="fw-bold mb-1 small text-truncate">${p.name}</h6>
                    <div class="small text-warning mb-1">
                        ${"★".repeat(Math.round(avg))}${"☆".repeat(5 - Math.round(avg))} 
                        <span class="text-muted" style="font-size:0.75rem;">(${avg} / ${count})</span>
                    </div>
                    <p class="mb-2 small">
                        ${hasDiscount ? `<del class="text-danger me-1" style="font-weight:400;">${p.price}</del>` : ""}
                        <span class="fw-bold text-dark">${displayPrice} EGP</span>
                    </p>
                </div>
                <button class="btn btn-dark w-100 rounded-pill btn-sm" onclick="addToCart('${p.id}', '${p.name.replace(/'/g, "")}', ${displayPrice}, event)">Add to Bag</button>
            </div>
        </div>`;
    })
    .join("");
};

// 5. SEARCH, CATEGORY, COLOR, PHONE TYPE & SORT FILTER
window.filterAndSortProducts = () => {
  const searchEl = document.getElementById("searchInput");
  const sortEl = document.getElementById("sortInput");
  const colorEl = document.getElementById("colorFilter");
  const phoneTypeEl = document.getElementById("phoneTypeFilter");

  const term = searchEl ? searchEl.value.toLowerCase() : "";
  const sortValue = sortEl ? sortEl.value : "default";
  const selectedColor = colorEl ? colorEl.value : "All";
  const selectedPhoneType = phoneTypeEl ? phoneTypeEl.value : "All";

  let filtered = allProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(term);
    const matchesCategory = selectedCategory === "All" || (p.category || "Other") === selectedCategory;
    
    // Check Color Sub-filter
    const matchesColor = selectedColor === "All" || (
      p.color && p.color.toLowerCase().split(",").map(c => c.trim()).includes(selectedColor.toLowerCase())
    );

    // Check Phone Type Sub-filter
    const matchesPhoneType = selectedPhoneType === "All" || (
      p.phoneType && p.phoneType.toLowerCase().split(",").map(pt => pt.trim()).includes(selectedPhoneType.toLowerCase())
    );

    return matchesSearch && matchesCategory && matchesColor && matchesPhoneType;
  });

  const getEffectivePrice = (p) => {
    const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
    return hasDiscount ? Number(p.discountPrice) : Number(p.price);
  };

  if (sortValue === "price-asc") {
    filtered.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  } else if (sortValue === "price-desc") {
    filtered.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  } else if (sortValue === "name-asc") {
    filtered.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortValue === "name-desc") {
    filtered.sort((a, b) => b.name.localeCompare(a.name));
  } else if (sortValue === "rating-desc") {
    filtered.sort((a, b) => Number(getAverageRating(b.reviews).avg) - Number(getAverageRating(a.reviews).avg));
  } else if (sortValue === "rating-asc") {
    filtered.sort((a, b) => Number(getAverageRating(a.reviews).avg) - Number(getAverageRating(b.reviews).avg));
  }

  renderProducts(filtered);
};

// 6. PRODUCT DETAILS MODAL & REVIEWS LOGIC
window.openProductModal = (id) => {
  const p = allProducts.find((item) => item.id === id);
  if (!p) return;

  const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
  const displayPrice = hasDiscount ? p.discountPrice : p.price;
  const { avg, count } = getAverageRating(p.reviews);

  document.getElementById("modal-img").src = p.img;
  
  // Render Badges for Category, Color, and Phone Type
  let tagsHTML = `<span class="badge bg-secondary">${p.category || "Other"}</span>`;
  if (p.color) {
    p.color.split(",").forEach(c => {
      tagsHTML += `<span class="badge bg-dark">${c.trim()}</span>`;
    });
  }
  if (p.phoneType) {
    p.phoneType.split(",").forEach(pt => {
      tagsHTML += `<span class="badge bg-info text-dark">${pt.trim()}</span>`;
    });
  }
  document.getElementById("modal-tags").innerHTML = tagsHTML;

  document.getElementById("modal-name").innerText = p.name;
  document.getElementById("modal-desc").innerText = p.description || "No additional details or specifications provided.";

  document.getElementById("modal-price-container").innerHTML = `
    ${hasDiscount ? `<del class="text-danger me-2">${p.price} EGP</del>` : ""}
    <span class="fw-bold fs-5 text-dark">${displayPrice} EGP</span>
  `;

  // Display Visible Average Stars
  document.getElementById("modal-avg-stars").innerText = "★".repeat(Math.round(avg)) + "☆".repeat(5 - Math.round(avg));
  document.getElementById("modal-rating-text").innerText = `${avg} out of 5 (${count} ${count === 1 ? "review" : "reviews"})`;

  // Check if customer already submitted a review
  const formContainer = document.getElementById("review-form-container");
  if (hasUserReviewed(p.id)) {
    formContainer.innerHTML = `<div class="p-3 text-center bg-light rounded-4 fw-bold text-success small">✓ Thank you! You have already reviewed this product.</div>`;
  } else {
    currentSelectedStars = 0;
    formContainer.innerHTML = `
      <h6 class="fw-bold small text-uppercase text-muted mb-2">Leave a Review</h6>
      <div class="mb-2">
          <span class="small fw-bold me-2">Your Rating:</span>
          <div id="review-stars-input" class="star-rating d-inline-block" style="font-size: 1.4rem; cursor: pointer;">
              <span onclick="selectStar(1)" class="star-opt text-secondary">★</span>
              <span onclick="selectStar(2)" class="star-opt text-secondary">★</span>
              <span onclick="selectStar(3)" class="star-opt text-secondary">★</span>
              <span onclick="selectStar(4)" class="star-opt text-secondary">★</span>
              <span onclick="selectStar(5)" class="star-opt text-secondary">★</span>
          </div>
      </div>
      <input type="text" id="review-author" class="form-control mb-2 rounded-pill small" placeholder="Your Name (Optional)">
      <textarea id="review-comment" class="form-control mb-2 rounded-4 small" rows="2" placeholder="Why is this product good or bad? (Required)"></textarea>
      <button onclick="submitReview('${p.id}')" class="btn btn-dark btn-sm rounded-pill px-4">Submit Review</button>
    `;
  }

  // Render Customer Reviews List
  const reviewsListEl = document.getElementById("modal-reviews-list");
  if (!p.reviews || Object.keys(p.reviews).length === 0) {
    reviewsListEl.innerHTML = `<p class="small text-muted mb-0">No reviews yet. Be the first to share your thoughts!</p>`;
  } else {
    reviewsListEl.innerHTML = Object.values(p.reviews)
      .reverse()
      .map((r) => `
        <div class="bg-light p-3 rounded-4">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold small">${r.name || "Anonymous Customer"}</span>
                <span class="text-warning small">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span>
            </div>
            <p class="small mb-0 text-muted" style="white-space: pre-line;">${r.comment}</p>
            <small class="text-secondary" style="font-size: 0.65rem;">${r.date || ""}</small>
        </div>
      `)
      .join("");
  }

  const addBtn = document.getElementById("modal-add-btn");
  addBtn.onclick = () => {
    addToCart(p.id, p.name, displayPrice);
    bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();
  };

  const modalEl = document.getElementById("productModal");
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.show();
};

// Select Star Rating inside Form
window.selectStar = (val) => {
  currentSelectedStars = val;
  const stars = document.querySelectorAll("#review-stars-input .star-opt");
  stars.forEach((s, idx) => {
    if (idx < val) {
      s.className = "star-opt text-warning";
    } else {
      s.className = "star-opt text-secondary";
    }
  });
};

// Submit Review (Must include rating and comment)
window.submitReview = async (productId) => {
  if (currentSelectedStars === 0) {
    alert("Please select a star rating (1 to 5 stars).");
    return;
  }

  const commentEl = document.getElementById("review-comment");
  const authorEl = document.getElementById("review-author");
  const commentText = commentEl ? commentEl.value.trim() : "";
  const authorText = authorEl && authorEl.value.trim() ? authorEl.value.trim() : "Anonymous Customer";

  if (!commentText) {
    alert("Please write a comment explaining why this product is good or bad!");
    return;
  }

  const newReview = {
    rating: currentSelectedStars,
    name: authorText,
    comment: commentText,
    date: new Date().toLocaleDateString("en-EG")
  };

  try {
    await push(ref(db, `products/${productId}/reviews`), newReview);
    markUserReviewed(productId);
    setTimeout(() => openProductModal(productId), 300);
  } catch (e) {
    console.error("Error submitting review:", e);
    alert("Could not submit review. Please try again.");
  }
};

// 7. CART LOGIC
window.addToCart = (id, name, price, event) => {
  if (event) event.stopPropagation();
  if (cart[id]) {
    cart[id].qty++;
  } else {
    cart[id] = { name: name, price: price, qty: 1 };
  }
  updateUI();

  const t = document.getElementById("toast");
  t.classList.add("show-toast");
  setTimeout(() => t.classList.remove("show-toast"), 2000);
};

function updateUI() {
  const totalQty = Object.values(cart).reduce((a, b) => a + b.qty, 0);
  document.getElementById("cart-count").innerText = totalQty;
}

// 8. CHECKOUT MODAL LOGIC (+/- Buttons)
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

// 9. CONFIRM ORDER
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

    const modalEl = document.getElementById("cartModal");
    bootstrap.Modal.getInstance(modalEl).hide();

    document.getElementById("successToast").classList.add("show-success");

    cart = {};
    updateUI();

    setTimeout(() => location.reload(), 3000);
  } catch (e) {
    console.error(e);
    alert("Error sending order. Check Firebase rules!");
  }
};
