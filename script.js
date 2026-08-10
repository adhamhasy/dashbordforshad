import { db, ref, onValue, push } from "./firebase-config.js";

let cart = JSON.parse(localStorage.getItem("cart") || "{}");
let wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
let recentlyViewed = JSON.parse(localStorage.getItem("recently_viewed") || "[]");

let allProducts = [];
let filteredProducts = [];
let selectedCategory = "All";
let currentSortOption = "default";
let currentSortLabel = "Default";
let currentSelectedStars = 0;
let activeProductModalId = null;
let activeSelectedVariantColor = null;

// Pagination & Infinite Scroll (#4, #5)
let currentPage = 1;
const pageSize = 8;
let scrollObserver = null;

let mapInstance = null;
let mapMarker = null;
let selectedCoords = { lat: 31.2001, lng: 29.9187 };

// Debounce Search (#9)
function debounce(func, delay = 250) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => func.apply(this, args), delay);
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", debounce(() => filterAndSortProducts(), 250));
  }
  setupInfiniteScroll();
});

// Fetch Products
onValue(ref(db, "products"), (snapshot) => {
  const data = snapshot.val();
  allProducts = [];

  if (!data) {
    document.getElementById("product-list").innerHTML = `
      <div class="col-12 text-center mt-5 py-5">
          <p class="text-muted">No products found in shop.</p>
      </div>`;
    return;
  }

  for (let id in data) {
    allProducts.push({ id, stock: data[id].stock ?? 5, ...data[id] });
  }

  renderCategoryButtons();
  renderSubFilters();
  filterAndSortProducts();
  renderRecentlyViewed();
  updateUI();
});

function getAverageRating(reviewsObj) {
  if (!reviewsObj) return { avg: 0, count: 0 };
  const vals = Object.values(reviewsObj);
  if (vals.length === 0) return { avg: 0, count: 0 };
  const sum = vals.reduce((a, b) => a + Number(b.rating || 0), 0);
  return { avg: (sum / vals.length).toFixed(1), count: vals.length };
}

function renderStarIcons(avgRating) {
  const rounded = Math.round(avgRating);
  let starsHTML = "";
  for (let i = 1; i <= 5; i++) {
    starsHTML += i <= rounded ? '<i class="bi bi-star-fill text-warning"></i>' : '<i class="bi bi-star text-muted"></i>';
  }
  return starsHTML;
}

window.selectStar = (rating) => {
  currentSelectedStars = rating;
  const stars = document.querySelectorAll("#review-stars-input .star-opt");
  stars.forEach((star, index) => {
    star.className = index < rating ? "bi bi-star-fill star-opt text-warning" : "bi bi-star star-opt text-secondary";
  });
};

// Filter & Sort Logic
window.filterAndSortProducts = () => {
  const searchEl = document.getElementById("searchInput");
  const colorEl = document.getElementById("colorFilter");
  const phoneTypeEl = document.getElementById("phoneTypeFilter");
  const maxPriceSlider = document.getElementById("maxPriceSlider");

  const term = searchEl ? searchEl.value.toLowerCase() : "";
  const selectedColor = colorEl ? colorEl.value : "All";
  const selectedPhoneType = phoneTypeEl ? phoneTypeEl.value : "All";
  const maxPrice = maxPriceSlider ? Number(maxPriceSlider.value) : 50000;

  const getEffectivePrice = (p) => {
    const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
    return hasDiscount ? Number(p.discountPrice) : Number(p.price);
  };

  filteredProducts = allProducts.filter((p) => {
    const effectivePrice = getEffectivePrice(p);
    const matchesSearch = p.name.toLowerCase().includes(term);
    const matchesCategory = selectedCategory === "All" || (p.category || "Other") === selectedCategory;
    const matchesPrice = effectivePrice <= maxPrice;
    
    // Checks both main color string & variant colors
    const hasColorMatch = selectedColor === "All" || 
      (p.color && p.color.toLowerCase().includes(selectedColor.toLowerCase())) ||
      (p.variants && p.variants.some(v => v.color.toLowerCase() === selectedColor.toLowerCase()));

    const matchesPhoneType = selectedPhoneType === "All" || (p.phoneType && p.phoneType.toLowerCase().includes(selectedPhoneType.toLowerCase()));

    return matchesSearch && matchesCategory && matchesPrice && hasColorMatch && matchesPhoneType;
  });

  if (currentSortOption === "price-asc") filteredProducts.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  else if (currentSortOption === "price-desc") filteredProducts.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  else if (currentSortOption === "name-asc") filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
  else if (currentSortOption === "name-desc") filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
  else if (currentSortOption === "rating-desc") filteredProducts.sort((a, b) => Number(getAverageRating(b.reviews).avg) - Number(getAverageRating(a.reviews).avg));
  else if (currentSortOption === "rating-asc") filteredProducts.sort((a, b) => Number(getAverageRating(a.reviews).avg) - Number(getAverageRating(b.reviews).avg));

  currentPage = 1;
  renderProductsBatched();
};

