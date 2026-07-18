(function () {
  const STORAGE_KEY = "earncord_session";
  const TOKEN_KEY = "earncord_token";
  const CONSENT_KEY = "earncord_consent";
  const OAUTH_STATE_KEY = "earncord_oauth_state";
  const TOUR_KEY = "earncord_tour_seen";

  function cfg() {
    return window.EARNCORD_CONFIG || {};
  }

  function markTourSeen() {
    localStorage.setItem(TOUR_KEY, "1");
  }

  function hasTourSeen() {
    return localStorage.getItem(TOUR_KEY) === "1";
  }

  function storageGet(key) {
    try {
      const local = localStorage.getItem(key);
      if (local != null) return local;
      return sessionStorage.getItem(key);
    } catch {
      return sessionStorage.getItem(key);
    }
  }

  function storageSet(key, value) {
    localStorage.setItem(key, value);
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  function getSession() {
    try {
      const raw = storageGet(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.id || !session.username) {
        storageRemove(STORAGE_KEY);
        return null;
      }
      if (!localStorage.getItem(STORAGE_KEY)) {
        storageSet(STORAGE_KEY, raw);
      }
      return session;
    } catch {
      storageRemove(STORAGE_KEY);
      return null;
    }
  }

  function setSession(user) {
    storageSet(STORAGE_KEY, JSON.stringify(user));
  }

  function getToken() {
    const token = storageGet(TOKEN_KEY);
    if (token && !localStorage.getItem(TOKEN_KEY)) {
      storageSet(TOKEN_KEY, token);
    }
    return token;
  }

  function setToken(token) {
    if (token) storageSet(TOKEN_KEY, token);
  }

  function clearSession() {
    storageRemove(STORAGE_KEY);
    storageRemove(TOKEN_KEY);
    storageRemove(CONSENT_KEY);
    storageRemove(OAUTH_STATE_KEY);
  }

  function requireAppSession() {
    const session = getSession();
    if (session) return session;
    const loginPath = window.location.pathname.includes("/app/")
      ? "../index.html#login"
      : "index.html#login";
    window.location.replace(loginPath);
    return null;
  }

  function storeConsentFlags() {
    const now = new Date().toISOString();
    const consent = {
      acceptedPrivacy: true,
      acceptedTerms: true,
      acceptedAge: true,
      privacy: true,
      terms: true,
      age: true,
      acceptedPrivacyAt: now,
      acceptedTermsAt: now,
      acceptedAgeAt: now,
    };
    sessionStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    return consent;
  }

  function getConsentFlags() {
    try {
      const raw = sessionStorage.getItem(CONSENT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function b64urlJson(obj) {
    const json = JSON.stringify(obj);
    const b64 = btoa(json);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  function parseOAuthState(state) {
    if (!state) return { csrf: "", consent: null };
    const dot = state.indexOf(".");
    if (dot === -1) return { csrf: state, consent: null };
    const csrf = state.slice(0, dot);
    const encoded = state.slice(dot + 1);
    if (!encoded) return { csrf, consent: null };
    try {
      const pad = encoded + "=".repeat((4 - (encoded.length % 4)) % 4);
      const json = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
      return { csrf, consent: JSON.parse(json) };
    } catch {
      return { csrf, consent: null };
    }
  }

  function avatarUrl(user) {
    if (!user?.id) return "";
    if (user.avatar) {
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    }
    const idx = Number(BigInt(user.id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }

  function buildAuthorizeUrl() {
    const { DISCORD_CLIENT_ID, AUTH_BASE } = cfg();
    if (!DISCORD_CLIENT_ID || !AUTH_BASE) {
      throw new Error(
        "Set DISCORD_CLIENT_ID and AUTH_BASE in config.js after Discord app + Worker setup.",
      );
    }
    const consent = storeConsentFlags();
    const csrf = crypto.randomUUID();
    const state = `${csrf}.${b64urlJson({
      acceptedPrivacy: consent.acceptedPrivacy,
      acceptedTerms: consent.acceptedTerms,
      acceptedAge: consent.acceptedAge,
    })}`;
    sessionStorage.setItem(OAUTH_STATE_KEY, csrf);
    const redirectUri = `${AUTH_BASE.replace(/\/$/, "")}/callback`;
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      response_type: "code",
      scope: "identify",
      redirect_uri: redirectUri,
      state,
      prompt: "consent",
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }

  async function verifyToken(token) {
    const { AUTH_BASE } = cfg();
    const url = `${AUTH_BASE.replace(/\/$/, "")}/verify?token=${encodeURIComponent(token)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Session expired. Please log in again.");
    return res.json();
  }

  async function registerWebAccount(token) {
    const { API_BASE } = cfg();
    const base = (API_BASE || "").replace(/\/$/, "");
    if (!base) {
      return { status: "skipped", message: "API not connected yet. After Fly deploy, set API_BASE in config.js to your PUBLIC_BASE_URL (no trailing slash)." };
    }
    if (!token) {
      return { status: "error", message: "Missing session token for web registration. Please log in again." };
    }
    const consent = getConsentFlags();
    if (!consent) {
      return { status: "skipped", message: "No consent on file for this browser session. Log in again after accepting Privacy, Terms, and age." };
    }
    const body = {
      acceptedPrivacy: !!(consent.acceptedPrivacy ?? consent.privacy),
      acceptedTerms: !!(consent.acceptedTerms ?? consent.terms),
      acceptedAge: !!(consent.acceptedAge ?? consent.age),
    };
    if (!body.acceptedPrivacy || !body.acceptedTerms || !body.acceptedAge) {
      return { status: "error", message: "Consent flags incomplete. Accept Privacy, Terms, and age, then log in again." };
    }

    try {
      const res = await fetch(`${base}/api/web/register`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let detail = "";
        try {
          const errJson = await res.json();
          detail = errJson.error || errJson.message || "";
        } catch {
          detail = await res.text().catch(() => "");
        }
        return {
          status: "error",
          message: detail
            ? `Web registration failed (${res.status}): ${detail}`
            : `Web registration failed (${res.status}).`,
        };
      }
      return {
        status: "success",
        message: "Registered on web — join a server and run /start to finish your profile",
      };
    } catch (e) {
      return {
        status: "error",
        message: `Web registration failed: ${e.message || String(e)}`,
      };
    }
  }

  function wireLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const session = getSession();
    if (session) {
      window.location.replace("app/home.html");
      return;
    }

    const privacy = document.getElementById("accept-privacy");
    const terms = document.getElementById("accept-terms");
    const age = document.getElementById("accept-age");
    const button = document.getElementById("discord-login");
    const error = document.getElementById("login-error");

    function sync() {
      const ok = privacy.checked && terms.checked && age.checked;
      button.disabled = !ok;
    }

    [privacy, terms, age].forEach((el) => el.addEventListener("change", sync));
    sync();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      error.hidden = true;
      if (!privacy.checked || !terms.checked || !age.checked) {
        error.textContent = "Accept Privacy, Terms, and age confirmation to continue.";
        error.hidden = false;
        return;
      }
      try {
        window.location.href = buildAuthorizeUrl();
      } catch (err) {
        error.textContent = err.message || String(err);
        error.hidden = false;
      }
    });

    const gate = document.getElementById("login-gate");
    const authed = document.getElementById("login-authed");
    if (!gate || !authed) return;

    form.hidden = false;
    gate.hidden = false;
    authed.hidden = true;
  }

  function isAccountPage() {
    return /account\.html$/i.test(window.location.pathname);
  }

  async function wireAccountPage() {
    if (!isAccountPage()) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const state = params.get("state");
    const err = params.get("error");

    try {
      if (err) {
        clearSession();
        window.location.replace(`index.html#login`);
        return;
      }

      if (token) {
        const expected = sessionStorage.getItem(OAUTH_STATE_KEY);
        const { csrf, consent: stateConsent } = parseOAuthState(state || "");
        if (state && expected && csrf !== expected) {
          throw new Error("OAuth state mismatch. Try logging in again.");
        }
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        if (stateConsent && !getConsentFlags()) {
          sessionStorage.setItem(
            CONSENT_KEY,
            JSON.stringify({
              acceptedPrivacy: !!stateConsent.acceptedPrivacy,
              acceptedTerms: !!stateConsent.acceptedTerms,
              acceptedAge: !!stateConsent.acceptedAge,
              privacy: !!stateConsent.acceptedPrivacy,
              terms: !!stateConsent.acceptedTerms,
              age: !!stateConsent.acceptedAge,
            }),
          );
        }
        const user = await verifyToken(token);
        setToken(token);
        setSession(user);
        await registerWebAccount(token);
        history.replaceState({}, "", "account.html");
      }

      if (getSession()) {
        window.location.replace("app/home.html");
      } else {
        window.location.replace("index.html#login");
      }
    } catch (e) {
      clearSession();
      window.location.replace("index.html#login");
    }
  }

  function wireRailBrand() {
    const session = getSession();
    const inApp = /\/app\//.test(window.location.pathname);
    // Relative paths differ on marketing pages vs /app/* hub pages.
    const target = session
      ? inApp
        ? "home.html"
        : "app/home.html"
      : inApp
        ? "../index.html"
        : "index.html";
    const label = session ? "EarnCord dashboard" : "EarnCord home";
    document.querySelectorAll(".rail-brand").forEach((el) => {
      el.href = target;
      el.setAttribute("aria-label", label);
    });
  }

  window.EarnCordAuth = {
    getSession,
    clearSession,
    avatarUrl,
    markTourSeen,
    hasTourSeen,
    requireAppSession,
    wireLoginForm,
    wireAccountPage,
    wireRailBrand,
  };

  if (isAccountPage()) {
    wireAccountPage();
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      wireRailBrand();
      wireLoginForm();
      wireRailBrand();
    });
  }
})();
