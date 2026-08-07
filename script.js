import { db, ref, onValue, push, set } from "./firebase-config.js";

let cart = JSON.parse(localStorage.getItem("cart") || "{}");
let wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
let recentlyViewed = JSON.parse(localStorage.getItem("recently_viewed") || "[]");
let allProducts = [];
let selectedCategory = "All";
let currentSortOption = "default";
let currentSortLabel = "Default";
let currentSelectedStars = 0;
let activeProductModalId = null;

let mapInstance = null;
let mapMarker = null;
let selectedCoords = { lat: 31.2001, lng: 29.9187 };

// Dark Mode Toggle
window.toggleDarkMode = () => {
  const currentTheme = document.documentElement.getAttribute("data-bs-theme");
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-bs-theme", newTheme);
  localStorage.setItem("theme", newTheme);
  const iconEl = document.getElementById("themeIcon");
  if (iconEl) {
    iconEl.className = newTheme === "dark" ? "bi bi-sun-fill fs-6" : "bi bi-moon-fill fs-6";
  }
};

const savedTheme = localStorage.getItem("theme") || "light";
document.documentElement.setAttribute("data-bs-theme", savedTheme);

// Fetch Products
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
    if (i <= rounded) {
      starsHTML += '<i class="bi bi-star-fill text-warning"></i>';
    } else {
      starsHTML += '<i class="bi bi-star text-muted"></i>';
    }
  }
  return starsHTML;
}

// Interactive Star Selection Handler
window.selectStar = (rating) => {
  currentSelectedStars = rating;
  const stars = document.querySelectorAll("#review-stars-input .star-opt");
  stars.forEach((star, index) => {
    if (index < rating) {
      star.className = "bi bi-star-fill star-opt text-warning";
    } else {
      star.className = "bi bi-star star-opt text-secondary";
    }
  });
};

// Review Submission Handler
document.addEventListener("DOMContentLoaded", () => {
  const submitBtn = document.getElementById("submit-review-btn");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (!activeProductModalId) return;
      const author = document.getElementById("review-author").value.trim() || "Anonymous";
      const comment = document.getElementById("review-comment").value.trim();

      if (!currentSelectedStars) {
        alert("Please select a star rating!");
        return;
      }
      if (!comment) {
        alert("Please enter your review comment!");
        return;
      }

      const reviewData = {
        name: author,
        rating: currentSelectedStars,
        comment: comment,
        date: new Date().toISOString()
      };

      await push(ref(db, `products/${activeProductModalId}/reviews`), reviewData);
      alert("Thank you! Your review has been published.");
      document.getElementById("review-author").value = "";
      document.getElementById("review-comment").value = "";
      window.selectStar(0);
    });
  }
});

// Category & Sub-Filters
function renderCategoryButtons() {
  const container = document.getElementById("modal-category-filters");
  const categories = ["All", ...new Set(allProducts.map((p) => p.category || "Other"))];

  container.innerHTML = categories
    .map((cat) => {
      const activeClass = cat === selectedCategory ? "btn-dark active-category" : "btn-outline-dark";
      return `<button class="btn ${activeClass} rounded-pill px-3 btn-sm" onclick="selectCategory('${cat}', this)">${cat}</button>`;
    })
    .join("");
}

window.selectCategory = (category, btnEl) => {
  selectedCategory = category;
  document.querySelectorAll("#modal-category-filters button").forEach((b) => {
    b.className = "btn btn-outline-dark rounded-pill px-3 btn-sm";
  });
  btnEl.className = "btn btn-dark active-category rounded-pill px-3 btn-sm";
  
  renderSubFilters();
  filterAndSortProducts();
};

