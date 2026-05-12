const API_BASE = 'https://aippmk.cn/api';
const PLATFORM_FEE_RATE = 0.1;
const FAVORITES_STORAGE_KEY = "gpt-image-favorites";
const USER_STORAGE_KEY = "promptmarket-user";
const KYC_STORAGE_KEY = "promptmarket-kyc";

// API 请求封装
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
document.querySelectorAll(".auth-provider").forEach((button) => {
  button.addEventListener("click", () => loginWithProvider(button.dataset.authProvider || "第三方"));
});
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
        image: Array.isArray(item.media) ? item.media.find((media) => media.type === "photo")?.url : "",
      };
    });
    state.prompts = [...sourcePrompts, createCreatorDemoPrompt(sourcePrompts.length + 1)];
    totalCount.textContent = String(state.prompts.length);
    updateUserUi();
    applyFilters();
  } catch (error) {
    grid.innerHTML = `
      <div class="prompt-card empty-state" style="grid-column: 1 / -1; padding: 24px;">
        <h3>数据加载失败</h3>
        <p class="prompt-text">请检查 data/prompts-data.js 是否存在，或使用本地静态服务器打开页面。</p>
      </div>
    `;
    console.error(error);
  }
}

function updateUserUi() {
  const loginBtn = document.getElementById("login-btn");
  if (!loginBtn) {
    return;
  }

  if (!state.user) {
    loginBtn.textContent = "登录";
    return;
  }

  loginBtn.textContent = state.kyc?.verified ? `${state.user.nickname} · 已实名` : `${state.user.nickname} · 未实名`;
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
    text: "这是一条创作者原创付费提示词示例：生成高端香水电商主图，透明玻璃瓶居中，液体呈淡金色，背景为高级灰丝绒与水晶反光，柔和棚拍布光，浅景深，画面包含品牌留白区域，适合电商详情页首图。购买后应展示完整提示词、参数、可替换变量和多版本风格说明。",
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
      prompt.title,
      prompt.text,
      prompt.author,
      prompt.lang,
      getCategoryLabel(prompt.category),
    ].some((value) => String(value || "").toLowerCase().includes(keyword));
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
    grid.innerHTML = `
      <div class="prompt-card empty-state" style="grid-column: 1 / -1; padding: 24px;">
        <h3>没有找到匹配结果</h3>
        <p class="prompt-text">换个关键词试试，或者切回全部分类。</p>
      </div>
    `;
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
    accessTag.textContent = isPaid ? `¥${formatMoney(prompt.price)}` : "免费收录";
    accessTag.classList.add(prompt.accessType);
    title.textContent = createTitle(prompt);
    text.textContent = isPaid ? createPaidPreview(prompt.text) : prompt.text;
    card.querySelector(".card-meta").textContent = `${getCategoryLabel(prompt.category)} · TOP ${prompt.rank} · 👀 ${formatNumber(prompt.viewCount)}`;
    card.querySelector(".author-row").textContent = `@${prompt.author || "unknown"}`;

    if (state.favorites.has(prompt.id)) {
      favoriteBtn.classList.add("active");
      favoriteBtn.textContent = "♥";
    }

    favoriteBtn.addEventListener("click", () => toggleFavorite(prompt.id, favoriteBtn));
    title.addEventListener("click", () => openDetailModal(prompt));
    image.addEventListener("click", () => openDetailModal(prompt));
    text.addEventListener("click", () => openDetailModal(prompt));

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
      overlayBtn.addEventListener("click", () => openOrderModal(prompt));
    } else {
      overlay.classList.add("hidden");
      copyBtn.textContent = "复制";
      copyBtn.classList.remove("locked");
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

  // 实名认证暂未上线，跳过 KYC 检查
  return true;
}

function runPendingAction() {
  const action = state.pendingAction;
  state.pendingAction = null;

  if (typeof action === "function") {
    action();
  }
}

function createTitle(prompt) {
  if (prompt.title) {
    return prompt.title;
  }

  const clean = String(prompt.text || "").replace(/\s+/g, " ").trim();
  return clean.length > 26 ? `${clean.slice(0, 26)}...` : clean || "未命名提示词";
}

