const PAGE_SIZE = 36;
const FAVORITES_KEY = "canteen-menu-favorites-v1";

const state = {
  data: null,
  merchant: "",
  category: "",
  priceMode: "all",
  tastes: new Set(),
  forms: new Set(),
  meals: new Set(),
  favoritesOnly: false,
  query: "",
  sort: "source",
  limit: PAGE_SIZE,
  favorites: new Set(readFavorites()),
};

// Avoid a browser-restored select value disagreeing with the initial result order.
document.getElementById("sort-filter").value = state.sort;

const el = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

function readFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function writeFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...state.favorites]));
  } catch {
    // The catalogue remains usable when local storage is unavailable.
  }
}

function priceStatus(item) {
  if (item.price === 0) return "zero";
  if (item.price !== null && item.price !== undefined) return "priced";
  if (item.priceLabel) return "label";
  return "missing";
}

function formatPrice(value) {
  return `¥${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value)}`;
}

function renderSummary() {
  const { summary } = state.data;
  el("stat-items").textContent = summary.itemCount;
  el("stat-prices").textContent = summary.numericPriceCount;
  el("stat-merchants").textContent = summary.merchantCount;
  el("quality-missing").textContent = summary.missingPriceCount;
  el("quality-labels").textContent = summary.priceLabelCount;
  el("quality-zero").textContent = summary.zeroPriceCount;
  el("favorite-count").textContent = state.favorites.size;

  const counts = new Map();
  state.data.items.forEach((item) => counts.set(item.merchant, (counts.get(item.merchant) || 0) + 1));
  el("merchant-filters").innerHTML = [
    ["", "全部品牌", state.data.items.length],
    ...[...counts.entries()].map(([merchant, count]) => [merchant, merchant, count]),
  ].map(([value, label, count]) => `
    <button type="button" class="filter-button${state.merchant === value ? " is-active" : ""}" data-merchant="${escapeHtml(value)}" aria-pressed="${state.merchant === value}">
      <span>${escapeHtml(label)}</span><span class="filter-count">${count}</span>
    </button>
  `).join("");
  renderCategories();
  renderTagFilters();
}