function renderSubFilters() {
  const colorSelect = document.getElementById("colorFilter");
  const phoneTypeSelect = document.getElementById("phoneTypeFilter");

  const categoryProducts = selectedCategory === "All"
    ? allProducts
    : allProducts.filter((p) => (p.category || "Other") === selectedCategory);

  const colorsSet = new Set();
  const phoneTypesSet = new Set();

  categoryProducts.forEach((p) => {
    if (p.color) p.color.split(",").forEach((c) => colorsSet.add(c.trim()));
    if (p.phoneType) p.phoneType.split(",").forEach((pt) => phoneTypesSet.add(pt.trim()));
  });

  const currentColor = colorSelect.value || "All";
  const currentPhoneType = phoneTypeSelect.value || "All";

  colorSelect.innerHTML = `<option value="All">All Colors</option>` +
    Array.from(colorsSet).filter(Boolean).map((c) => `<option value="${c}" ${c === currentColor ? "selected" : ""}>${c}</option>`).join("");

  phoneTypeSelect.innerHTML = `<option value="All">All Phone Types / Models</option>` +
    Array.from(phoneTypesSet).filter(Boolean).map((pt) => `<option value="${pt}" ${pt === currentPhoneType ? "selected" : ""}>${pt}</option>`).join("");
}

window.updatePriceSliderDisplay = () => {
  const slider = document.getElementById("maxPriceSlider");
  document.getElementById("priceRangeDisplay").innerText = `0 - ${Number(slider.value).toLocaleString()} EGP`;
};

// Sort & Reset Filters
window.selectSortOption = (value, label, btnEl) => {
  currentSortOption = value;
  currentSortLabel = label;

  document.querySelectorAll(".btn-sort-option").forEach((b) => b.classList.remove("active"));
  btnEl.classList.add("active");

  const sortModal = bootstrap.Modal.getInstance(document.getElementById("sortModal"));
  if (sortModal) sortModal.hide();

  filterAndSortProducts();
};

window.resetFilters = () => {
  selectedCategory = "All";
  document.getElementById("maxPriceSlider").value = 50000;
  updatePriceSliderDisplay();
  document.getElementById("colorFilter").value = "All";
  document.getElementById("phoneTypeFilter").value = "All";
  document.getElementById("searchInput").value = "";
  
  renderCategoryButtons();
  renderSubFilters();
  filterAndSortProducts();
};

