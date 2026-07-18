(function () {
  const messages = {
    NOT_LINKED: "Link your Discord profile before requesting a payout.",
    NO_WALLET: "Add a USDT TRC20 wallet in Settings before requesting a payout.",
    BELOW_MIN: "That amount is below the minimum withdrawal amount.",
    DAILY_CAP: "You have reached today’s withdrawal limit. Please try again tomorrow.",
    INSUFFICIENT_BALANCE: "That amount is more than your available balance.",
    INVALID_AMOUNT: "Enter a valid withdrawal amount.",
  };
  const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  let me;

  function cents(value) {
    return Math.round(Number(value) * 100);
  }

  function setStatus(message, kind = "") {
    const el = document.getElementById("withdraw-status");
    el.textContent = message;
    el.className = `hub-form-status ${kind}`;
  }

  function limit(me, names) {
    return names.map((name) => me[name]).find((value) => value != null);
  }

  function renderWithdrawals(payload) {
    const items = (Array.isArray(payload) ? payload : payload.items || payload.history || payload.entries || []).filter((entry) => entry.kind === "withdrawal");
    const el = document.getElementById("withdrawals");
    el.innerHTML = items.length ? items.map((item) => `<article class="docs-block hub-list-row"><div><strong>${esc(item.status || "Withdrawal")}</strong><p>${esc(new Date(item.at || item.createdAt || item.created_at).toLocaleDateString())}</p></div><span class="hub-amount is-withdrawal">${window.EarnCordApp.formatCents(item.amountCents ?? item.cents ?? item.amount)}</span></article>`).join("") : '<div class="docs-block hub-empty"><p>No withdrawals yet.</p></div>';
  }

  async function init() {
    const loading = document.getElementById("payout-loading");
    try {
      me = await window.EarnCordApp.loadMe();
      const available = Number(me.balanceAvailableCents || 0);
      const minimum = limit(me, ["minWithdrawCents", "withdrawalMinCents", "minimumWithdrawalCents", "minWithdrawalCents"]);
      const daily = limit(me, ["dailyCapCents", "dailyWithdrawalLimitCents", "dailyLimitCents", "withdrawalDailyCapCents"]);
      const withdrawn = me.dailyWithdrawnCents;
      document.getElementById("payout-stats").innerHTML = `<div class="docs-block hub-stat-card"><strong>Available balance</strong><span class="hub-stat-value">${window.EarnCordApp.formatCents(available)}</span></div>${minimum != null ? `<div class="docs-block"><strong>Minimum withdrawal</strong><span>${window.EarnCordApp.formatCents(minimum)}</span></div>` : ""}${daily != null ? `<div class="docs-block"><strong>Daily limit</strong><span>${window.EarnCordApp.formatCents(daily)}${withdrawn != null ? ` · ${window.EarnCordApp.formatCents(withdrawn)} used` : ""}</span></div>` : ""}`;
      const input = document.getElementById("withdraw-amount");
      if (minimum == null || available >= minimum) input.value = (available / 100).toFixed(2);
      const historyRes = await window.EarnCordApp.apiFetch("/api/web/history?limit=50");
      if (historyRes.ok) renderWithdrawals(await historyRes.json());
      else renderWithdrawals([]);
      loading?.remove();
      document.getElementById("payout-content").hidden = false;
    } catch (error) {
      if (loading) {
        loading.textContent = error.message || "Could not load payout details.";
        loading.classList.add("hub-error");
      } else {
        setStatus(error.message || "Could not refresh payout details.", "is-error");
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("withdraw-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const amountCents = cents(document.getElementById("withdraw-amount").value);
      if (!Number.isSafeInteger(amountCents) || amountCents < 1) return setStatus(messages.INVALID_AMOUNT, "is-error");
      if (!window.confirm(`Withdraw ${window.EarnCordApp.formatCents(amountCents)} to your saved USDT TRC20 wallet?`)) return;
      setStatus("Requesting withdrawal…");
      try {
        const res = await window.EarnCordApp.apiFetch("/api/web/withdraw", { method: "POST", body: JSON.stringify({ amountCents }) });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(messages[body.error || body.code] || body.message || "Could not request withdrawal.");
        }
        setStatus("Withdrawal requested.", "is-success");
        await init();
      } catch (error) {
        setStatus(error.message || "Could not request withdrawal.", "is-error");
      }
    });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