// Batch Rendering using DocumentFragment (#7)
function renderProductsBatched() {
  const list = document.getElementById("product-list");
  const visibleItems = filteredProducts.slice(0, currentPage * pageSize);

  if (visibleItems.length === 0) {
    list.innerHTML = `<div class="col-12 text-center my-5 py-5"><p class="text-muted">No products match your criteria.</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  visibleItems.forEach((p) => {
    const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
    const displayPrice = hasDiscount ? p.discountPrice : p.price;
    const { avg } = getAverageRating(p.reviews);
    const isWishlisted = wishlist.includes(p.id);

    const col = document.createElement("div");
    col.className = "col-6 col-md-3 mb-4";

    const isOutOfStock = Number(p.stock) === 0;
    let stockBadge = isOutOfStock 
      ? `<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>`
      : (Number(p.stock) < 5 ? `<span class="badge bg-warning text-dark position-absolute top-0 end-0 m-2">Only ${p.stock} Left!</span>` : "");

    col.innerHTML = `
      <div class="card border-0 product-card h-100 d-flex flex-column position-relative" style="cursor: pointer;">
          <button class="btn btn-sm rounded-circle position-absolute top-0 start-0 m-2 z-3 d-flex align-items-center justify-content-center ${isWishlisted ? 'bg-danger text-white' : 'bg-white text-dark shadow-sm'}" 
                  onclick="toggleWishlist('${p.id}', event)" title="Wishlist">
              <i class="bi ${isWishlisted ? 'bi-heart-fill' : 'bi-heart'}"></i>
          </button>
          ${stockBadge}
          <div style="position:relative" onclick="openProductModal('${p.id}')">
              <img src="${p.img}" loading="lazy" class="card-img-top shadow-sm" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 20px;">
              ${hasDiscount ? '<span class="badge bg-dark" style="position:absolute; bottom:10px; left:10px;">SALE</span>' : ""}
          </div>
          <div class="card-body px-2 py-2 text-center d-flex flex-column justify-content-between" onclick="openProductModal('${p.id}')">
              <div>
                  <h6 class="fw-bold mb-1 small text-truncate">${p.name}</h6>
                  <div class="small mb-1">
                      ${renderStarIcons(avg)} <span class="text-muted" style="font-size:0.75rem;">(${avg})</span>
                  </div>
              </div>
              <p class="mb-2 small">
                  ${hasDiscount ? `<del class="text-danger me-1">${p.price}</del>` : ""}
                  <span class="fw-bold">${displayPrice} EGP</span>
              </p>
          </div>
          <button class="btn ${isOutOfStock ? 'btn-secondary' : 'btn-dark'} w-100 rounded-pill btn-sm d-flex justify-content-center align-items-center gap-1" 
                  ${isOutOfStock ? 'disabled' : ''} 
                  onclick="addToCart('${p.id}', '${p.name.replace(/'/g, "")}', ${displayPrice}, '${p.img}', null, event)">
              <span>${isOutOfStock ? 'Sold Out' : 'Add to Bag'}</span>
          </button>
      </div>`;

    fragment.appendChild(col);
  });

  list.innerHTML = "";
  list.appendChild(fragment);
}

// Infinite Scroll Sentinel Observer (#5)
function setupInfiniteScroll() {
  const sentinel = document.getElementById("scroll-sentinel");
  if (!sentinel) return;

  scrollObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && currentPage * pageSize < filteredProducts.length) {
      currentPage++;
      renderProductsBatched();
    }
  }, { rootMargin: "200px" });

  scrollObserver.observe(sentinel);
}

// Product Modal & Multi-Color Variant Switching
window.openProductModal = (id) => {
  const p = allProducts.find((item) => item.id === id);
  if (!p) return;
  activeProductModalId = id;
  activeSelectedVariantColor = null;

  recentlyViewed = recentlyViewed.filter((itemId) => itemId !== id);
  recentlyViewed.unshift(id);
  if (recentlyViewed.length > 8) recentlyViewed.pop();
  localStorage.setItem("recently_viewed", JSON.stringify(recentlyViewed));
  renderRecentlyViewed();

  const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
  const displayPrice = hasDiscount ? p.discountPrice : p.price;
  const { avg, count } = getAverageRating(p.reviews);

  const mainImgEl = document.getElementById("modal-img");
  mainImgEl.src = p.img;

  // Handle Multi-Color Variants
  const swatchesContainer = document.getElementById("variant-swatches-container");
  const swatchesList = document.getElementById("modal-color-swatches");

  if (p.variants && p.variants.length > 0) {
    swatchesContainer.style.display = "block";
    swatchesList.innerHTML = p.variants.map((v, idx) => `
      <button class="color-swatch-btn ${idx === 0 ? 'active' : ''}" 
              onclick="selectColorVariant('${v.color}', '${v.img}', this)">
          ${v.color}
      </button>
    `).join("");

    // Default to first variant color
    activeSelectedVariantColor = p.variants[0].color;
    if (p.variants[0].img) mainImgEl.src = p.variants[0].img;
  } else {
    swatchesContainer.style.display = "none";
    swatchesList.innerHTML = "";
  }

  // Action Container
  const isOutOfStock = Number(p.stock) === 0;
  const actionContainer = document.getElementById("modal-action-container");
  if (!isOutOfStock) {
    actionContainer.innerHTML = `<button id="modal-add-btn" class="btn btn-luxury w-100 py-3 rounded-pill mb-4">ADD TO BAG</button>`;
    document.getElementById("modal-add-btn").onclick = (e) => {
      const currentImg = mainImgEl.src;
      addToCart(p.id, p.name, displayPrice, currentImg, activeSelectedVariantColor, e);
      bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();
    };
  }

  document.getElementById("modal-name").innerText = p.name;
  document.getElementById("modal-desc").innerText = p.description || "No additional details provided.";
  document.getElementById("modal-price-container").innerHTML = `${hasDiscount ? `<del class="text-danger me-2">${p.price} EGP</del>` : ""}<span class="fw-bold fs-5">${displayPrice} EGP</span>`;

  document.getElementById("modal-avg-stars").innerHTML = renderStarIcons(avg);
  document.getElementById("modal-rating-text").innerText = `${avg} / 5 (${count} reviews)`;

  renderRelatedProducts(p.category, p.id);
  new bootstrap.Modal(document.getElementById("productModal")).show();
};

// Swatch Click Event
window.selectColorVariant = (colorName, imgUrl, btnEl) => {
  activeSelectedVariantColor = colorName;
  document.querySelectorAll(".color-swatch-btn").forEach((b) => b.classList.remove("active"));
  btnEl.classList.add("active");

  if (imgUrl) {
    document.getElementById("modal-img").src = imgUrl;
  }
};

// Related Products Renderer (#24)
function renderRelatedProducts(category, currentId) {
  const container = document.getElementById("related-products-list");
  const related = allProducts.filter((p) => p.category === category && p.id !== currentId).slice(0, 4);

  if (related.length === 0) {
    document.getElementById("related-products-section").style.display = "none";
    return;
  }

  document.getElementById("related-products-section").style.display = "block";
  container.innerHTML = related.map((p) => `
    <div class="card border-0 bg-cream-soft p-2 flex-shrink-0" style="width: 130px; cursor: pointer;" onclick="openProductModal('${p.id}')">
      <img src="${p.img}" loading="lazy" class="rounded-3 mb-2" style="width: 100%; height: 90px; object-fit: cover;">
      <div class="fw-bold small text-truncate text-center">${p.name}</div>
      <div class="small text-muted text-center">${p.price} EGP</div>
    </div>
  `).join("");
}

// Fly-To-Cart Visual Animation (#27)
window.addToCart = (id, name, price, img, selectedColor = null, event = null) => {
  if (event && event.target) {
    animateFlyToCart(event.target);
  }

  // Key item by ID and color variant
  const itemKey = selectedColor ? `${id}_${selectedColor}` : id;

  if (cart[itemKey]) {
    cart[itemKey].qty++;
  } else {
    cart[itemKey] = { id, name, price, img, color: selectedColor, qty: 1 };
  }

  updateUI();

  const t = document.getElementById("toast");
  t.classList.add("show-toast");
  setTimeout(() => t.classList.remove("show-toast"), 2000);
};

function animateFlyToCart(targetEl) {
  const cartBtn = document.querySelector(".bi-bag-fill");
  if (!cartBtn) return;

  const targetRect = targetEl.getBoundingClientRect();
  const cartRect = cartBtn.getBoundingClientRect();

  const flyer = document.createElement("div");
  flyer.style.cssText = `
    position: fixed;
    top: ${targetRect.top}px;
    left: ${targetRect.left}px;
    width: 25px;
    height: 25px;
    background: #2D2926;
    border-radius: 50%;
    z-index: 9999;
    pointer-events: none;
    transition: all 0.7s cubic-bezier(0.2, 1, 0.2, 1);
  `;
  document.body.appendChild(flyer);

  requestAnimationFrame(() => {
    flyer.style.top = `${cartRect.top}px`;
    flyer.style.left = `${cartRect.left}px`;
    flyer.style.opacity = "0.1";
    flyer.style.transform = "scale(0.2)";
  });

  setTimeout(() => flyer.remove(), 700);
}

// Cart Modal & Discount Savings Calculation (#26)
window.openCheckout = () => {
  const listDiv = document.getElementById("cart-items-list");
  const totalEl = document.getElementById("total-price");
  const savingsBadge = document.getElementById("cart-savings-badge");

  let total = 0;
  let totalSavings = 0;

  const keys = Object.keys(cart);
  if (keys.length === 0) {
    // Empty State Illustration (#21)
    listDiv.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-bag-x fs-1 text-muted d-block mb-2"></i>
        <p class="text-muted mb-0">Your bag is currently empty.</p>
      </div>`;
    totalEl.innerText = "0";
    savingsBadge.style.display = "none";
  } else {
    listDiv.innerHTML = keys.map((key) => {
      const item = cart[key];
      total += item.price * item.qty;

      return `
        <div class="d-flex justify-content-between align-items-center mb-3 p-3 bg-cream-soft rounded-4">
            <div class="d-flex align-items-center gap-3">
                <img src="${item.img}" class="rounded-3" style="width: 48px; height: 48px; object-fit: cover;">
                <div>
                    <div class="fw-bold small">${item.name}</div>
                    ${item.color ? `<span class="badge bg-dark text-white me-1">${item.color}</span>` : ''}
                    <small class="text-muted">${item.price} EGP</small>
                </div>
            </div>
            <div class="d-flex align-items-center">
                <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${key}', -1)">-</button>
                <span class="mx-3 fw-bold">${item.qty}</span>
                <button class="btn btn-sm btn-outline-dark rounded-circle px-2" onclick="updateQty('${key}', 1)">+</button>
            </div>
        </div>`;
    }).join("");

    totalEl.innerText = total.toLocaleString();

    if (totalSavings > 0) {
      savingsBadge.innerText = `You save ${totalSavings.toLocaleString()} EGP on this order!`;
      savingsBadge.style.display = "block";
    } else {
      savingsBadge.style.display = "none";
    }
  }

  new bootstrap.Modal(document.getElementById("cartModal")).show();
};

