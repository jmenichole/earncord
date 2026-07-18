(function () {
  const STORAGE_KEY = "earncord_session";

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

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
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
    const state = crypto.randomUUID();
    sessionStorage.setItem("earncord_oauth_state", state);
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
        const expected = sessionStorage.getItem("earncord_oauth_state");
        if (state && expected && state !== expected) {
          throw new Error("OAuth state mismatch. Try logging in again.");
        }
        sessionStorage.removeItem("earncord_oauth_state");
        const user = await verifyToken(token);
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
