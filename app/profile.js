(function () {
  const esc = (value) => String(value ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function avatar(me) {
    const user = me.user || me;
    if (user.avatarUrl) return user.avatarUrl;
    if (user.avatar && user.id) return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=128`;
    let index = 0;
    try {
      index = Number(BigInt(String(user.id || 0)) >> 22n) % 6;
    } catch {
      index = 0;
    }
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  async function init() {
    const loading = document.getElementById("profile-loading");
    const content = document.getElementById("profile-content");
    try {
      const me = await window.EarnCordApp.loadMe();
      const user = me.user || me;
      const name = user.globalName || user.displayName || user.username || me.name || "EarnCord member";
      const id = user.id || me.discordId || me.id;
      const linked = me.linked ?? me.checklist?.linked;
      content.innerHTML = `<h1 class="hub-title">Profile</h1><p class="hub-lede">Your EarnCord identity and progress.</p><div class="docs-block hub-profile-head"><img class="account-avatar hub-profile-avatar" src="${esc(avatar(user))}" alt="" /><div><strong>${esc(name)}</strong><p>Discord ID · ${esc(id)}</p></div><span class="hub-badge${linked ? " is-linked" : ""}">${linked ? "Linked" : "Not linked"}</span></div><div class="docs-blocks"><div class="docs-block hub-stat-card"><strong>Score</strong><span class="hub-stat-value">${esc(me.score)}</span></div><div class="docs-block hub-stat-card"><strong>Tier</strong><span class="hub-stat-value">${esc(me.tier)}</span></div></div>`;
      loading.remove();
      content.hidden = false;
    } catch (error) {
      loading.textContent = error.message || "Could not load your profile.";
      loading.classList.add("hub-error");
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
