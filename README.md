# EarnCord

Discord-native survey rewards: web consent + Discord bot matching, partner-verified completes, USDT withdrawals.

**Live site:** https://jmenichole.github.io/earncord/

| | |
|---|---|
| Docs | https://jmenichole.github.io/earncord/docs/ |
| Privacy | https://jmenichole.github.io/earncord/privacy.html |
| Terms | https://jmenichole.github.io/earncord/terms.html |

Contact: jmenichole007@outlook.com

EarnCord is independent and **not affiliated with Discord Inc.** The backend/bot repo is [SurveyScore](https://github.com/jmenichole/surveyscore).

---

## Architecture

```
GitHub Pages (this repo)
  → Discord OAuth via Cloudflare Worker (workers/discord-oauth)
  → SurveyScore API (web register, ledger, postbacks)
  → Discord bot (SurveyScore) — /start, surveys, score, withdraw
```

1. **Pages** — static marketing, consent gate, account UI (`index.html`, `account.html`, legal, `docs/`).
2. **OAuth Worker** — exchanges Discord auth code; signs session tokens with `SESSION_SECRET`.
3. **SurveyScore** — verifies sessions, stores users, receives survey S2S postbacks, runs the bot and payouts.

Shared secret: Worker `SESSION_SECRET` must match SurveyScore `SESSION_SECRET` (see SurveyScore README).

---

## Setup

### 1. Discord application

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → `EarnCord`
2. **OAuth2 → General** → copy **Client ID** and **Client Secret**
3. **OAuth2 → Redirects** → add (after Worker deploy):
   ```
   https://earncord-discord-oauth.<YOUR_SUBDOMAIN>.workers.dev/callback
   ```

Login only needs OAuth2 `identify`. Bot token/guild setup lives in SurveyScore.

### 2. Deploy the OAuth Worker

```bash
cd workers/discord-oauth
npm install -g wrangler
npx wrangler login
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
# SESSION_SECRET = long random string (same value on SurveyScore)
npx wrangler deploy
```

Copy the Worker URL from deploy output. Add `…/callback` as the Discord redirect if you haven’t yet.

### 3. Point the site at Worker + API

Edit `config.js` on `main`:

```js
window.EARNCORD_CONFIG = {
  DISCORD_CLIENT_ID: "YOUR_CLIENT_ID",
  AUTH_BASE: "https://earncord-discord-oauth.xxx.workers.dev",
  API_BASE: "https://YOUR-SURVEYSCORE-HOST",  // Fly.io PUBLIC_BASE_URL, no trailing slash
  SITE_ORIGIN: "https://jmenichole.github.io",
  SITE_PATH: "/earncord",
};
```

Commit and push — GitHub Pages updates in about a minute.

### 4. Test login

1. Open https://jmenichole.github.io/earncord/#login
2. Check Privacy, Terms, and 18+
3. **Continue with Discord** → land on Account with your avatar

---

## SurveyScore (bot + API)

**Recommended host: [Fly.io](https://fly.io)** — one Node process (Express + discord.js gateway) + Postgres.

Cloudflare Workers are great for the OAuth Worker in this repo, but **cannot** run the discord.js gateway bot. Keep OAuth on Workers; put SurveyScore on Fly.

Deploy API, Discord bot, DB migrations, TheoremReach/CPX callbacks, and NOWPayments from:

**https://github.com/jmenichole/surveyscore**

That README is the canonical operator guide (`fly launch`, env vars, `SESSION_SECRET`, webhooks).

---

## TheoremReach / publishers

Public website URL for the publisher app: https://jmenichole.github.io/earncord/

Reviewer-oriented overview: https://jmenichole.github.io/earncord/docs/for-publishers.html

Request Go Live after callback + bot are ready — not required for web login alone.
