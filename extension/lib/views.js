/*
 * Markup shared by the popup and the on-page panel, so both always look and read the same.
 * Buttons carry data-act / data-arg; each screen wires them to its own handlers.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.view = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n) => ACF.icon(n);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  const MODES = {
    quick: { name: "Quick search", running: "Quick search" },
    full: { name: "Test every code", running: "Testing every code" },
    hunt: { name: "Wait for sold-out codes", running: "Waiting for sold-out codes" }
  };

  // The three ways to search, as a list of choices
  function modes(available, again) {
    const n = available || 0;
    const row = (mode, ic, cls, title, desc) => `
      <button class="mode ${cls}" data-act="start" data-arg="${mode}" ${n ? "" : "disabled"}>
        <span class="mode-ic">${icon(ic)}</span>
        <span><span class="mode-t">${title}</span><span class="mode-d">${desc}</span></span>
        <span class="chev">${icon("chevron")}</span>
      </button>`;
    return (again ? `<p class="modes-title">Search again</p>` : "") + row("quick", "bolt", "primary", "Quick search", "Stops at the first code that works, biggest discount first.") +
      row("full", "list", "", "Test every code", `Tries ${n === 1 ? "the code" : `all ${n} codes`} and keeps the lowest total.`) +
      row("hunt", "clock", "wait", "Wait for sold-out codes", "Retries codes that ran out, in rounds, until they apply.");
  }

  // Progress block contents for a running or paused search
  function progress(st) {
    const hunt = st.mode === "hunt";
    // Works with the engine's own state (on the page) and with the popup's status summary
    const total = st.total ?? (st.queue ? st.queue.length : 0);
    const done = st.done ?? (st.results ? st.results.length : 0);
    return {
      wait: hunt,
      title: (MODES[st.mode] || MODES.quick).running,
      count: hunt ? (st.round ? `Round ${st.round}` : "") : total ? `${Math.min(done + (st.current ? 1 : 0), total)} of ${total}` : "",
      pct: hunt ? null : total ? Math.round((done / total) * 100) : 0,
      message: st.phase === "paused" && !/security check/i.test(st.message || "") ? "Paused" : st.message || ""
    };
  }

  // The winning code, shown as a ticket stub
  function ticket(st, currency) {
    const b = st.best;
    if (!b) return "";
    const saved = st.baseline != null && b.total != null ? st.baseline - b.total : null;
    const isApplied = st.applied === b.code;
    const save = saved != null && saved > 0.009
      ? `<strong>−${esc(ACF.money(saved, currency))}</strong><span>saved</span>`
      : b.value ? `<strong>${esc(ACF.num(b.value))}</strong><span>off</span>`
        : `<strong>${esc(ACF.money(b.total, currency))}</strong><span>total</span>`;
    const sub = b.total != null ? `New total ${esc(ACF.money(b.total, currency))}` : isApplied ? "Applied to your order" : "Best code found";
    return `
      <div class="ticket" role="group" aria-label="Best code">
        <div class="ticket-main"><span class="ticket-code">${esc(b.code)}</span><span class="ticket-sub">${sub}</span></div>
        <div class="ticket-save">${save}</div>
      </div>` +
      (isApplied
        ? `<div class="ticket-actions"><span class="applied">${icon("check")}Applied. Check the total, then place your order.</span>
             <button class="btn btn-small" data-act="copy" data-arg="${esc(b.code)}">${icon("copy")}Copy</button></div>`
        : `<div class="ticket-actions"><button class="btn" data-act="copy" data-arg="${esc(b.code)}">${icon("copy")}Copy code</button>
             <button class="btn btn-primary" data-act="applyBest">Apply ${esc(b.code)}</button></div>`);
  }

  // Sold-out codes that are bigger than what was found: offer to wait for them
  function offer(list) {
    if (!list || !list.length) return "";
    const top = list.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    const what = list.length === 1
      ? `<b>${esc(top.code)}</b>${top.value ? ` (${esc(ACF.num(top.value))} off)` : ""} is sold out.`
      : `${plural(list.length, "code is", "codes are")} sold out, up to <b>${esc(top.value ? ACF.num(top.value) + " off" : top.code)}</b>.`;
    return `<div class="offer"><span>${what} Limits are topped up from time to time.</span>
      <button class="btn btn-small" data-act="huntExhausted">${icon("clock")}Wait and retry</button></div>`;
  }

  // Message after a finished search (when no ticket explains it)
  function outcome(st) {
    if (!st.message) return "";
    if (st.phase === "error") return `<div class="outcome bad">${icon("alert")}<span>${esc(st.message)}</span></div>`;
    if (st.best && /^Best code|applied/i.test(st.message)) return "";
    return `<div class="outcome"><span>${esc(st.message)}</span></div>`;
  }

  function chip(status) {
    if (!status) return `<span class="chip none" title="Not tried yet">—</span>`;
    const tone = (ACF.STATUS_TONE || {})[status] || "neutral";
    return `<span class="chip ${tone}">${esc((ACF.STATUS_LABELS || {})[status] || status)}</span>`;
  }

  // Results of the current search: working codes first
  function results(rows, best, currency) {
    if (!rows || !rows.length) return "";
    const rank = (r) => (r.status === "ok" ? 0 : r.status === "used_up" ? 1 : 2);
    const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) =>
      rank(a) - rank(b) || (a.total ?? Infinity) - (b.total ?? Infinity) || b.i - a.i);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>Code</th><th class="num">Off</th><th>Result</th><th class="num">Total</th></tr></thead>
      <tbody>${sorted.map((r) => `<tr>
        <td><code>${esc(r.code)}</code></td>
        <td class="num">${esc(ACF.num(r.value))}</td>
        <td>${chip(r.status)}${r.tries > 1 ? ` <small class="tries">×${r.tries}</small>` : ""}</td>
        <td class="num">${r.status === "ok" && r.total != null ? esc(ACF.money(r.total, currency)) : ""}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- store settings form
  const countryName = (id) => (ACF.STORE && ACF.STORE.countries[id]) || id || "Unknown";

  // Short summary for buttons: "Czechia, EUR"
  function storeSummary(st) {
    return st && st.region ? `${countryName(st.region)}${st.currency ? ", " + st.currency : ""}` : "Set country";
  }

  /*
   * Quick switch: pick a country, currency and language from the user's own lists.
   * favs: { countries, currencies, languages }; counts: { PL: 14, ... } codes per country.
   * The current value is always offered, even if it isn't in the list.
   */
  function storeForm(cur, favs, counts = {}, note = "") {
    const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);
    const group = (name, ic, title, items, value, label) => `
      <fieldset class="qs-group">
        <legend>${icon(ic)}${title}</legend>
        <div class="qs-chips" role="radiogroup" aria-label="${title}">
          ${items.length ? items.map((id) => `<button type="button" class="qs-chip" role="radio" data-name="${name}" data-value="${esc(id)}" aria-checked="${id === value}">${label(id)}</button>`).join("")
            : `<span class="caption">No ${title.toLowerCase()} in your list yet.</span>`}
        </div>
      </fieldset>`;
    const countryLabel = (id) => `<span>${esc(countryName(id))}</span>${counts[id] != null ? `<small>${counts[id]}</small>` : ""}`;
    const currencyLabel = (id) => { const sym = ACF.currencySymbol(id); return `${sym ? `<small class="sym">${esc(sym)}</small>` : ""}<span>${esc(id)}</span>`; };
    const languageLabel = (id) => { const L = ACF.STORE.languages[id]; return `<span>${esc(L ? L.native : id)}</span>`; };
    return `
      <form class="store" novalidate>
        ${group("region", "truck", "Ship to", withCurrent(favs.countries, cur.region), cur.region, countryLabel)}
        ${group("currency", "coins", "Currency", withCurrent(favs.currencies, cur.currency), cur.currency, currencyLabel)}
        ${group("language", "globe", "Language", withCurrent(favs.languages, cur.language), cur.language, languageLabel)}
        ${note ? `<p class="caption">${esc(note)}</p>` : ""}
        <p class="caption err store-error" hidden></p>
        <div class="qs-foot">
          <button type="button" class="link" data-store="edit">Edit lists</button>
          <span class="btn-row">
            <button type="button" class="btn" data-store="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary" data-store="apply" disabled>Apply and reload</button>
          </span>
        </div>
      </form>`;
  }

  // Wires a rendered storeForm. Apply is enabled only once something differs from the current settings.
  function bindStoreForm(root, { current, onApply, onCancel, onEdit }) {
    const form = root.querySelector("form.store");
    if (!form) return;
    const value = { region: current.region, currency: current.currency, language: current.language };
    const apply = form.querySelector('[data-store="apply"]');
    const refresh = () => {
      form.querySelectorAll(".qs-chip").forEach((b) => b.setAttribute("aria-checked", String(value[b.dataset.name] === b.dataset.value)));
      apply.disabled = !value.region || !value.currency || !value.language ||
        (value.region === current.region && value.currency === current.currency && value.language === current.language);
    };
    form.addEventListener("click", (e) => {
      const chip = e.target.closest(".qs-chip");
      if (!chip) return;
      value[chip.dataset.name] = chip.dataset.value;
      refresh();
    });
    form.querySelector('[data-store="cancel"]').addEventListener("click", () => onCancel());
    form.querySelector('[data-store="edit"]').addEventListener("click", () => onEdit());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (apply.disabled) return;
      const err = form.querySelector(".store-error");
      apply.disabled = true;
      apply.textContent = "Applying…";
      err.hidden = true;
      const res = await onApply({ ...value });
      if (!res || !res.ok) {
        apply.disabled = false;
        apply.textContent = "Apply and reload";
        err.hidden = false;
        err.textContent = `Couldn’t change the settings${res && res.error ? ": " + res.error : ""}.`;
      }
    });
    refresh();
  }

  return { esc, storeForm, bindStoreForm, storeSummary, countryName, modes, progress, ticket, offer, outcome, chip, results, MODES, plural };
})();