// Render Products Grid
window.renderProducts = (items) => {
  const list = document.getElementById("product-list");
  if (items.length === 0) {
    list.innerHTML = `<div class="col-12 text-center my-5"><p class="text-muted">No products match your filter criteria.</p></div>`;
    return;
  }

  list.innerHTML = items
    .map((p) => {
      const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
      const displayPrice = hasDiscount ? p.discountPrice : p.price;
      const { avg } = getAverageRating(p.reviews);
      const isWishlisted = wishlist.includes(p.id);
      const qtyInCart = cart[p.id] ? cart[p.id].qty : 0;

      let stockBadgeHTML = "";
      const isOutOfStock = Number(p.stock) === 0;
      if (isOutOfStock) {
        stockBadgeHTML = `<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>`;
      } else if (Number(p.stock) < 5) {
        stockBadgeHTML = `<span class="badge bg-warning text-dark position-absolute top-0 end-0 m-2">Only ${p.stock} Left!</span>`;
      }

      return `
        <div class="col-6 col-md-3 mb-4">
            <div class="card border-0 bg-body-tertiary product-card h-100 d-flex flex-column position-relative" style="cursor: pointer;">
                
                <button class="btn btn-sm rounded-circle position-absolute top-0 start-0 m-2 z-3 d-flex align-items-center justify-content-center ${isWishlisted ? 'bg-danger text-white' : 'bg-white text-dark shadow-sm'}" 
                        onclick="toggleWishlist('${p.id}', event)" title="Add to Wishlist">
                    <i class="bi ${isWishlisted ? 'bi-heart-fill' : 'bi-heart'}"></i>
                </button>

                ${stockBadgeHTML}

                <div style="position:relative" onclick="openProductModal('${p.id}')">
                    <img src="${p.img}" class="card-img-top shadow-sm" style="aspect-ratio: 1/1; object-fit: cover; border-radius: 20px;">
                    ${hasDiscount ? '<span class="badge bg-dark" style="position:absolute; bottom:10px; left:10px;">SALE</span>' : ""}
                </div>

                <div class="card-body px-2 py-2 text-center d-flex flex-column justify-content-between" onclick="openProductModal('${p.id}')">
                    <div>
                        <h6 class="fw-bold mb-1 small text-truncate">${p.name}</h6>
                        <div class="small mb-1">
                            ${renderStarIcons(avg)} 
                            <span class="text-muted" style="font-size:0.75rem;">(${avg})</span>
                        </div>
                    </div>
                    <p class="mb-2 small">
                        ${hasDiscount ? `<del class="text-danger me-1">${p.price}</del>` : ""}
                        <span class="fw-bold">${displayPrice} EGP</span>
                    </p>
                </div>

                <button class="btn ${isOutOfStock ? 'btn-secondary' : 'btn-dark'} w-100 rounded-pill btn-sm d-flex justify-content-center align-items-center gap-1" 
                        ${isOutOfStock ? 'disabled' : ''} 
                        onclick="addToCart('${p.id}', '${p.name.replace(/'/g, "")}', ${displayPrice}, event)">
                    <span>${isOutOfStock ? 'Sold Out' : 'Add to Bag'}</span>
                    ${qtyInCart > 0 ? `<span class="badge bg-primary rounded-circle ms-1">${qtyInCart}</span>` : ''}
                </button>
            </div>
        </div>`;
    })
    .join("");
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

  let activeFilterCount = 0;
  if (selectedCategory !== "All") activeFilterCount++;
  if (maxPrice < 50000) activeFilterCount++;
  if (selectedColor !== "All") activeFilterCount++;
  if (selectedPhoneType !== "All") activeFilterCount++;

  const filterBadge = document.getElementById("filter-badge");
  if (activeFilterCount > 0) {
    filterBadge.innerText = activeFilterCount;
    filterBadge.style.display = "inline-block";
  } else {
    filterBadge.style.display = "none";
  }

  const sortBadge = document.getElementById("sort-badge");
  sortBadge.style.display = currentSortOption !== "default" ? "inline-block" : "none";

  let filtered = allProducts.filter((p) => {
    const effectivePrice = getEffectivePrice(p);
    const matchesSearch = p.name.toLowerCase().includes(term);
    const matchesCategory = selectedCategory === "All" || (p.category || "Other") === selectedCategory;
    const matchesPrice = effectivePrice <= maxPrice;
    const matchesColor = selectedColor === "All" || (p.color && p.color.toLowerCase().includes(selectedColor.toLowerCase()));
    const matchesPhoneType = selectedPhoneType === "All" || (p.phoneType && p.phoneType.toLowerCase().includes(selectedPhoneType.toLowerCase()));

    return matchesSearch && matchesCategory && matchesPrice && matchesColor && matchesPhoneType;
  });

  if (currentSortOption === "price-asc") filtered.sort((a, b) => getEffectivePrice(a) - getEffectivePrice(b));
  else if (currentSortOption === "price-desc") filtered.sort((a, b) => getEffectivePrice(b) - getEffectivePrice(a));
  else if (currentSortOption === "name-asc") filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (currentSortOption === "name-desc") filtered.sort((a, b) => b.name.localeCompare(a.name));
  else if (currentSortOption === "rating-desc") filtered.sort((a, b) => Number(getAverageRating(b.reviews).avg) - Number(getAverageRating(a.reviews).avg));
  else if (currentSortOption === "rating-asc") filtered.sort((a, b) => Number(getAverageRating(a.reviews).avg) - Number(getAverageRating(b.reviews).avg));

  renderActiveFilterBadges(maxPrice, selectedColor, selectedPhoneType);
  renderProducts(filtered);
};

