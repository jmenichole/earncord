const encoder = new TextEncoder();

function b64url(bytes) {
  let str;
  if (typeof bytes === "string") {
    str = btoa(bytes);
  } else {
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    str = btoa(bin);
  }
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlJson(obj) {
  return b64url(JSON.stringify(obj));
}

function fromB64url(s) {
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  return atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return b64url(new Uint8Array(sig));
}

async function createToken(secret, user) {
  const payload = {
    id: user.id,
    username: user.username,
    global_name: user.global_name || null,
    avatar: user.avatar || null,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const body = b64urlJson(payload);
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function verifyToken(secret, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = await hmacSign(secret, body);
  if (sig !== expected) return null;
  const json = JSON.parse(fromB64url(body));
  if (!json.exp || json.exp < Math.floor(Date.now() / 1000)) return null;
  return json;
}

async function createTurnstileTicket(secret) {
  const payload = {
    purpose: "turnstile",
    exp: Math.floor(Date.now() / 1000) + 60 * 10,
  };
  const body = b64urlJson(payload);
  const sig = await hmacSign(secret, body);
  return `${body}.${sig}`;
}

async function verifyTurnstileTicket(secret, ticket) {
  const claims = await verifyToken(secret, ticket);
  if (!claims || claims.purpose !== "turnstile") return false;
  return true;
}

async function siteverifyTurnstile(secret, response, ip) {
  const body = new URLSearchParams({
    secret,
    response,
  });
  if (ip) body.set("remoteip", ip);
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!res.ok) return false;
  const json = await res.json();
  return json.success === true;
}

function corsHeaders(origin, allowed) {
  const ok = origin && origin === allowed;
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function redirect(url) {
  return Response.redirect(url, 302);
}

function parseOAuthState(state) {
  if (!state) return { csrf: "", ticket: null };
  const dot = state.indexOf(".");
  if (dot === -1) return { csrf: state, ticket: null };
  const csrf = state.slice(0, dot);
  const encoded = state.slice(dot + 1);
  if (!encoded) return { csrf, ticket: null };
  try {
    const json = JSON.parse(fromB64url(encoded));
    return { csrf, ticket: json.ticket || null, consent: json };
  } catch {
    return { csrf, ticket: null };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowed = env.ALLOWED_ORIGIN || "https://jmenichole.github.io";
    const successUrl =
      env.SITE_SUCCESS_URL || "https://jmenichole.github.io/earncord/account.html";
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        { ok: true, service: "earncord-discord-oauth" },
        { headers: cors },
      );
    }

    if (url.pathname === "/turnstile" && request.method === "POST") {
      if (!env.TURNSTILE_SECRET || !env.SESSION_SECRET) {
        return Response.json(
          { error: "turnstile_not_configured" },
          { status: 503, headers: cors },
        );
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json(
          { error: "invalid_json" },
          { status: 400, headers: cors },
        );
      }
      const response = String(payload?.response || "");
      if (!response) {
        return Response.json(
          { error: "missing_turnstile" },
          { status: 400, headers: cors },
        );
      }
      const ip = request.headers.get("CF-Connecting-IP") || "";
      const ok = await siteverifyTurnstile(env.TURNSTILE_SECRET, response, ip);
      if (!ok) {
        return Response.json(
          { error: "turnstile_failed" },
          { status: 403, headers: cors },
        );
      }
      const ticket = await createTurnstileTicket(env.SESSION_SECRET);
      return Response.json({ ok: true, ticket }, { headers: cors });
    }

    if (url.pathname === "/callback") {
      const err = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state") || "";

      if (err) {
        const dest = new URL(successUrl);
        dest.searchParams.set("error", err);
        return redirect(dest.toString());
      }

      if (!code) {
        const dest = new URL(successUrl);
        dest.searchParams.set("error", "missing_code");
        return redirect(dest.toString());
      }

      if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.SESSION_SECRET) {
        return new Response("OAuth worker secrets not configured", { status: 500 });
      }

      const { ticket } = parseOAuthState(state);
      if (env.TURNSTILE_SECRET) {
        const ticketOk = ticket && (await verifyTurnstileTicket(env.SESSION_SECRET, ticket));
        if (!ticketOk) {
          const dest = new URL(successUrl);
          dest.searchParams.set("error", "turnstile_required");
          return redirect(dest.toString());
        }
      }

      const redirectUri = `${url.origin}/callback`;
      const body = new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });

      const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });

      if (!tokenRes.ok) {
        const dest = new URL(successUrl);
        dest.searchParams.set("error", "token_exchange_failed");
        return redirect(dest.toString());
      }

      const tokenJson = await tokenRes.json();
      const meRes = await fetch("https://discord.com/api/users/@me", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });

      if (!meRes.ok) {
        const dest = new URL(successUrl);
        dest.searchParams.set("error", "user_fetch_failed");
        return redirect(dest.toString());
      }

      const user = await meRes.json();
      const sessionToken = await createToken(env.SESSION_SECRET, user);
      const dest = new URL(successUrl);
      dest.searchParams.set("token", sessionToken);
      if (state) dest.searchParams.set("state", state);
      return redirect(dest.toString());
    }

    if (url.pathname === "/verify") {
      const token = url.searchParams.get("token") || "";
      const user = await verifyToken(env.SESSION_SECRET, token);
      if (!user) {
        return Response.json(
          { error: "invalid_token" },
          { status: 401, headers: cors },
        );
      }
      return Response.json(user, { headers: cors });
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
};
