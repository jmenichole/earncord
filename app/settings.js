(function () {
  const walletPattern = /^T[A-Za-z0-9]{33}$/;

  function status(message, kind = "") {
    const el = document.getElementById("wallet-status");
    el.textContent = message;
    el.className = `hub-form-status ${kind}`;
  }

  async function init() {
    const input = document.getElementById("wallet");
    try {
      const me = await window.EarnCordApp.loadMe();
      input.value = me.wallet || me.walletAddress || "";
      if (!input.value && me.walletMasked) input.placeholder = `Saved wallet: ${me.walletMasked}`;
    } catch (error) {
      status(error.message || "Could not load your saved wallet.", "is-error");
    }

    document.getElementById("wallet-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const wallet = input.value.trim();
      if (!walletPattern.test(wallet)) {
        status("Enter a valid USDT TRC20 address (starts with T and is 34 characters).", "is-error");
        return;
      }
      status("Saving…");
      try {
        const res = await window.EarnCordApp.apiFetch("/api/web/wallet", { method: "PATCH", body: JSON.stringify({ wallet }) });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || body.message || "Could not save wallet.");
        }
        status("Wallet saved.", "is-success");
      } catch (error) {
        status(error.message || "Could not save wallet.", "is-error");
      }
    });
    document.getElementById("logout").addEventListener("click", () => window.EarnCordApp.logout());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