function renderActiveFilterBadges(maxPrice, color, phoneType) {
  const container = document.getElementById("active-filter-tags");
  let html = "";
  if (selectedCategory !== "All") html += `<span class="badge bg-dark rounded-pill px-3 py-2 small">Cat: ${selectedCategory}</span>`;
  if (maxPrice < 50000) html += `<span class="badge bg-dark rounded-pill px-3 py-2 small">Max: ${maxPrice.toLocaleString()} EGP</span>`;
  if (color !== "All") html += `<span class="badge bg-dark rounded-pill px-3 py-2 small">Color: ${color}</span>`;
  if (phoneType !== "All") html += `<span class="badge bg-dark rounded-pill px-3 py-2 small">Model: ${phoneType}</span>`;
  if (currentSortOption !== "default") html += `<span class="badge bg-secondary rounded-pill px-3 py-2 small">Sort: ${currentSortLabel}</span>`;
  container.innerHTML = html;
}

// Wishlist System
window.toggleWishlist = (productId, event) => {
  if (event) event.stopPropagation();
  const index = wishlist.indexOf(productId);
  if (index > -1) {
    wishlist.splice(index, 1);
  } else {
    wishlist.push(productId);
  }
  localStorage.setItem("wishlist", JSON.stringify(wishlist));
  updateUI();
  filterAndSortProducts();
};

window.openWishlistModal = () => {
  const container = document.getElementById("wishlist-items-list");
  const wishlistedItems = allProducts.filter((p) => wishlist.includes(p.id));

  if (wishlistedItems.length === 0) {
    container.innerHTML = `<p class="text-center text-muted py-4 mb-0">Your wishlist is empty.</p>`;
  } else {
    container.innerHTML = wishlistedItems
      .map((p) => `
        <div class="d-flex justify-content-between align-items-center p-3 bg-body-tertiary rounded-4">
            <div class="d-flex align-items-center gap-3">
                <img src="${p.img}" class="rounded-3" style="width: 50px; height: 50px; object-fit: cover;">
                <div>
                    <h6 class="fw-bold mb-0 small">${p.name}</h6>
                    <small class="text-muted">${p.price} EGP</small>
                </div>
            </div>
            <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="toggleWishlist('${p.id}')">Remove</button>
        </div>
      `)
      .join("");
  }

  new bootstrap.Modal(document.getElementById("wishlistModal")).show();
};