window.updateQty = (key, change) => {
  cart[key].qty += change;
  if (cart[key].qty <= 0) delete cart[key];
  updateUI();
  openCheckout();
};

function updateUI() {
  localStorage.setItem("cart", JSON.stringify(cart));
  const totalQty = Object.values(cart).reduce((a, b) => a + b.qty, 0);
  document.getElementById("cart-count").innerText = totalQty;
}

// Category & Sub-Filter Logic
function renderCategoryButtons() {
  const container = document.getElementById("modal-category-filters");
  const categories = ["All", ...new Set(allProducts.map((p) => p.category || "Other"))];
  container.innerHTML = categories.map((cat) => `
    <button class="btn ${cat === selectedCategory ? 'btn-dark active-category' : 'btn-outline-dark'} rounded-pill px-3 btn-sm" 
            onclick="selectCategory('${cat}', this)">${cat}</button>
  `).join("");
}

window.selectCategory = (cat, btn) => {
  selectedCategory = cat;
  filterAndSortProducts();
};

function renderSubFilters() {
  const colorSelect = document.getElementById("colorFilter");
  const colorsSet = new Set();
  allProducts.forEach((p) => {
    if (p.color) p.color.split(",").forEach((c) => colorsSet.add(c.trim()));
    if (p.variants) p.variants.forEach((v) => colorsSet.add(v.color.trim()));
  });

  colorSelect.innerHTML = `<option value="All">All Colors</option>` +
    Array.from(colorsSet).map((c) => `<option value="${c}">${c}</option>`).join("");
}

