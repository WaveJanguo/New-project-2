const API_BASE = 'https://aippmk.cn/api';
const PLATFORM_FEE_RATE = 0.05;
const FAVORITES_STORAGE_KEY = "gpt-image-favorites";
const USER_STORAGE_KEY = "promptmarket-user";
const KYC_STORAGE_KEY = "promptmarket-kyc";

async function api(path, options = {}) {
  const token = state?.user?.token;
  const res = await fetch(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

const state = {
  prompts: [],
  filteredPrompts: [],
  activePrompt: null,
  activeOrderPrompt: null,
  pendingAction: null,
  activeCategory: "all",
  user: JSON.parse(localStorage.getItem(USER_STORAGE_KEY) || "null"),
  kyc: JSON.parse(localStorage.getItem(KYC_STORAGE_KEY) || "null"),
  favorites: new Set(JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]")),
};

const grid = document.getElementById("prompt-grid");
const totalCount = document.getElementById("total-count");
const searchInput = document.getElementById("search-input");
const languageFilter = document.getElementById("language-filter");
const accessFilter = document.getElementById("access-filter");
const creatorModal = document.getElementById("creator-modal");
const orderModal = document.getElementById("order-modal");
const authModal = document.getElementById("auth-modal");
const kycModal = document.getElementById("kyc-modal");
const detailModal = document.getElementById("detail-modal");
const template = document.getElementById("prompt-card-template");

bind("creator-btn", "click", beginCreatorPublish);
bind("creator-btn-side", "click", beginCreatorApply);
bind("creator-form", "submit", submitCreatorPrompt);
bind("auth-form", "submit", submitAuth);
bind("kyc-form", "submit", submitKyc);
bind("close-modal", "click", closeCreatorModal);
bind("close-order", "click", closeOrderModal);
bind("close-auth", "click", closeAuthModal);
bind("close-kyc", "click", closeKycModal);
bind("confirm-order", "click", confirmOrder);
bind("close-detail", "click", closeDetailModal);
bind("detail-copy", "click", copyActivePrompt);
bind("login-btn", "click", openAuthModal);

document.querySelector('[data-close-modal="true"]')?.addEventListener("click", closeCreatorModal);
document.querySelector('[data-close-order="true"]')?.addEventListener("click", closeOrderModal);
document.querySelector('[data-close-auth="true"]')?.addEventListener("click", closeAuthModal);
document.querySelector('[data-close-kyc="true"]')?.addEventListener("click", closeKycModal);
document.querySelector('[data-close-detail="true"]')?.addEventListener("click", closeDetailModal);

document.querySelectorAll(".category-chip").forEach((button) => {
  button.addEventListener("click", () => selectCategory(button));
});

searchInput.addEventListener("input", applyFilters);
languageFilter.addEventListener("change", applyFilters);
accessFilter.addEventListener("change", applyFilters);

init();

function bind(id, eventName, handler) {
  document.getElementById(id)?.addEventListener(eventName, handler);
}

async function init() {
  try {
    const prompts = await loadPrompts();
    const sourcePrompts = prompts.map((item, index) => {
      const rank = index + 1;
      return {
        ...item,
        rank,
        accessType: item.accessType || "free",
        price: Number(item.price || 0),
        category: item.category || inferCategory(item.text, index),
        image: Array.isArray(item.media) ? item.media.find((m) => m.type === "photo")?.url : "",
      };
    });
    state.prompts = [...sourcePrompts, createCreatorDemoPrompt(sourcePrompts.length + 1)];
    totalCount.textContent = String(state.prompts.length);
    updateUserUi();
    applyFilters();
  } catch (error) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)">
        <h3 style="color:var(--text);margin-bottom:8px">数据加载失败</h3>
        <p>请检查 data/prompts-data.js 是否存在</p>
      </div>
    `;
    console.error(error);
  }
}

function updateUserUi() {
  const loginBtn = document.getElementById("login-btn");
  if (!loginBtn) return;
  if (!state.user) {
    loginBtn.textContent = "登录";
    loginBtn.className = "ghost-btn";
    return;
  }
  loginBtn.textContent = state.user.nickname;
  loginBtn.className = "ghost-btn";
}

function createCreatorDemoPrompt(rank) {
  return {
    id: "creator-demo-product-pack",
    caseNumber: "C1",
    url: "#creator",
    author: "CreatorStudio",
    title: "创作者原创：电商香水主图提示词包",
    category: "product",
    lang: "zh",
    rank,
    accessType: "paid",
    price: 19.9,
    text: "这是一条创作者原创付费提示词示例：生成高端香水电商主图，透明玻璃瓶居中，液体呈淡金色，背景为高级灰丝绒与水晶反光，柔和棚拍布光，浅景深，画面包含品牌留白区域，适合电商详情页首图。购买后展示完整提示词、参数和多版本说明。",
    viewCount: 8600,
    media: [{
      type: "photo",
      url: "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main/images/ecommerce_case151/output.jpg",
      width: 0,
      height: 0,
    }],
    sourceFile: "creator/demo",
    sourceRepo: "PromptMarket",
    image: "https://raw.githubusercontent.com/EvoLinkAI/awesome-gpt-image-2-prompts/main/images/ecommerce_case151/output.jpg",
  };
}

async function loadPrompts() {
  if (Array.isArray(window.PROMPTS_DATA) && window.PROMPTS_DATA.length) {
    return window.PROMPTS_DATA;
  }
  const response = await fetch("./data/prompts.json");
  return response.json();
}

function selectCategory(button) {
  document.querySelectorAll(".category-chip").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  state.activeCategory = button.dataset.category || "all";
  applyFilters();
}

function applyFilters() {
  const keyword = searchInput.value.trim().toLowerCase();
  const lang = languageFilter.value;
  const access = accessFilter.value;

  state.filteredPrompts = state.prompts.filter((prompt) => {
    const matchesKeyword = !keyword || [
      prompt.title, prompt.text, prompt.author, prompt.lang,
      getCategoryLabel(prompt.category),
    ].some((v) => String(v || "").toLowerCase().includes(keyword));
    const matchesLang = lang === "all" || prompt.lang === lang;
    const matchesAccess = access === "all" || prompt.accessType === access;
    const matchesCategory = state.activeCategory === "all" || prompt.category === state.activeCategory;
    return matchesKeyword && matchesLang && matchesAccess && matchesCategory;
  });

  renderPrompts();
}

function renderPrompts() {
  grid.innerHTML = "";
  if (!state.filteredPrompts.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:var(--muted)"><h3 style="color:var(--text);margin-bottom:8px">暂无内容</h3><p>换个关键词或分类试试</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  state.filteredPrompts.forEach((prompt) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const isPaid = prompt.accessType === "paid";
    const image = card.querySelector(".prompt-image");
    const placeholder = card.querySelector(".media-placeholder");
    const overlay = card.querySelector(".locked-overlay");
    const overlayBtn = card.querySelector(".overlay-btn");
    const copyBtn = card.querySelector(".copy-btn");
    const favoriteBtn = card.querySelector(".favorite-btn");
    const title = card.querySelector(".card-title");
    const text = card.querySelector(".prompt-text");
    const languageTag = card.querySelector(".language-tag");
    const accessTag = card.querySelector(".access-tag");

    languageTag.textContent = getLanguageLabel(prompt.lang);
    accessTag.textContent = isPaid ? `¥${formatMoney(prompt.price)}` : "免费";
    accessTag.classList.add(prompt.accessType);
    title.textContent = createTitle(prompt);
    text.textContent = isPaid ? createPaidPreview(prompt.text) : prompt.text;
    card.querySelector(".card-meta").textContent = `${getCategoryLabel(prompt.category)} · TOP ${prompt.rank} · 👀 ${formatNumber(prompt.viewCount)}`;
    card.querySelector(".author-row").textContent = `@${prompt.author || "unknown"}`;

    if (state.favorites.has(prompt.id)) {
      favoriteBtn.classList.add("active");
      favoriteBtn.textContent = "♥";
    }

    favoriteBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleFavorite(prompt.id, favoriteBtn); });
    title.addEventListener("click", () => openDetailModal(prompt));
    image.addEventListener("click", () => openDetailModal(prompt));

    if (prompt.image) {
      image.src = prompt.image;
      image.alt = title.textContent;
      image.loading = "lazy";
    } else {
      image.classList.add("hidden");
      placeholder.classList.remove("hidden");
    }

    if (isPaid) {
      overlay.classList.remove("hidden");
      copyBtn.textContent = "购买";
      copyBtn.classList.add("locked");
      copyBtn.addEventListener("click", () => openOrderModal(prompt));
      overlayBtn?.addEventListener("click", () => openOrderModal(prompt));
    } else {
      copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", () => copyPrompt(prompt.text));
    }

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
}

function requireLoginAndKyc(action) {
  state.pendingAction = action;
  if (!state.user) {
    openAuthModal();
    showToast("请先登录或注册");
    return false;
  }
  return true;
}

function runPendingAction() {
  const action = state.pendingAction;
  state.pendingAction = null;
  if (typeof action === "function") action();
}

function createTitle(prompt) {
  if (prompt.title) return prompt.title;
  const clean = String(prompt.text || "").replace(/\s+/g, " ").trim();
  return clean.length > 26 ? `${clean.slice(0, 26)}...` : clean || "未命名";
}

function createPaidPreview(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const preview = clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
  return `${preview} 购买后查看完整提示词。`;
}

async function copyPrompt(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板 ✓");
  } catch {
    showToast("复制失败，请手动复制");
  }
}

function toggleFavorite(id, button) {
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    button.classList.remove("active");
    button.textContent = "♡";
    showToast("已取消收藏");
  } else {
    state.favorites.add(id);
    button.classList.add("active");
    button.textContent = "♥";
    showToast("已收藏");
  }
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...state.favorites]));
}

function openCreatorModal() { creatorModal.classList.remove("hidden"); }
function closeCreatorModal() { creatorModal.classList.add("hidden"); }
function beginCreatorPublish() { if (requireLoginAndKyc(openCreatorModal)) openCreatorModal(); }
function openAuthModal() { authModal.classList.remove("hidden"); }
function closeAuthModal() { authModal.classList.add("hidden"); }
function openKycModal() { kycModal.classList.remove("hidden"); }
function closeKycModal() { kycModal.classList.add("hidden"); }

async function submitAuth(event) {
  event.preventDefault();
  const account = document.getElementById("auth-phone").value.trim();
  const password = document.getElementById("auth-password").value.trim();
  const agreed = document.getElementById("auth-agree")?.checked;

  if (!account) { showToast("请填写用户名/手机号/邮箱"); return; }
  if (!password) { showToast("请填写密码"); return; }
  if (!agreed) { showToast("请先同意用户协议"); return; }

  const btn = event.target.querySelector('button[type="submit"]');
  if (btn) btn.textContent = "登录中...";

  try {
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone: account, password }),
    });
    state.user = { id: data.user.id, nickname: data.user.username, token: data.token, phone: account };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(state.user));
    closeAuthModal();
    updateUserUi();
    if (state.pendingAction) requireLoginAndKyc(state.pendingAction);
    else showToast("登录成功 🎉");
  } catch (err) {
    showToast(err.message || "登录失败");
    if (btn) btn.textContent = "登录 / 注册";
  }
}

function submitKyc(event) {
  event.preventDefault();
  const name = document.getElementById("kyc-name").value.trim();
  const idNumber = document.getElementById("kyc-id").value.trim();
  const phone = document.getElementById("kyc-phone").value.trim();
  if (!name || !idNumber || !phone) { showToast("请完整填写认证信息"); return; }
  state.kyc = { verified: true, name, idTail: idNumber.slice(-4), phone, verifiedAt: new Date().toISOString() };
  localStorage.setItem(KYC_STORAGE_KEY, JSON.stringify(state.kyc));
  closeKycModal();
  updateUserUi();
  showToast("实名认证完成");
  runPendingAction();
}

function openDetailModal(prompt) {
  const isPaid = prompt.accessType === "paid";
  state.activePrompt = prompt;

  document.getElementById("detail-title").textContent = createTitle(prompt);
  document.getElementById("detail-category").textContent = getCategoryLabel(prompt.category);
  document.getElementById("detail-language").textContent = getLanguageLabel(prompt.lang);

  const accessTag = document.getElementById("detail-access");
  accessTag.textContent = isPaid ? `¥${formatMoney(prompt.price)}` : "免费收录";
  accessTag.className = `tag ${prompt.accessType}`;

  document.getElementById("detail-meta").textContent = `@${prompt.author || "unknown"} · Case ${prompt.caseNumber || prompt.rank}`;
  document.getElementById("detail-prompt").textContent = isPaid ? createPaidPreview(prompt.text) : prompt.text;
  document.getElementById("detail-copy").textContent = isPaid ? "购买查看完整内容" : "复制提示词";

  const gallery = document.getElementById("detail-gallery");
  gallery.innerHTML = "";
  const media = Array.isArray(prompt.media) ? prompt.media : [];
  if (media.length) {
    media.forEach((item, i) => {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `${createTitle(prompt)} ${i + 1}`;
      img.loading = "lazy";
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = '<div class="media-placeholder" style="height:300px">暂无图片</div>';
  }

  detailModal.classList.remove("hidden");
}

function closeDetailModal() { detailModal.classList.add("hidden"); }

function copyActivePrompt() {
  if (!state.activePrompt) return;
  if (state.activePrompt.accessType === "paid") { openOrderModal(state.activePrompt); return; }
  copyPrompt(state.activePrompt.text);
}

function openOrderModal(prompt) {
  if (!requireLoginAndKyc(() => openOrderModal(prompt))) return;
  state.activeOrderPrompt = prompt;
  document.getElementById("order-title").textContent = createTitle(prompt);
  document.getElementById("order-price").textContent = `¥${formatMoney(prompt.price)}`;
  orderModal.classList.remove("hidden");
}

function closeOrderModal() { orderModal.classList.add("hidden"); }

function confirmOrder() {
  if (!state.activeOrderPrompt) return;
  closeOrderModal();
  showToast("支付成功，提示词已解锁 🎉");
}

async function submitCreatorPrompt(event) {
  event.preventDefault();
  if (!requireLoginAndKyc(openCreatorModal)) return;

  const title = document.getElementById("creator-title").value.trim();
  const category = document.getElementById("creator-category").value;
  const language = document.getElementById("creator-lang")?.value || "zh";
  const price = Number(document.getElementById("creator-price").value || 0);
  const imageUrl = document.getElementById("creator-image").value.trim();
  const text = document.getElementById("creator-prompt").value.trim();

  if (!title || !price || !imageUrl || !text) { showToast("请完整填写所有必填项"); return; }

  const btn = event.target.querySelector('button[type="submit"]');
  if (btn) btn.textContent = "提交中...";

  try {
    await api('/prompts', {
      method: 'POST',
      body: JSON.stringify({ title, category, language, price, image_url: imageUrl, content: text }),
    });
    closeCreatorModal();
    event.target.reset();
    showToast("提交成功！审核通过后将公开展示 ✅");
  } catch (err) {
    showToast(err.message || "发布失败，请重试");
    if (btn) btn.textContent = "提交发布";
  }
}

function beginCreatorApply() {
  if (!state.user) {
    state.pendingAction = () => showToast("入驻成功！点击「发布提示词」开始上架");
    openAuthModal();
    return;
  }
  showToast("你已是创作者，点击「发布提示词」上架内容");
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function formatNumber(value) {
  const n = Number(value || 0);
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n);
}

function formatMoney(value) { return Number(value || 0).toFixed(2); }

function getLanguageLabel(lang) {
  return lang === "zh" ? "中文" : lang === "ja" ? "日文" : "English";
}

function getCategoryLabel(category) {
  return { ad: "广告创意", character: "角色设计", comparison: "社区案例", portrait: "人像写真", product: "电商产品", poster: "海报封面", ui: "UI 社媒" }[category] || "精选";
}

function inferCategory(text, index) {
  const v = String(text || "").toLowerCase();
  if (/人像|写真|portrait|girl|model|face/.test(v)) return "portrait";
  if (/产品|电商|product|packaging|brand/.test(v)) return "product";
  if (/海报|封面|poster|cover|movie/.test(v)) return "poster";
  if (/广告|creative|campaign|ad/.test(v)) return "ad";
  if (/角色|character|anime|cartoon/.test(v)) return "character";
  if (/ui|mockup|social|界面/.test(v)) return "ui";
  return ["comparison","portrait","product","poster","character","ad","ui"][index % 7];
}