function createPaidPreview(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const preview = clean.length > 48 ? `${clean.slice(0, 48)}...` : clean;
  return `${preview} 购买后查看并复制完整提示词。`;
}

async function copyPrompt(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("提示词已复制");
  } catch (error) {
    showToast("复制失败，请手动复制");
    console.error(error);
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

function openCreatorModal() {
  creatorModal.classList.remove("hidden");
  creatorModal.setAttribute("aria-hidden", "false");
}

function closeCreatorModal() {
  creatorModal.classList.add("hidden");
  creatorModal.setAttribute("aria-hidden", "true");
}

function beginCreatorPublish() {
  if (!requireLoginAndKyc(openCreatorModal)) {
    return;
  }

  openCreatorModal();
}

function openAuthModal() {
  authModal.classList.remove("hidden");
  authModal.setAttribute("aria-hidden", "false");
}

function closeAuthModal() {
  authModal.classList.add("hidden");
  authModal.setAttribute("aria-hidden", "true");
}

function openKycModal() {
  kycModal.classList.remove("hidden");
  kycModal.setAttribute("aria-hidden", "false");
}

function closeKycModal() {
  kycModal.classList.add("hidden");
  kycModal.setAttribute("aria-hidden", "true");
}

async function submitAuth(event) {
  event.preventDefault();
  const phone = document.getElementById("auth-phone").value.trim();
  if (!phone) {
    showToast("请填写手机号或邮箱");
    return;
  }
  try {
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) btn.textContent = '登录中...';
    const data = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
    state.user = {
      id: data.user.id,
      nickname: data.user.username,
      token: data.token,
      phone,
    };
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(state.user));
    closeAuthModal();
    updateUserUi();
    if (state.pendingAction) {
      requireLoginAndKyc(state.pendingAction);
    } else {
      showToast("登录成功 🎉");
    }
  } catch (err) {
    showToast(err.message || "登录失败，请重试");
  }
}

function loginWithProvider(provider) {
  state.user = {
    id: `user-${Date.now()}`,
    nickname: provider,
    provider,
    phone: "",
    email: "",
  };
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(state.user));
  closeAuthModal();
  updateUserUi();

  if (state.pendingAction) {
    requireLoginAndKyc(state.pendingAction);
  } else {
    showToast(`${provider}登录成功`);
  }
}

function submitKyc(event) {
  event.preventDefault();
  const name = document.getElementById("kyc-name").value.trim();
  const idNumber = document.getElementById("kyc-id").value.trim();
  const phone = document.getElementById("kyc-phone").value.trim();

  if (!name || !idNumber || !phone) {
    showToast("请完整填写实名信息");
    return;
  }

  state.kyc = {
    verified: true,
    name,
    idTail: idNumber.slice(-4),
    phone,
    verifiedAt: new Date().toISOString(),
  };
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

  document.getElementById("detail-meta").textContent = `@${prompt.author || "unknown"} · Case ${prompt.caseNumber || prompt.rank} · ${prompt.sourceFile || "source"}`;
  document.getElementById("detail-prompt").textContent = isPaid ? createPaidPreview(prompt.text) : prompt.text;
  document.getElementById("detail-source").href = prompt.url || "#";
  document.getElementById("detail-copy").textContent = isPaid ? "购买提示词" : "复制提示词";

  const gallery = document.getElementById("detail-gallery");
  gallery.innerHTML = "";
  const media = Array.isArray(prompt.media) ? prompt.media : [];

  if (media.length) {
    media.forEach((item, index) => {
      const img = document.createElement("img");
      img.src = item.url;
      img.alt = `${createTitle(prompt)} ${index + 1}`;
      img.loading = "lazy";
      gallery.appendChild(img);
    });
  } else {
    gallery.innerHTML = '<div class="media-placeholder">No Image</div>';
  }

  detailModal.classList.remove("hidden");
  detailModal.setAttribute("aria-hidden", "false");
}

