// Fill DISCORD_CLIENT_ID after creating the Discord app.
// Fill AUTH_BASE after deploying workers/discord-oauth (no trailing slash).
window.EARNCORD_CONFIG = {
  DISCORD_CLIENT_ID: "1527941049132122192",
  AUTH_BASE: "", // set after: npx wrangler deploy in workers/discord-oauth
  SITE_ORIGIN: "https://jmenichole.github.io",
  SITE_PATH: "/earncord",
};