// Product Modal & Gallery
window.openProductModal = (id) => {
  const p = allProducts.find((item) => item.id === id);
  if (!p) return;
  activeProductModalId = id;
  window.selectStar(0);

  recentlyViewed = recentlyViewed.filter((itemId) => itemId !== id);
  recentlyViewed.unshift(id);
  if (recentlyViewed.length > 8) recentlyViewed.pop();
  localStorage.setItem("recently_viewed", JSON.stringify(recentlyViewed));
  renderRecentlyViewed();

  const hasDiscount = p.discountPrice && Number(p.discountPrice) < Number(p.price);
  const displayPrice = hasDiscount ? p.discountPrice : p.price;
  const { avg, count } = getAverageRating(p.reviews);

  document.getElementById("modal-img").src = p.img;

  const thumbnailsContainer = document.getElementById("modal-thumbnails");
  const images = p.images ? [p.img, ...p.images] : [p.img];
  if (images.length > 1) {
    thumbnailsContainer.innerHTML = images
      .map(
        (imgSrc) => `
        <img src="${imgSrc}" class="rounded-3 shadow-sm cursor-pointer border" style="width:50px; height:50px; object-fit:cover;" onclick="document.getElementById('modal-img').src='${imgSrc}'">
      `
      )
      .join("");
  } else {
    thumbnailsContainer.innerHTML = "";
  }

  const stockContainer = document.getElementById("modal-stock-status");
  const actionContainer = document.getElementById("modal-action-container");
  const isOutOfStock = Number(p.stock) === 0;

  if (isOutOfStock) {
    stockContainer.innerHTML = `<span class="badge bg-danger">Out of Stock</span>`;
    actionContainer.innerHTML = `
      <div class="bg-body-tertiary p-3 rounded-4 mb-4 text-start">
        <h6 class="fw-bold small mb-1">Out of Stock! Get Notified:</h6>
        <div class="d-flex gap-2 mt-2">
          <input type="email" id="restockEmail" class="form-control rounded-pill small" placeholder="Enter your email">
          <button class="btn btn-dark rounded-pill text-nowrap btn-sm" onclick="requestRestock('${p.id}')">Notify Me</button>
        </div>
      </div>`;
  } else {
    stockContainer.innerHTML = `<span class="badge bg-success">In Stock (${p.stock} available)</span>`;
    actionContainer.innerHTML = `<button id="modal-add-btn" class="btn btn-luxury w-100 py-3 rounded-pill mb-4">ADD TO BAG</button>`;
    document.getElementById("modal-add-btn").onclick = () => {
      addToCart(p.id, p.name, displayPrice);
      bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();
    };
  }

  let tagsHTML = `<span class="badge bg-secondary">${p.category || "Other"}</span>`;
  if (p.color) p.color.split(",").forEach((c) => (tagsHTML += `<span class="badge bg-dark">${c.trim()}</span>`));
  document.getElementById("modal-tags").innerHTML = tagsHTML;

  document.getElementById("modal-name").innerText = p.name;
  document.getElementById("modal-desc").innerText = p.description || "No additional details provided.";
  document.getElementById("modal-price-container").innerHTML = `${hasDiscount ? `<del class="text-danger me-2">${p.price} EGP</del>` : ""}<span class="fw-bold fs-5">${displayPrice} EGP</span>`;

  document.getElementById("modal-avg-stars").innerHTML = renderStarIcons(avg);
  document.getElementById("modal-rating-text").innerText = `${avg} / 5 (${count} reviews)`;

  const reviewsListEl = document.getElementById("modal-reviews-list");
  if (!p.reviews || Object.keys(p.reviews).length === 0) {
    reviewsListEl.innerHTML = `<p class="small text-muted mb-0">No reviews yet.</p>`;
  } else {
    reviewsListEl.innerHTML = Object.values(p.reviews)
      .reverse()
      .map((r) => `
        <div class="bg-body-tertiary p-3 rounded-4 mb-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold small">${r.name || "Anonymous"}</span>
                <span class="small">${renderStarIcons(r.rating)}</span>
            </div>
            <p class="small mb-0 text-muted">${r.comment}</p>
        </div>
      `)
      .join("");
  }

  new bootstrap.Modal(document.getElementById("productModal")).show();
};

window.openLightbox = (src) => {
  document.getElementById("lightbox-img").src = src;
  new bootstrap.Modal(document.getElementById("lightboxModal")).show();
};

window.shareProduct = () => {
  if (navigator.share) {
    navigator.share({
      title: "Kareem Store",
      text: "Check out this product on Kareem Store!",
      url: window.location.href,
    });
  } else {
    navigator.clipboard.writeText(window.location.href);
    alert("Product link copied to clipboard!");
  }
};

window.requestRestock = async (productId) => {
  const emailInput = document.getElementById("restockEmail");
  if (!emailInput || !emailInput.value) {
    alert("Please enter a valid email address!");
    return;
  }
  await push(ref(db, "restock_requests"), {
    productId: productId,
    email: emailInput.value,
    date: new Date().toISOString(),
  });
  alert("Thank you! We will notify you when this item is back in stock.");
  emailInput.value = "";
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
  container.innerHTML = items
    .map(
      (p) => `
    <div class="card border-0 bg-body-tertiary p-2 flex-shrink-0" style="width: 140px; cursor: pointer;" onclick="openProductModal('${p.id}')">
      <img src="${p.img}" class="rounded-3 mb-2" style="width: 100%; height: 100px; object-fit: cover;">
      <div class="fw-bold small text-truncate text-center">${p.name}</div>
      <div class="small text-muted text-center">${p.price} EGP</div>
    </div>
  `
    )
    .join("");
}

