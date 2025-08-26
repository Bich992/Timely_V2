// ===== API helper =====
async function api(url, { method = "GET", body } = {}) {
  const opt = { method, headers: {} };
  if (body) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const res = await fetch(url, opt);
  let data = null; try { data = await res.json(); } catch(e) {}
  return data;
}

// ===== Auth / Util =====
async function getMe(){
  const u = localStorage.getItem("timely_username");
  if (!u) return null;
  try {
    const me = await api(`/api/users/${encodeURIComponent(u)}`);
    if (me && me.theme) applyTheme(me.theme);
    return me;
  } catch(e){ return null; }
}
function requireAuth() {
  const u = localStorage.getItem("timely_username");
  if (!u) window.location.href = "/";
  return u;
}
function getParam(name) {
  const u = new URL(window.location.href);
  return u.searchParams.get(name);
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}
function initThemeToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const saved = localStorage.getItem("timely_theme") || "light";
  document.documentElement.dataset.theme = saved;
  btn.addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || "light";
    const next = cur === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("timely_theme", next);
  });
}

// ===== Toasts =====
function applyTheme(theme){
  const cls = theme === 'ocean' ? 'theme-ocean' : (theme === 'neon' ? 'theme-neon' : '');
  document.documentElement.classList.remove('theme-ocean','theme-neon');
  if (cls) document.documentElement.classList.add(cls);
}
function mountToastRoot() {
  if (!document.getElementById("toast-root")) {
    const r = document.createElement("div"); r.id = "toast-root";
    r.setAttribute("aria-live","polite"); r.setAttribute("aria-atomic","true");
    document.body.appendChild(r);
  }
}
function showToast(type = "info", message = "") {
  mountToastRoot();
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="dot"></span><span>${escapeHtml(message)}</span>`;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s cubic-bezier(.2,.8,.2,1), transform .2s cubic-bezier(.2,.8,.2,1)";
    el.style.opacity = "0"; el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 220);
  }, 2200);
}

// ===== Image Modal =====
let __imgModal, __imgEl, __scale = 1;
function mountImageModal() {
  if (document.getElementById("timely-img-modal")) return;
  const wrap = document.createElement("div");
  wrap.className = "img-modal"; wrap.id = "timely-img-modal";
  wrap.innerHTML = `
    <div class="img-modal__content">
      <button class="img-modal__close" aria-label="Chiudi">✕</button>
      <img class="img-modal__img" alt="immagine ingrandita"/>
      <div class="img-modal__controls">
        <button class="img-modal__btn" data-zoom="in">Zoom +</button>
        <button class="img-modal__btn" data-zoom="out">Zoom −</button>
        <button class="img-modal__btn" data-zoom="fit">Adatta</button>
        <button class="img-modal__btn" data-zoom="1">1:1</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  __imgModal = wrap; __imgEl = wrap.querySelector(".img-modal__img");

  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.classList.contains("img-modal__close")) closeImageModal();
  });
  wrap.querySelectorAll("[data-zoom]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-zoom");
      if (mode === "in") __scale = Math.min(4, __scale + 0.25);
      else if (mode === "out") __scale = Math.max(0.5, __scale - 0.25);
      else __scale = 1;
      __imgEl.style.transform = `scale(${__scale})`;
    });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeImageModal(); });
}
function openImageModal(src) {
  mountImageModal(); __scale = 1; __imgEl.src = src; __imgEl.style.transform = `scale(1)`;
  __imgModal.classList.add("open");
}
function closeImageModal() { if (__imgModal) __imgModal.classList.remove("open"); }
function bindClickableImages(root = document) {
  root.querySelectorAll(".post-image.clickable").forEach(img => {
    img.addEventListener("click", () => openImageModal(img.getAttribute("src")));
  });
}