window.openWishlistModal = () => {
  const container = document.getElementById("wishlist-items-list");
  const items = allProducts.filter((p) => wishlist.includes(p.id));

  if (items.length === 0) {
    container.innerHTML = `<p class="text-center text-muted py-4 mb-0">Your wishlist is empty.</p>`;
  } else {
    container.innerHTML = items.map((p) => `
      <div class="d-flex justify-content-between align-items-center p-3 bg-cream-soft rounded-4">
          <div class="d-flex align-items-center gap-3">
              <img src="${p.img}" class="rounded-3" style="width: 48px; height: 48px; object-fit: cover;">
              <div>
                  <h6 class="fw-bold mb-0 small">${p.name}</h6>
                  <small class="text-muted">${p.price} EGP</small>
              </div>
          </div>
          <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="toggleWishlist('${p.id}')">Remove</button>
      </div>
    `).join("");
  }
  new bootstrap.Modal(document.getElementById("wishlistModal")).show();
};

window.toggleWishlist = (id, event) => {
  if (event) event.stopPropagation();
  const idx = wishlist.indexOf(id);
  if (idx > -1) wishlist.splice(idx, 1);
  else wishlist.push(id);
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  updateUI();
  filterAndSortProducts();
};

function renderRecentlyViewed() {
  const section = document.getElementById("recently-viewed-section");
  const container = document.getElementById("recently-viewed-list");
  const items = allProducts.filter((p) => recentlyViewed.includes(p.id));

  if (items.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  container.innerHTML = items.map((p) => `
    <div class="card border-0 bg-cream-soft p-2 flex-shrink-0" style="width: 130px; cursor: pointer;" onclick="openProductModal('${p.id}')">
      <img src="${p.img}" loading="lazy" class="rounded-3 mb-2" style="width: 100%; height: 95px; object-fit: cover;">
      <div class="fw-bold small text-truncate text-center">${p.name}</div>
      <div class="small text-muted text-center">${p.price} EGP</div>
    </div>
  `).join("");
}

// Map Initialization (#6)
document.getElementById("cartModal").addEventListener("shown.bs.modal", () => {
  if (mapInstance) return;
  const center = [31.2001, 29.9187];
  mapInstance = L.map("delivery-map").setView(center, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapInstance);
  mapMarker = L.marker(center, { draggable: true }).addTo(mapInstance);
  mapMarker.on("dragend", () => {
    const pos = mapMarker.getLatLng();
    selectedCoords = { lat: pos.lat.toFixed(5), lng: pos.lng.toFixed(5) };
    document.getElementById("selectedAddress").value = `Lat: ${selectedCoords.lat}, Lng: ${selectedCoords.lng}`;
  });
});

window.confirmOrder = async () => {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("selectedAddress").value;

  if (!name || !phone || Object.keys(cart).length === 0) return alert("Fill in required details!");

  const orderData = {
    custName: name,
    custPhone: "+20" + phone,
    custLocation: address,
    coords: selectedCoords,
    items: Object.values(cart).map((i) => `${i.qty}x ${i.name}${i.color ? ` (${i.color})` : ''}`).join(", "),
    total: Object.values(cart).reduce((a, b) => a + b.price * b.qty, 0),
    time: new Date().toLocaleString("en-EG"),
  };

  await push(ref(db, "orders"), orderData);
  bootstrap.Modal.getInstance(document.getElementById("cartModal")).hide();
  document.getElementById("successToast").classList.add("show-success");
  cart = {};
  updateUI();
  setTimeout(() => location.reload(), 2500);
};

window.orderViaWhatsApp = () => {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("selectedAddress").value;

  if (!name || !phone || Object.keys(cart).length === 0) return alert("Please complete form!");

  const itemsList = Object.values(cart).map((i) => `- ${i.qty}x ${i.name}${i.color ? ` [Color: ${i.color}]` : ''} (${i.price * i.qty} EGP)`).join("\n");
  const total = Object.values(cart).reduce((a, b) => a + b.price * b.qty, 0);

  const text = `New Order from Kareem Store\n\nName: ${name}\nPhone: ${phone}\nLocation: ${address}\n\nItems:\n${itemsList}\n\nTotal: ${total} EGP`;
  window.open(`https://wa.me/201000000000?text=${encodeURIComponent(text)}`, "_blank");
};