function renderCategories() {
  const items = state.data.items.filter((item) => !state.merchant || item.merchant === state.merchant);
  const categories = [...new Set(items.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const select = el("category-filter");
  const previous = categories.includes(state.category) ? state.category : "";
  state.category = previous;
  select.innerHTML = `<option value="">全部分类</option>${categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("")}`;
  select.value = state.category;
}

function renderTagFilters() {
  const scopedItems = state.data.items.filter((item) => {
    if (state.merchant && item.merchant !== state.merchant) return false;
    if (state.category && item.category !== state.category) return false;
    return true;
  });
  const tasteCounts = new Map();
  const formCounts = new Map();
  const mealCounts = new Map();
  let tastePending = 0;
  let mealPending = 0;
  scopedItems.forEach((item) => {
    if (!item.tasteTags?.length) tastePending += 1;
    if (!item.mealTags?.length) mealPending += 1;
    item.tasteTags?.forEach((tag) => tasteCounts.set(tag, (tasteCounts.get(tag) || 0) + 1));
    item.formTags?.forEach((tag) => formCounts.set(tag, (formCounts.get(tag) || 0) + 1));
    item.mealTags?.forEach((tag) => mealCounts.set(tag, (mealCounts.get(tag) || 0) + 1));
  });

  const tasteOptions = ["酸", "甜", "苦", "辣", "麻"]
    .filter((tag) => tasteCounts.has(tag) || state.tastes.has(tag))
    .map((tag) => [tag, tasteCounts.get(tag) || 0]);
  tasteOptions.push(["待判断", tastePending]);
  el("taste-filters").innerHTML = tasteOptions.map(([tag, count]) => {
    const key = tag === "待判断" ? "__pending__" : tag;
    const active = state.tastes.has(key);
    return `<button type="button" class="tag-chip taste-chip${active ? " is-active" : ""}" data-taste="${escapeHtml(key)}" aria-pressed="${active}">${escapeHtml(tag)}<span>${count}</span></button>`;
  }).join("");

  const formOrder = ["米饭", "面食/粉", "汤羹", "粥", "点心", "饺子馄饨", "烧烤", "热菜", "套餐", "小吃", "其他"];
  el("form-filters").innerHTML = formOrder
    .filter((tag) => formCounts.has(tag) || state.forms.has(tag))
    .map((tag) => {
      const count = formCounts.get(tag) || 0;
      const active = state.forms.has(tag);
      return `<button type="button" class="tag-chip form-chip${active ? " is-active" : ""}" data-form="${escapeHtml(tag)}" aria-pressed="${active}">${escapeHtml(tag)}<span>${count}</span></button>`;
    }).join("");

  const mealOrder = ["早餐", "午餐", "晚餐"];
  el("meal-filters").innerHTML = [
    ...mealOrder.map((tag) => [tag, mealCounts.get(tag) || 0]),
    ["待确认", mealPending],
  ].map(([tag, count]) => {
    const key = tag === "待确认" ? "__pending__" : tag;
    const active = state.meals.has(key);
    return `<button type="button" class="tag-chip meal-chip${active ? " is-active" : ""}" data-meal="${escapeHtml(key)}" aria-pressed="${active}">${escapeHtml(tag)}<span>${count}</span></button>`;
  }).join("");
}

function filteredItems() {
  const query = state.query.trim().toLocaleLowerCase("zh-CN");
  const filtered = state.data.items.filter((item) => {
    if (state.merchant && item.merchant !== state.merchant) return false;
    if (state.category && item.category !== state.category) return false;
    if (state.favoritesOnly && !state.favorites.has(item.id)) return false;
    if (state.tastes.size && ![...state.tastes].some((tag) => tag === "__pending__" ? !item.tasteTags?.length : item.tasteTags?.includes(tag))) return false;
    if (state.forms.size && ![...state.forms].some((tag) => item.formTags?.includes(tag))) return false;
    if (state.meals.size && ![...state.meals].some((tag) => tag === "__pending__" ? !item.mealTags?.length : item.mealTags?.includes(tag))) return false;
    if (state.priceMode === "priced" && priceStatus(item) !== "priced") return false;
    if (state.priceMode === "check" && priceStatus(item) === "priced") return false;
    if (query) {
      const searchable = [item.name, item.location, item.merchant, item.stall, item.category, item.priceLabel, item.note, item.sourceSheet, item.price, ...(item.tasteTags || []), ...(item.formTags || []), ...(item.mealTags || [])]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLocaleLowerCase("zh-CN");
      if (!searchable.includes(query)) return false;
    }
    return true;
  });

  if (state.sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  if (state.sort === "price") filtered.sort((a, b) => {
    const aPrice = a.price ?? Number.POSITIVE_INFINITY;
    const bPrice = b.price ?? Number.POSITIVE_INFINITY;
    return aPrice - bPrice || a.name.localeCompare(b.name, "zh-CN");
  });
  return filtered;
}

function renderPrice(item) {
  const status = priceStatus(item);
  if (status === "zero") {
    return `<div class="item-price is-zero"><strong>${formatPrice(item.price)}</strong><span class="price-hint">零价待核</span></div>`;
  }
  if (status === "priced") return `<div class="item-price"><strong>${formatPrice(item.price)}</strong></div>`;
  if (status === "label") {
    return `<div class="item-price is-label"><strong>${escapeHtml(item.priceLabel)}</strong><span class="price-hint">原表标记</span></div>`;
  }
  return `<div class="item-price is-unknown"><strong>价格待补</strong></div>`;
}

function placeholderPhoto(item) {
  const forms = item.formTags || [];
  if (forms.some((tag) => ["汤羹", "粥", "面食/粉"].includes(tag))) return "assets/food/noodles.jpg";
  if (forms.some((tag) => ["米饭", "套餐"].includes(tag))) return "assets/food/rice.jpg";
  if (forms.some((tag) => ["点心", "饺子馄饨"].includes(tag))) return "assets/food/dimsum.jpg";
  return "assets/food/stirfry.jpg";
}

function renderItem(item, index) {
  const saved = state.favorites.has(item.id);
  const tasteTags = item.tasteTags?.length
    ? item.tasteTags.map((tag) => `<span class="item-tag flavor-tag taste-${({ 酸: "acid", 甜: "sweet", 苦: "bitter", 辣: "spicy", 麻: "numbing" })[tag] || "other"}">${escapeHtml(tag)}</span>`).join("")
    : `<span class="item-tag pending-tag">口味待判</span>`;
  const formTags = (item.formTags || []).slice(0, 2).map((tag) => `<span class="item-tag form-tag">${escapeHtml(tag)}</span>`).join("");
  const mealTags = item.mealTags?.length
    ? item.mealTags.map((tag) => `<span class="item-tag meal-tag meal-${({ 早餐: "breakfast", 午餐: "lunch", 晚餐: "dinner" })[tag] || "other"}">${escapeHtml(tag)}</span>`).join("")
    : `<span class="item-tag schedule-pending">时段待确认</span>`;
  const notes = [
    item.note ? `<span class="item-tag note-tag">${escapeHtml(item.note)}</span>` : "",
    item.price === 0 ? `<span class="item-tag note-tag">原表零价待核</span>` : "",
  ].filter(Boolean).join("");
  return `<li class="menu-row" style="animation-delay:${Math.min(index, 10) * 18}ms">
    <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
    <div class="dish-photo"><img src="${placeholderPhoto(item)}" alt="" loading="lazy" width="160" height="120"><span>示意图</span></div>
    <div class="item-main">
      <h3>${escapeHtml(item.name)}</h3>
      <div class="item-meta"><span>${escapeHtml(item.merchant)}</span><span class="meta-sep">/</span><span>${escapeHtml(item.stall)}</span><span class="meta-sep">/</span><span>${escapeHtml(item.category)}</span></div>
      <div class="item-tags">${tasteTags}${mealTags}${formTags}${notes}</div>
    </div>
    ${renderPrice(item)}
    <button type="button" class="favorite-item${saved ? " is-saved" : ""}" data-favorite="${escapeHtml(item.id)}" aria-label="${saved ? "取消收藏" : "收藏"}${escapeHtml(item.name)}" aria-pressed="${saved}" title="${saved ? "取消收藏" : "收藏"}">${saved ? "★" : "☆"}</button>
  </li>`;
}

function render() {
  if (!state.data) return;
  const items = filteredItems();
  const visible = items.slice(0, state.limit);
  const list = el("menu-list");
  list.innerHTML = visible.map(renderItem).join("");
  const hasResults = items.length > 0;
  el("loading-state").hidden = true;
  el("empty-state").hidden = hasResults;
  list.hidden = !hasResults;
  el("result-count").textContent = items.length.toLocaleString("zh-CN");
  el("shown-count").textContent = hasResults ? `显示 ${visible.length} / ${items.length} 条` : "";
  el("load-more").hidden = visible.length >= items.length;
  el("favorites-toggle").setAttribute("aria-pressed", String(state.favoritesOnly));
  el("favorites-toggle").classList.toggle("is-active", state.favoritesOnly);
  el("favorite-count").textContent = state.favorites.size;

  const title = state.favoritesOnly ? "我的收藏" : state.merchant || state.category || state.query || state.tastes.size || state.forms.size || state.meals.size ? "筛选结果" : "全部菜品";
  el("results-title").firstChild.textContent = `${title} `;
}

function resetLimit() {
  state.limit = PAGE_SIZE;
  render();
}

function setActivePriceMode(mode) {
  state.priceMode = mode;
  document.querySelectorAll("[data-price-mode]").forEach((button) => {
    const active = button.dataset.priceMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function clearFilters() {
  state.merchant = "";
  state.category = "";
  state.tastes.clear();
  state.forms.clear();
  state.meals.clear();
  state.favoritesOnly = false;
  state.query = "";
  state.sort = "source";
  state.limit = PAGE_SIZE;
  el("search-input").value = "";
  el("sort-filter").value = "source";
  el("category-filter").value = "";
  setActivePriceMode("all");
  renderSummary();
  render();
}

async function start() {
  try {
    const response = await fetch("data/menu.json");
    if (!response.ok) throw new Error("menu data could not be loaded");
    state.data = await response.json();
    renderSummary();
    render();
  } catch {
    el("loading-state").textContent = "菜品清单暂时无法载入，请刷新页面后再试。";
  }
}

el("search-input").addEventListener("input", (event) => {
  state.query = event.target.value;
  resetLimit();
});
el("search-input").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.currentTarget.value = "";
    state.query = "";
    resetLimit();
  }
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    el("search-input").focus();
  }
});
el("merchant-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-merchant]");
  if (!button) return;
  state.merchant = button.dataset.merchant;
  renderSummary();
  resetLimit();
});
el("category-filter").addEventListener("change", (event) => {
  state.category = event.target.value;
  renderTagFilters();
  resetLimit();
});
el("taste-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-taste]");
  if (!button) return;
  const tag = button.dataset.taste;
  state.tastes.has(tag) ? state.tastes.delete(tag) : state.tastes.add(tag);
  renderTagFilters();
  resetLimit();
});
el("form-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-form]");
  if (!button) return;
  const tag = button.dataset.form;
  state.forms.has(tag) ? state.forms.delete(tag) : state.forms.add(tag);
  renderTagFilters();
  resetLimit();
});
el("meal-filters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-meal]");
  if (!button) return;
  const tag = button.dataset.meal;
  state.meals.has(tag) ? state.meals.delete(tag) : state.meals.add(tag);
  renderTagFilters();
  resetLimit();
});
document.querySelectorAll("[data-price-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    setActivePriceMode(button.dataset.priceMode);
    resetLimit();
  });
});
el("sort-filter").addEventListener("change", (event) => {
  state.sort = event.target.value;
  resetLimit();
});
el("favorites-toggle").addEventListener("click", () => {
  state.favoritesOnly = !state.favoritesOnly;
  resetLimit();
});
el("menu-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-favorite]");
  if (!button) return;
  const id = button.dataset.favorite;
  state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id);
  writeFavorites();
  render();
});
el("load-more").addEventListener("click", () => {
  state.limit += PAGE_SIZE;
  render();
});
el("clear-filters").addEventListener("click", clearFilters);

start();
