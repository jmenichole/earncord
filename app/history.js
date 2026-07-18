(function () {
  const esc = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function entries(payload) {
    return Array.isArray(payload) ? payload : payload.items || payload.history || payload.entries || [];
  }

  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Pending date" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function render(items) {
    const list = document.getElementById("history-list");
    if (!items.length) {
      list.innerHTML = '<div class="docs-block hub-empty"><strong>No activity yet</strong><p>No activity yet — matches show up in Discord.</p></div>';
    } else {
      list.innerHTML = items.map((item) => {
        const kind = item.kind || item.type || "activity";
        const cents = item.amountCents ?? item.cents ?? item.amount ?? null;
        const label = item.title || item.label || item.description || kind.replace(/_/g, " ");
        return `<article class="docs-block hub-list-row"><div><strong>${esc(label)}</strong><p>${esc(dateLabel(item.at || item.createdAt || item.created_at || item.timestamp))}</p></div><span class="hub-amount${kind === "withdrawal" ? " is-withdrawal" : ""}">${window.EarnCordApp.formatCents(cents)}</span></article>`;
      }).join("");
    }
    list.hidden = false;
  }

  async function init() {
    const loading = document.getElementById("history-loading");
    try {
      const res = await window.EarnCordApp.apiFetch("/api/web/history?limit=50");
      if (!res.ok) throw new Error(`Could not load activity (${res.status}).`);
      render(entries(await res.json()));
      loading.remove();
    } catch (error) {
      loading.textContent = error.message || "Could not load your activity.";
      loading.classList.add("hub-error");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
