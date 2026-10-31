"use strict";

(function () {
  // ===== 1. CONFIG =====
  const CONFIG = Object.freeze({
    SHEET_CSV_URL:
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vQNfKtroJHKmkHgYdHgAm4E2OkXD19Ggr3MqovEReGiVhRZXfW168a1_BTeNht25CeaBwJitiN-u7v9/pub?gid=0&single=true&output=csv",
    WHATSAPP_NUMBER: "963998910648",
    CURRENCY_LABEL: "ر.س",
    LOCALE: "ar-SA-u-nu-latn",
    MAX_QTY_PER_ITEM: 20,
    FETCH_TIMEOUT_MS: 8000,
    ALLOWED_IMAGE_HOSTS: Object.freeze([
      "images.unsplash.com",
      "res.cloudinary.com",
    ]),
  });
  // ===== 2. STATE =====
  const state = { catalog: [], cart: [], activeCategory: "all", searchQuery: "", lastFocusedElement: null };

  // ===== 3. DOM HELPERS =====
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  function h(tag, attrs = {}, children = []) {
    const element = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      if (["disabled", "hidden", "checked", "selected", "multiple", "required"].includes(key)) {
        element[key] = Boolean(value);
        return;
      }
      element.setAttribute(key, String(value));
    });
    children.flat().forEach((child) => element.append(child instanceof Node ? child : document.createTextNode(String(child))));
    return element;
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  }
  const clearElement = (element) => element.replaceChildren();

  // ===== 4. SAFE STORAGE =====
  function safeGet(key, fallback = null) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
  }
  function safeSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { console.warn("Storage write failed"); } }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch { console.warn("Storage removal failed"); } }

  // ===== 5. FORMATTERS AND VALIDATORS =====
  function money(value) { return `${Number(value).toLocaleString(CONFIG.LOCALE)} ${CONFIG.CURRENCY_LABEL}`; }
  function safeImageUrl(value) {
    const text = String(value || "").trim();
    if (!text || text.includes("..")) return "";
    if (/^[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|avif)$/i.test(text)) return text;
    try {
      const url = new URL(text);
      return url.protocol === "https:" && CONFIG.ALLOWED_IMAGE_HOSTS.includes(url.hostname) ? url.href : "";
    } catch { return ""; }
  }
  function sanitizeName(value) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim(); }
  function validatePhone(value) { return /^\+?[0-9]{8,15}$/.test(String(value || "").replace(/[\s-]/g, "")); }
  function validateProduct(product, rowNumber = 0, ids = new Set()) {
    const id = String(product.id || "").trim();
    const name = sanitizeName(product.name);
    const description = String(product.description || "").trim();
    const category = String(product.category || "").trim();
    const priceText = String(product.price || "").trim();
    const price = Number(priceText);
    const reason = !id || id.length > 40 || !/^[A-Za-z0-9_-]+$/.test(id) ? "invalid id" :
      ids.has(id) ? "duplicate id" : name.length < 1 || name.length > 80 ? "invalid name" :
      description.length > 160 ? "invalid description" : !/^(?:\d+(?:\.\d+)?)$/.test(priceText) || !Number.isFinite(price) || price < 0 || price > 1000000 ? "invalid price" :
      !["makeup", "fragrance", "skincare"].includes(category) ? `invalid category "${category}"` :
      String(product.badge || "").trim().length > 24 ? "invalid badge" : safeImageUrl(product.image) !== String(product.image || "").trim() && String(product.image || "").trim() ? "invalid image" : "";
    if (reason) { console.warn(`Row ${rowNumber}: ${reason}`); return null; }
    ids.add(id);
    return { id, name, description, price, category, image: safeImageUrl(product.image), badge: String(product.badge || "").trim(), soldout: ["true", "1", "yes", "نعم"].includes(String(product.soldout || "").toLowerCase()) };
  }

  // ===== 6. CSV PARSER =====
  function parseCSV(text) {
    const source = String(text || "").replace(/^\uFEFF/, "");
    const rows = []; let row = []; let field = ""; let quoted = false;
    for (let i = 0; i < source.length; i += 1) {
      const char = source[i];
      if (char === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i += 1; } else quoted = !quoted; }
      else if (char === "," && !quoted) { row.push(field); field = ""; }
      else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i += 1; row.push(field); if (row.some((cell) => cell !== "")) rows.push(row); row = []; field = ""; }
      else field += char;
    }
    if (field || row.length) { row.push(field); if (row.some((cell) => cell !== "")) rows.push(row); }
    if (!rows.length) return [];
    const headers = rows[0].map((header) => header.trim().toLowerCase());
    return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, String(cells[index] || "").trim()])));
  }

  // ===== 7. CATALOG =====
  function rowsToProducts(rows) {
    const ids = new Set();
    return rows.map((row, index) => {
      const active = ["", "true", "1", "yes", "نعم"].includes(String(row.active || "").toLowerCase());
      const product = validateProduct(row, index + 2, ids);
      return active ? product : null;
    }).filter(Boolean);
  }
  async function fetchCatalog() {
    if (!CONFIG.SHEET_CSV_URL.startsWith("https://docs.google.com/") || CONFIG.SHEET_CSV_URL.includes("/edit") || CONFIG.SHEET_CSV_URL === "PASTE_PUBLISHED_CSV_URL_HERE") throw new Error("Invalid published sheet URL");
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(CONFIG.SHEET_CSV_URL, { cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal });
      if (!response.ok) throw new Error(`Sheet request failed: ${response.status}`);
      const products = rowsToProducts(parseCSV(await response.text()));
      if (!products.length) throw new Error("Sheet contained no valid products");
      safeSet("lavendar_catalog_cache", products); return products;
    } finally { clearTimeout(timer); }
  }
  async function loadCatalog() {
    renderLoading();
    try { state.catalog = await fetchCatalog(); } catch (error) {
      console.warn("Catalog update failed:", error.message);
      const cached = safeGet("lavendar_catalog_cache", []);
      state.catalog = Array.isArray(cached) ? rowsToProducts(cached.map((product) => ({ ...product, active: "true" }))) : [];
      renderNotice(state.catalog.length ? "تعذّر تحديث المنتجات، نعرض آخر نسخة متاحة" : "تعذّر تحميل المنتجات حالياً");
    }
    state.cart = state.cart.filter((line) => state.catalog.some((product) => product.id === line.id && !product.soldout));
    safeSet("lavendar_cart", state.cart); renderProducts(); renderCart();
  }

  // ===== 8. CART =====
  function cartQuantity(id) { return state.cart.find((line) => line.id === id)?.qty || 0; }
  function saveCart() { safeSet("lavendar_cart", state.cart); renderCart(); }
  function addToCart(id) { const product = state.catalog.find((item) => item.id === id); if (!product || product.soldout) return; const line = state.cart.find((item) => item.id === id); if (line) line.qty = Math.min(CONFIG.MAX_QTY_PER_ITEM, line.qty + 1); else state.cart.push({ id, qty: 1 }); saveCart(); renderNotice("تمت إضافة المنتج إلى السلة"); }
  function updateQuantity(id, amount) { const line = state.cart.find((item) => item.id === id); if (!line) return; line.qty = Math.max(0, Math.min(CONFIG.MAX_QTY_PER_ITEM, line.qty + amount)); state.cart = state.cart.filter((item) => item.qty); saveCart(); }

  // ===== 9. RENDER =====
  function renderNotice(message) { const target = $("#catalogNotice"); if (target) { target.textContent = message; target.hidden = false; } }
  function renderLoading() { const target = $("#productGrid"); if (target) target.replaceChildren(...Array.from({ length: 6 }, () => h("div", { class: "skeleton-card", "aria-hidden": "true" }, [h("div", { class: "skeleton-image" }), h("div", { class: "skeleton-line" }), h("div", { class: "skeleton-line short" })]))); }
  function renderProducts() {
    const target = $("#productGrid"); if (!target) return; clearElement(target);
    const visible = state.catalog.filter((product) => (state.activeCategory === "all" || product.category === state.activeCategory) && `${product.name} ${product.description}`.toLowerCase().includes(state.searchQuery.toLowerCase()));
    $("#productCount").textContent = `${visible.length} منتجات`;
    if (!visible.length) {
      const empty = h("div", { class: "catalog-state" }, [h("p", {}, [state.catalog.length ? "لا توجد نتائج مطابقة." : "تعذّر تحميل المنتجات حالياً"])]);
      if (!state.catalog.length) empty.append(h("a", { class: "button button-outline", id: "catalogWhatsapp", href: `https://wa.me/${CONFIG.WHATSAPP_NUMBER}`, target: "_blank", rel: "noopener noreferrer" }, ["تواصلي معنا عبر واتساب"]));
      target.append(empty);
    }
    visible.forEach((product) => {
      const image = product.image ? h("img", { src: product.image, alt: product.name, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" }) : h("div", { class: "no-image", "aria-label": "Lavendar" }, ["Lavendar"]);
      const badge = product.soldout ? "نفد المخزون" : product.badge;
      const card = h("article", { class: `product-card${product.soldout ? " sold-out" : ""}` }, [h("div", { class: "product-image" }, [image, badge ? h("span", { class: "product-badge" }, [badge]) : null, h("button", { class: "quick-add", type: "button", "aria-label": "أضيفي إلى السلة", disabled: product.soldout }, [product.soldout ? "نفد المخزون" : "أضيفي إلى السلة +"])]), h("div", { class: "product-info" }, [h("h3", {}, [product.name]), h("p", {}, [product.description]), h("strong", { class: "product-price" }, [money(product.price)])])]);
      $(".quick-add", card).addEventListener("click", () => addToCart(product.id)); target.append(card);
    });
  }
  function renderCart() {
    const target = $("#bagItems"); if (!target) return; clearElement(target);
    $("#bagCount").textContent = state.cart.reduce((sum, line) => sum + line.qty, 0); $("#drawerCount").textContent = $("#bagCount").textContent;
    let total = 0;
    state.cart.forEach((line) => { const product = state.catalog.find((item) => item.id === line.id); if (!product) return; total += product.price * line.qty; const controls = h("div", { class: "cart-controls" }, [h("button", { type: "button", "aria-label": "زيادة الكمية" }, [icon("plus")]), h("span", {}, [line.qty]), h("button", { type: "button", "aria-label": "تقليل الكمية" }, [icon("minus")])]); controls.firstChild.addEventListener("click", () => updateQuantity(line.id, 1)); controls.lastChild.addEventListener("click", () => updateQuantity(line.id, -1)); target.append(h("div", { class: "bag-line" }, [h("span", {}, [product.name, h("small", {}, [money(product.price * line.qty)])]), controls, h("button", { type: "button", "aria-label": "حذف المنتج" }, [icon("trash")])])); target.lastChild.lastChild.addEventListener("click", () => { state.cart = state.cart.filter((item) => item.id !== line.id); saveCart(); }); });
    if (!target.children.length) target.append(h("p", { class: "empty-bag" }, ["سلتك فارغة حالياً."]));
    $("#bagTotal").textContent = money(total); $("#whatsappOrder").disabled = !state.cart.length;
    const heroProduct = state.catalog.find((product) => product.badge === "الأكثر مبيعاً" && !product.soldout) || state.catalog.find((product) => !product.soldout);
    const heroCard = $("#floatingCard");
    if (heroCard) { heroCard.hidden = !heroProduct; if (heroProduct) { $("#heroProductName").textContent = heroProduct.name; $("#heroProductDescription").textContent = heroProduct.description; $("#heroProductPrice").textContent = money(heroProduct.price); } }
    const whatsappLink = $("#footerWhatsapp"); if (whatsappLink) whatsappLink.href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}`;
    const floatingWhatsapp = $("#floatingWhatsapp"); if (floatingWhatsapp) floatingWhatsapp.href = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}`;
  }
  function updateThemeButton() { const dark = document.body.classList.contains("dark-mode"); $("#themeToggle").setAttribute("aria-label", dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"); }

  // ===== 10. WHATSAPP ORDER =====
  function buildOrderMessage(name, phone) { const lines = state.cart.map((line) => { const product = state.catalog.find((item) => item.id === line.id); return `- ${product.name} × ${line.qty} — ${money(product.price * line.qty)}`; }).join("\n"); return `مرحباً Lavendar، أريد تأكيد هذا الطلب:\n\nاسم العميل: ${name}\nرقم الهاتف: ${phone}\n\nالمنتجات:\n${lines}\n\nالمجموع: ${money(state.cart.reduce((sum, line) => sum + state.catalog.find((p) => p.id === line.id).price * line.qty, 0))}\n\nالأسعار تُؤكَّد عند التواصل`; }
  function sendOrder() { const name = sanitizeName($("#customerName").value); const phone = $("#customerPhone").value.replace(/[\s-]/g, ""); if (name.length < 2 || name.length > 60 || !validatePhone(phone)) { $("#orderError").textContent = "يرجى إدخال اسم ورقم هاتف صحيحين."; return; } window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(buildOrderMessage(name, phone))}`, "_blank", "noopener,noreferrer"); }

  // ===== 11. UI EVENTS =====
  function setupEvents() {
    $("#themeToggle").addEventListener("click", () => { document.body.classList.toggle("dark-mode"); safeSet("lavendar_theme", document.body.classList.contains("dark-mode") ? "dark" : "light"); updateThemeButton(); });
    let searchTimer; $("#searchInput").addEventListener("input", (event) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.searchQuery = event.target.value; renderProducts(); }, 200); });
    $("#searchToggle").addEventListener("click", () => { $("#searchBar").classList.add("open"); $("#searchInput").focus(); }); $("#closeSearch").addEventListener("click", () => $("#searchBar").classList.remove("open"));
    $("#filters").addEventListener("click", (event) => { if (!event.target.matches(".filter")) return; $$(".filter").forEach((button) => button.classList.remove("active")); event.target.classList.add("active"); state.activeCategory = event.target.dataset.category; renderProducts(); });
    $$('a[href="#shop"]').forEach((link) => link.addEventListener("click", () => { if (link.textContent.includes("عرض كل")) { state.activeCategory = "all"; state.searchQuery = ""; $("#searchInput").value = ""; renderProducts(); } }));
    const drawer = $("#bagDrawer"); const closeDrawer = () => { drawer.classList.remove("open"); $("#overlay").classList.remove("show"); state.lastFocusedElement?.focus(); }; $("#bagToggle").addEventListener("click", () => { state.lastFocusedElement = document.activeElement; drawer.classList.add("open"); $("#overlay").classList.add("show"); $("#bagClose").focus(); }); $("#bagClose").addEventListener("click", closeDrawer); $("#overlay").addEventListener("click", closeDrawer); $("#whatsappOrder").addEventListener("click", sendOrder);
    $("#menuToggle").addEventListener("click", () => { const open = $(".main-nav").classList.toggle("mobile-open"); $("#menuToggle").setAttribute("aria-expanded", open); }); $$(".main-nav a").forEach((link) => link.addEventListener("click", () => $(".main-nav").classList.remove("mobile-open")));
    $$(".collection-card").forEach((link) => link.addEventListener("click", () => { state.activeCategory = link.dataset.category; $$(".filter").forEach((button) => button.classList.toggle("active", button.dataset.category === state.activeCategory)); renderProducts(); }));
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") { $("#searchBar").classList.remove("open"); if (drawer.classList.contains("open")) closeDrawer(); } });
  }

  // ===== 12. INIT =====
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    safeRemove("lavendar_products"); state.cart = safeGet("lavendar_cart", []).filter((line) => line && typeof line.id === "string" && Number.isInteger(line.qty) && line.qty > 0).map((line) => ({ id: line.id, qty: Math.min(CONFIG.MAX_QTY_PER_ITEM, line.qty) }));
    const copyright = $(".copyright"); if (copyright) copyright.textContent = `© ${new Date().getFullYear()} Lavendar. صنع بحب.`;
    if (safeGet("lavendar_theme") === "dark") document.body.classList.add("dark-mode");
    $("#bagDrawer").setAttribute("role", "dialog"); $("#bagDrawer").setAttribute("aria-modal", "true"); $("#bagDrawer").setAttribute("aria-labelledby", "drawerTitle"); $("#drawerTitle")?.setAttribute("id", "drawerTitle"); $("#menuToggle").setAttribute("aria-expanded", "false"); updateThemeButton(); setupEvents(); loadCatalog();
  });

  if (typeof module !== "undefined" && module.exports) { module.exports = { parseCSV, rowsToProducts, validateProduct, safeImageUrl, validatePhone, sanitizeName, money }; }
})();
