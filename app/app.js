(function () {
  const TOKEN_KEY = "earncord_token";

  function cfg() {
    return window.EARNCORD_CONFIG || {};
  }

  function auth() {
    return window.EarnCordAuth;
  }

  function getToken() {
    try {
      const local = localStorage.getItem(TOKEN_KEY);
      if (local != null) return local;
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return sessionStorage.getItem(TOKEN_KEY);
    }
  }

  function logout() {
    auth().clearSession();
    window.location.replace("../index.html#login");
  }

  async function apiFetch(path, options = {}) {
    const base = (cfg().API_BASE || "").replace(/\/$/, "");
    if (!base) {
      throw new Error("API_BASE is not configured in config.js.");
    }

    const headers = new Headers(options.headers || {});
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const res = await fetch(`${base}${path}`, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error("Session expired. Please log in again.");
    }
    return res;
  }

  function formatCents(cents) {
    if (cents == null) return "—";
    return `$${(Number(cents) / 100).toFixed(2)}`;
  }

  const NAV = [
    { id: "home", href: "home.html", label: "home" },
    { id: "history", href: "history.html", label: "history" },
    { id: "payouts", href: "payouts.html", label: "payouts" },
    { id: "profile", href: "profile.html", label: "profile" },
    { id: "settings", href: "settings.html", label: "settings" },
  ];

  function renderAppRail(active) {
    const nav = document.getElementById("app-rail-nav");
    if (!nav) return;

    nav.innerHTML = NAV.map(({ id, href, label }) => {
      const current = id === active ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}><span class="hash">#</span><span class="label">${label}</span></a>`;
    }).join("");
  }

  async function loadMe() {
    const res = await apiFetch("/api/web/me");
    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err.error || err.message || "";
      } catch {
        detail = await res.text().catch(() => "");
      }
      throw new Error(detail || `Failed to load profile (${res.status}).`);
    }
    return res.json();
  }

  window.EarnCordApp = {
    apiFetch,
    loadMe,
    renderAppRail,
    formatCents,
    logout,
  };
})();
