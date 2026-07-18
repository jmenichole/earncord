(function () {
  function app() {
    return window.EarnCordApp;
  }

  function auth() {
    return window.EarnCordAuth;
  }

  function cfg() {
    return window.EARNCORD_CONFIG || {};
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function checklistComplete(checklist) {
    if (!checklist) return false;
    return checklist.consent && checklist.registered && checklist.linked && checklist.wallet;
  }

  function renderChecklistStep(num, title, bodyHtml, done, extraHtml) {
    const mark = done ? "✓" : String(num);
    return `
      <div class="hub-checklist-step docs-block${done ? " is-done" : ""}">
        <div class="hub-checklist-head">
          <span class="hub-checklist-mark" aria-hidden="true">${mark}</span>
          <strong>${escapeHtml(title)}</strong>
        </div>
        ${bodyHtml}
        ${extraHtml || ""}
      </div>`;
  }

  function renderChecklist(me) {
    const checklist = me.checklist || {};
    const inviteUrl = (cfg().DISCORD_INVITE_URL || "").trim();
    let step3Extra =
      '<p class="hub-checklist-copy">Run <code>/start</code> in a server with the EarnCord bot.</p>';
    if (inviteUrl) {
      step3Extra += `<a class="btn btn-connect hub-checklist-btn" href="${escapeHtml(inviteUrl)}" target="_blank" rel="noopener">Join server</a>`;
    }

    const steps = [
      renderChecklistStep(
        1,
        "Consent",
        "<p>Privacy, Terms, and 18+ accepted when you signed in.</p>",
        checklist.consent,
      ),
      renderChecklistStep(
        2,
        "Web account",
        "<p>Your Discord ID is registered for the hub.</p>",
        checklist.registered,
      ),
      renderChecklistStep(
        3,
        "Discord profile",
        "<p>Link your web account with the bot.</p>",
        checklist.linked,
        step3Extra,
      ),
      renderChecklistStep(
        4,
        "Payout wallet",
        "<p>Save a USDT TRC20 address for withdrawals.</p>",
        checklist.wallet,
        checklist.wallet
          ? ""
          : '<a class="btn btn-ghost hub-checklist-btn" href="settings.html">Open settings</a>',
      ),
    ];

    const scoreLabel = me.score != null ? escapeHtml(String(me.score)) : "—";
    const tierLabel = me.tier ? escapeHtml(me.tier) : "—";

    return `
      <h1 class="hub-title">Finish setup</h1>
      <p class="hub-lede">Complete these steps to unlock your dashboard.</p>
      <div class="hub-checklist docs-blocks">${steps.join("")}</div>
      <div class="hub-preview docs-blocks">
        <div class="docs-block">
          <strong>Available balance</strong>
          <span class="hub-stat">${app().formatCents(me.balanceAvailableCents)}</span>
        </div>
        <div class="docs-block">
          <strong>Score · tier</strong>
          <span class="hub-stat">${scoreLabel} · ${tierLabel}</span>
        </div>
      </div>`;
  }

  function renderDashboard(me) {
    const scoreLabel = me.score != null ? escapeHtml(String(me.score)) : "—";
    const tierLabel = me.tier ? escapeHtml(me.tier) : "—";

    return `
      <h1 class="hub-title">Dashboard</h1>
      <p class="hub-lede">Your hub at a glance.</p>
      <div class="hub-stats docs-blocks">
        <div class="docs-block hub-stat-card">
          <strong>Available balance</strong>
          <span class="hub-stat-value">${app().formatCents(me.balanceAvailableCents)}</span>
        </div>
        <div class="docs-block hub-stat-card">
          <strong>Score · tier</strong>
          <span class="hub-stat-value">${scoreLabel} · ${tierLabel}</span>
        </div>
      </div>
      <div class="hub-actions">
        <a class="btn btn-connect" href="payouts.html">Request payout</a>
        <a class="btn btn-ghost hub-action-secondary" href="history.html">View history</a>
      </div>
      <div class="docs-block hub-discord-note">
        <strong>Surveys still come from Discord</strong>
        <p>When a survey fits, the bot sends it — check DMs or your server channel.</p>
      </div>`;
  }

  function wireTourTip() {
    const tip = document.getElementById("tour-tip");
    if (!tip) return;

    if (auth().hasTourSeen()) {
      tip.hidden = true;
      return;
    }

    tip.hidden = false;
    tip.querySelector("[data-tour-dismiss]")?.addEventListener("click", () => {
      auth().markTourSeen();
      tip.hidden = true;
    });
  }

  function showError(message) {
    const loading = document.getElementById("hub-loading");
    if (loading) {
      loading.textContent = message;
      loading.classList.add("hub-error");
      return;
    }
    const main = document.querySelector(".hub-main");
    if (main) {
      main.innerHTML = `<p class="account-status hub-error">${escapeHtml(message)}</p>`;
    }
  }

  async function init() {
    if (!auth().requireAppSession()) return;

    wireTourTip();

    const checklistEl = document.getElementById("checklist");
    const dashboardEl = document.getElementById("dashboard");
    const loading = document.getElementById("hub-loading");

    try {
      const me = await app().loadMe();
      const complete = checklistComplete(me.checklist);

      if (checklistEl) {
        checklistEl.innerHTML = renderChecklist(me);
        checklistEl.hidden = complete;
      }
      if (dashboardEl) {
        dashboardEl.innerHTML = renderDashboard(me);
        dashboardEl.hidden = !complete;
      }
      loading?.remove();
    } catch (error) {
      showError(error.message || "Could not load your hub profile.");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
