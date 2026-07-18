# EarnCord

Discord survey rewards — web login first, bot next.

**Site:** https://jmenichole.github.io/earncord/

- [Privacy Policy](https://jmenichole.github.io/earncord/privacy.html)
- [Terms of Service](https://jmenichole.github.io/earncord/terms.html)

Contact: jmenichole007@outlook.com

---

## Discord login setup (free)

GitHub Pages cannot hold a Discord client secret, so login uses a tiny **Cloudflare Worker** (free tier) for the OAuth code exchange.

### 1. Create Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** → name `EarnCord`
2. **OAuth2 → General** → copy **Client ID**
3. **OAuth2 → General** → reset/copy **Client Secret** (keep private)
4. **OAuth2 → Redirects** → add exactly:
   ```
   https://earncord-discord-oauth.<YOUR_SUBDOMAIN>.workers.dev/callback
   ```
   You’ll know the full Worker URL after step 2. You can add the redirect after deploy.

Bot setup can wait — login only needs OAuth2 `identify`.

### 2. Deploy the OAuth Worker

```bash
cd workers/discord-oauth
npm install -g wrangler
npx wrangler login
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
# SESSION_SECRET = any long random string
npx wrangler deploy
```

Copy the Worker URL from the deploy output, e.g. `https://earncord-discord-oauth.xxx.workers.dev`.

Add that URL + `/callback` as the Discord OAuth2 redirect if you haven’t yet.

### 3. Point the site at Discord + Worker

Edit `config.js` on `main`:

```js
window.EARNCORD_CONFIG = {
  DISCORD_CLIENT_ID: "YOUR_CLIENT_ID",
  AUTH_BASE: "https://earncord-discord-oauth.xxx.workers.dev",
  SITE_ORIGIN: "https://jmenichole.github.io",
  SITE_PATH: "/earncord",
};
```

Commit and push — GitHub Pages updates in ~1 minute.

### 4. Test

1. Open https://jmenichole.github.io/earncord/#login  
2. Check all three boxes (Privacy, Terms, 18+)  
3. **Log in with Discord** → approve → land on Account with your avatar  

---

## TheoremReach

Use this site URL on the publisher app. Request Go Live after callback + bot are ready — not required for web login.