// Map Integration
function initDeliveryMap() {
  if (mapInstance) return;

  const alexCenter = [31.2001, 29.9187];
  mapInstance = L.map("delivery-map").setView(alexCenter, 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  }).addTo(mapInstance);

  mapMarker = L.marker(alexCenter, { draggable: true }).addTo(mapInstance);

  const updateAddressDisplay = (lat, lng) => {
    selectedCoords = { lat: lat.toFixed(5), lng: lng.toFixed(5) };
    document.getElementById("selectedAddress").value = `Lat: ${selectedCoords.lat}, Lng: ${selectedCoords.lng}`;
  };

  updateAddressDisplay(alexCenter[0], alexCenter[1]);

  mapMarker.on("dragend", function () {
    const position = mapMarker.getLatLng();
    updateAddressDisplay(position.lat, position.lng);
  });

  mapInstance.on("click", function (e) {
    mapMarker.setLatLng(e.latlng);
    updateAddressDisplay(e.latlng.lat, e.latlng.lng);
  });
}

document.getElementById("cartModal").addEventListener("shown.bs.modal", () => {
  initDeliveryMap();
  if (mapInstance) mapInstance.invalidateSize();
});

// Cart & Orders
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
  localStorage.setItem("cart", JSON.stringify(cart));
  const totalQty = Object.values(cart).reduce((a, b) => a + b.qty, 0);
  document.getElementById("cart-count").innerText = totalQty;

  const wishlistCountEl = document.getElementById("wishlist-count");
  if (wishlist.length > 0) {
    wishlistCountEl.innerText = wishlist.length;
    wishlistCountEl.style.display = "inline-block";
  } else {
    wishlistCountEl.style.display = "none";
  }
}

window.openCheckout = () => {
  const listDiv = document.getElementById("cart-items-list");
  const totalEl = document.getElementById("total-price");
  let total = 0;

  if (Object.keys(cart).length === 0) {
    listDiv.innerHTML = "<p class='text-center text-muted py-4'>Your bag is empty.</p>";
    totalEl.innerText = "0";
  } else {
    listDiv.innerHTML = Object.keys(cart)
      .map((id) => {
        const item = cart[id];
        total += item.price * item.qty;
        return `
          <div class="d-flex justify-content-between align-items-center mb-3 p-3 bg-body-tertiary rounded-4">
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

  new bootstrap.Modal(document.getElementById("cartModal")).show();
};

window.updateQty = (id, change) => {
  cart[id].qty += change;
  if (cart[id].qty <= 0) delete cart[id];
  updateUI();
  openCheckout();
};

window.orderViaWhatsApp = () => {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("selectedAddress").value;

  if (!name || !phone || Object.keys(cart).length === 0) {
    alert("Please enter your name, phone number, and items to order via WhatsApp!");
    return;
  }

  const itemsList = Object.values(cart).map((i) => `- ${i.qty}x ${i.name} (${i.price * i.qty} EGP)`).join("\n");
  const total = Object.values(cart).reduce((a, b) => a + b.price * b.qty, 0);

  const text = `New Order from Kareem Store\n\nName: ${name}\nPhone: ${phone}\nLocation: ${address}\n\nItems:\n${itemsList}\n\nTotal: ${total} EGP`;
  const whatsappUrl = `https://wa.me/201000000000?text=${encodeURIComponent(text)}`;
  window.open(whatsappUrl, "_blank");
};

window.confirmOrder = async () => {
  const name = document.getElementById("name").value;
  const phone = document.getElementById("phone").value;
  const address = document.getElementById("selectedAddress").value;

  if (!name || !phone || Object.keys(cart).length === 0) {
    alert("Please complete your information!");
    return;
  }

  const orderData = {
    custName: name,
    custPhone: "+20" + phone,
    custLocation: address,
    coords: selectedCoords,
    items: Object.values(cart).map((i) => `${i.qty}x ${i.name}`).join(", "),
    total: Object.values(cart).reduce((a, b) => a + b.price * b.qty, 0),
    time: new Date().toLocaleString("en-EG"),
    status: "New",
  };

  try {
    await push(ref(db, "orders"), orderData);
    bootstrap.Modal.getInstance(document.getElementById("cartModal")).hide();
    document.getElementById("successToast").classList.add("show-success");
    cart = {};
    updateUI();
    setTimeout(() => location.reload(), 3000);
  } catch (e) {
    console.error(e);
    alert("Error sending order. Please try again!");
  }
};
