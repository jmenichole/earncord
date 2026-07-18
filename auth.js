(function () {
  const STORAGE_KEY = "earncord_session";
  const TOKEN_KEY = "earncord_token";
  const CONSENT_KEY = "earncord_consent";
  const OAUTH_STATE_KEY = "earncord_oauth_state";

  function cfg() {
    return window.EARNCORD_CONFIG || {};
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.id || !session.username) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return session;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function setSession(user) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(CONSENT_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
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
    // CSRF UUID + consent payload so a future Worker can register server-side
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
      return { status: "skipped", message: "Set API_BASE in config.js to your Railway PUBLIC_BASE_URL to finish web registration." };
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

  function showRegisterStatus(result) {
    const el = document.getElementById("register-status");
    if (!el || !result) return;
    el.hidden = false;
    el.textContent = result.message || "";
    el.classList.remove("is-success", "is-error", "is-skipped");
    if (result.status === "success") el.classList.add("is-success");
    else if (result.status === "error") el.classList.add("is-error");
    else el.classList.add("is-skipped");
  }

  function wireLoginForm() {
    const form = document.getElementById("login-form");
    if (!form) return;

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

    const session = getSession();
    const gate = document.getElementById("login-gate");
    const authed = document.getElementById("login-authed");
    if (!gate || !authed) return;

    if (session) {
      form.hidden = true;
      gate.hidden = true;
      authed.hidden = false;
      const name = document.getElementById("authed-name");
      const img = document.getElementById("authed-avatar");
      if (name) name.textContent = session.global_name || session.username;
      if (img) {
        img.src = avatarUrl(session);
        img.alt = session.username || "Avatar";
      }
      wireRailBrand();
    } else {
      form.hidden = false;
      gate.hidden = false;
      authed.hidden = true;
    }
  }

  async function wireAccountPage() {
    const status = document.getElementById("account-status");
    const card = document.getElementById("account-card");
    if (!status || !card) return;

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const state = params.get("state");
    const err = params.get("error");

    if (err) {
      status.textContent = `Login failed: ${err}`;
      return;
    }

    try {
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
        history.replaceState({}, "", "account.html");
      }

      const session = getSession();
      if (!session) {
        status.innerHTML = `Not signed in. <a href="index.html#login">Log in with Discord</a>.`;
        return;
      }

      status.hidden = true;
      card.hidden = false;
      document.getElementById("account-name").textContent =
        session.global_name || session.username;
      document.getElementById("account-user").textContent = `@${session.username}`;
      document.getElementById("account-id").textContent = session.id;
      const img = document.getElementById("account-avatar");
      img.src = avatarUrl(session);
      img.alt = session.username;

      wireRailBrand();

      const sessionToken = getToken();
      const registerResult = await registerWebAccount(sessionToken);
      showRegisterStatus(registerResult);

      document.getElementById("logout-btn")?.addEventListener("click", () => {
        clearSession();
        window.location.href = "index.html";
      });
    } catch (e) {
      clearSession();
      status.textContent = e.message || String(e);
    }
  }

  function wireRailBrand() {
    const session = getSession();
    const target = session ? "account.html" : "index.html";
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
    wireLoginForm,
    wireAccountPage,
    wireRailBrand,
  };

  document.addEventListener("DOMContentLoaded", async () => {
    wireRailBrand();
    wireLoginForm();
    await wireAccountPage();
    wireRailBrand();
  });
})();