function closeDetailModal() {
  detailModal.classList.add("hidden");
  detailModal.setAttribute("aria-hidden", "true");
}

function copyActivePrompt() {
  if (!state.activePrompt) {
    return;
  }

  if (state.activePrompt.accessType === "paid") {
    openOrderModal(state.activePrompt);
    return;
  }

  copyPrompt(state.activePrompt.text);
}

function openOrderModal(prompt) {
  if (!requireLoginAndKyc(() => openOrderModal(prompt))) {
    return;
  }

  state.activeOrderPrompt = prompt;
  const price = Number(prompt.price || 0);

  document.getElementById("order-title").textContent = createTitle(prompt);
  document.getElementById("order-price").textContent = `¥${formatMoney(price)}`;
  orderModal.classList.remove("hidden");
  orderModal.setAttribute("aria-hidden", "false");
}

function closeOrderModal() {
  orderModal.classList.add("hidden");
  orderModal.setAttribute("aria-hidden", "true");
}

function confirmOrder() {
  if (!state.activeOrderPrompt) {
    return;
  }

  closeOrderModal();
  showToast("模拟支付成功，已解锁创作者提示词");
}

async function submitCreatorPrompt(event) {
  event.preventDefault();

  if (!requireLoginAndKyc(openCreatorModal)) {
    return;
  }

  const title = document.getElementById("creator-title").value.trim();
  const category = document.getElementById("creator-category").value;
  const language = document.getElementById("creator-lang")?.value || "zh";
  const price = Number(document.getElementById("creator-price").value || 0);
  const imageUrl = document.getElementById("creator-image").value.trim();
  const text = document.getElementById("creator-prompt").value.trim();

  if (!title || !price || !imageUrl || !text) {
    showToast("请完整填写发布信息");
    return;
  }

  try {
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) btn.textContent = '提交中...';

    await api('/prompts', {
      method: 'POST',
      body: JSON.stringify({
        title,
        category,
        language,
        price,
        image_url: imageUrl,
        content: text,
      }),
    });

    closeCreatorModal();
    event.target.reset();
    showToast("提交成功！审核通过后将公开展示 ✅");
  } catch (err) {
    showToast(err.message || "发布失败，请重试");
    const btn = event.target.querySelector('button[type="submit"]');
    if (btn) btn.textContent = '✦ 提交发布';
  }
}

function confirmCreatorApply() {
  closeCreatorModal();
  showToast("已提交创作者入驻申请");
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2200);
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (number >= 10000) {
    return `${(number / 10000).toFixed(1)}w`;
  }
  return String(number);
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function getLanguageLabel(lang) {
  if (lang === "zh") {
    return "中文";
  }

  if (lang === "ja") {
    return "日文";
  }

  return "English";
}

function getCategoryLabel(category) {
  const labels = {
    ad: "广告创意",
    character: "角色设计",
    comparison: "社区案例",
    portrait: "人像写真",
    product: "电商产品",
    poster: "海报封面",
    ui: "UI 社媒",
  };

  return labels[category] || "精选";
}

function beginCreatorApply() {
  if (!state.user) {
    state.pendingAction = () => {
      showToast("🎉 入驻成功！现在可以发布你的提示词了");
    };
    openAuthModal();
    return;
  }
  showToast("🎉 你已是创作者，点击「发布提示词」上架内容");
}

function inferCategory(text, index) {
  const value = String(text || "").toLowerCase();

  if (/人像|写真|头像|portrait|girl|boy|model|face/.test(value)) {
    return "portrait";
  }

  if (/产品|电商|商品|product|packaging|brand/.test(value)) {
    return "product";
  }

  if (/海报|封面|poster|cover|movie|film/.test(value)) {
    return "poster";
  }

  if (/广告|creative|campaign|ad/.test(value)) {
    return "ad";
  }

  if (/角色|character|anime|cartoon|3d/.test(value)) {
    return "character";
  }

  if (/ui|mockup|social|界面/.test(value)) {
    return "ui";
  }

  const fallback = ["comparison", "portrait", "product", "poster", "character", "ad", "ui"];
  return fallback[index % fallback.length];
}
