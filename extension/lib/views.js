/*
 * Markup shared by the popup and the on-page panel, so both always look and read the same.
 * Buttons carry data-act / data-arg; each screen wires them to its own handlers.
 * All texts come from lib/i18n.js.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.view = (() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const icon = (n) => ACF.icon(n);
  const t = (k, v) => ACF.t(k, v);

  // The three ways to search, as a list of choices (testing every code first)
  function modes(available, again) {
    const n = available || 0;
    const row = (mode, ic, cls, desc) => `
      <button class="mode ${cls}" data-act="start" data-arg="${mode}" ${n ? "" : "disabled"}>
        <span class="mode-ic">${icon(ic)}</span>
        <span><span class="mode-t">${esc(t(`mode.${mode}.name`))}</span><span class="mode-d">${esc(desc)}</span></span>
        <span class="chev">${icon("chevron")}</span>
      </button>`;
    return (again ? `<p class="modes-title">${esc(t("mode.again"))}</p>` : "") +
      row("full", "list", "primary", t("mode.full.desc", { n })) +
      row("quick", "bolt", "", t("mode.quick.desc")) +
      row("hunt", "clock", "wait", t("mode.hunt.desc"));
  }

  // Progress block contents for a running or paused search
  function progress(st) {
    const hunt = st.mode === "hunt";
    // Works with the engine's own state (on the page) and with the popup's status summary
    const total = st.total ?? (st.queue ? st.queue.length : 0);
    const done = st.done ?? (st.results ? st.results.length : 0);
    return {
      wait: hunt,
      title: t(`mode.${["quick", "full", "hunt"].includes(st.mode) ? st.mode : "quick"}.run`),
      count: hunt ? (st.round ? t("run.round", { n: st.round }) : "") : total ? t("run.of", { a: Math.min(done + (st.current ? 1 : 0), total), b: total }) : "",
      pct: hunt ? null : total ? Math.round((done / total) * 100) : 0,
      message: st.phase === "paused" && !st.captcha ? t("msg.paused") : st.message || ""
    };
  }

  // The winning code, shown as a ticket stub
  function ticket(st, currency) {
    const b = st.best;
    if (!b) return "";
    const isApplied = st.applied === b.code;
    // Prefer AliExpress's own "Saved" figure; fall back to the difference from the starting total
    const saved = isApplied && st.savedOnPage > 0.009 ? st.savedOnPage
      : st.baseline != null && b.total != null ? st.baseline - b.total : null;
    const save = saved != null && saved > 0.009
      ? `<strong>−${esc(ACF.money(saved, currency))}</strong><span>${esc(t("ticket.saved"))}</span>`
      : b.value ? `<strong>${esc(ACF.num(b.value))}</strong><span>${esc(t("ticket.off"))}</span>`
        : `<strong>${esc(ACF.money(b.total, currency))}</strong><span>${esc(t("ticket.total"))}</span>`;
    const sub = b.total != null ? t("ticket.newTotal", { v: ACF.money(b.total, currency) }) : isApplied ? t("ticket.appliedToOrder") : t("ticket.bestFound");
    return `
      <div class="ticket" role="group" aria-label="${esc(t("ticket.aria"))}">
        <div class="ticket-main"><span class="ticket-code">${esc(b.code)}</span><span class="ticket-sub">${esc(sub)}</span></div>
        <div class="ticket-save">${save}</div>
      </div>` +
      (isApplied
        ? `<div class="ticket-actions"><span class="applied">${icon("check")}${esc(t("ticket.appliedNote"))}</span>
             <button class="btn btn-small" data-act="copy" data-arg="${esc(b.code)}">${icon("copy")}${esc(t("common.copy"))}</button></div>`
        : `<div class="ticket-actions"><button class="btn" data-act="copy" data-arg="${esc(b.code)}">${icon("copy")}${esc(t("ticket.copyCode"))}</button>
             <button class="btn btn-primary" data-act="applyBest">${esc(t("ticket.apply", { code: b.code }))}</button></div>`);
  }

  // Sold-out codes: offer to wait for them
  function offer(list) {
    if (!list || !list.length) return "";
    const top = list.slice().sort((a, b) => (b.value || 0) - (a.value || 0))[0];
    const what = list.length === 1
      ? t("offer.one", { code: esc(top.code), off: top.value ? esc(t("offer.offPart", { v: ACF.num(top.value) })) : "" })
      : t("offer.many", { n: list.length, top: esc(top.value ? t("common.off", { v: ACF.num(top.value) }) : top.code) });
    return `<div class="offer"><span>${what} ${esc(t("offer.topped"))}</span>
      <button class="btn btn-small" data-act="huntExhausted">${icon("clock")}${esc(t("offer.wait"))}</button></div>`;
  }

  // Message after a finished search (when the ticket doesn't already say it)
  function outcome(st) {
    if (!st.message) return "";
    if (st.phase === "error") return `<div class="outcome bad">${icon("alert")}<span>${esc(st.message)}</span></div>`;
    if (st.best && st.explained) return "";
    return `<div class="outcome"><span>${esc(st.message)}</span></div>`;
  }

  function chip(status) {
    if (!status) return `<span class="chip none" title="${esc(t("table.notTried"))}">—</span>`;
    const tone = (ACF.STATUS_TONE || {})[status] || "neutral";
    return `<span class="chip ${tone}">${esc(ACF.statusLabel(status))}</span>`;
  }

  // Results of the current search: working codes first
  function results(rows, best, currency) {
    if (!rows || !rows.length) return "";
    const rank = (r) => (r.status === "ok" ? 0 : r.status === "used_up" ? 1 : 2);
    const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) =>
      rank(a) - rank(b) || (a.total ?? Infinity) - (b.total ?? Infinity) || b.i - a.i);
    return `<div class="table-wrap"><table class="table">
      <thead><tr><th>${esc(t("table.code"))}</th><th class="num">${esc(t("table.off"))}</th><th>${esc(t("table.result"))}</th><th class="num">${esc(t("table.total"))}</th></tr></thead>
      <tbody>${sorted.map((r) => `<tr>
        <td><code>${esc(r.code)}</code></td>
        <td class="num">${esc(ACF.num(r.value))}</td>
        <td>${chip(r.status)}${r.tries > 1 ? ` <small class="tries">×${r.tries}</small>` : ""}</td>
        <td class="num">${r.status === "ok" && r.total != null ? esc(ACF.money(r.total, currency)) : ""}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------------- country, currency, language
  const countryName = (id) => ACF.countryName(id);
  // Short language label for chips: en_US → EN, uk_UA → UA (as AliExpress shoppers know it)
  const langShort = (id) => { const l = String(id || "").split("_")[0]; return l === "uk" ? "UA" : l.toUpperCase(); };
  const langName = (id) => { const L = ACF.STORE.languages[id]; return L ? L.native : id; };

  // One line for the collapsed block: "PL · EUR · EN"
  function storeLine(st) {
    return [st.region, st.currency, st.language && langShort(st.language)].filter(Boolean).join(" · ") || "—";
  }

  /*
   * The switcher block: three rows of one-tap choices from the user's own lists.
   * Tapping a choice selects it; "Apply" appears only when something differs from the current settings.
   * cur: { region, currency, language }; favs: { countries, currencies, languages }; counts: codes per country.
   */
  function switcher(cur, favs, counts = {}, { collapsed = false, busy = false, pageCurrency = null, addressRegion = null } = {}) {
    const withCurrent = (list, value) => (value && !list.includes(value) ? [value, ...list] : list);
    const row = (name, ic, titleKey, items, value, label, hint) => `
      <div class="sw-row">
        <span class="sw-ic" title="${esc(t(titleKey))}">${icon(ic)}</span>
        <div class="sw-chips" role="radiogroup" aria-label="${esc(t(titleKey))}">
          ${items.length ? items.map((id) => `<button type="button" class="sw-chip" role="radio" data-name="${name}" data-value="${esc(id)}"
              aria-checked="${id === value}" title="${esc(hint(id))}" ${busy ? "disabled" : ""}>${label(id)}</button>`).join("")
            : `<span class="caption">${esc(t("sw.emptyList"))}</span>`}
        </div>
      </div>`;
    const countryLabel = (id) => `<span>${esc(id)}</span>${counts[id] != null ? `<small>${counts[id]}</small>` : ""}`;
    const countryHint = (id) => (counts[id] != null ? t("sw.codesIn", { name: countryName(id), n: counts[id] }) : countryName(id));
    const currencyLabel = (id) => { const sym = ACF.currencySymbol(id); return `${sym && sym !== id ? `<small class="sym">${esc(sym)}</small>` : ""}<span>${esc(id)}</span>`; };
    const currencyHint = (id) => ACF.STORE.currencies[id] || id;
    return `
      <div class="sw${collapsed ? " collapsed" : ""}${busy ? " busy" : ""}" role="group" aria-label="${esc(t("sw.title"))}">
        <div class="sw-head">
          <button type="button" class="sw-fold" data-sw="fold" aria-expanded="${!collapsed}" title="${esc(t(collapsed ? "sw.expand" : "sw.collapse"))}">
            <span class="sw-title">${esc(t("sw.title"))}</span>
            <span class="sw-line">${esc(storeLine(cur))}</span>
            ${icon("down")}
          </button>
          <button type="button" class="icon-btn sw-edit" data-sw="edit" title="${esc(t("sw.edit"))}" aria-label="${esc(t("sw.edit"))}">${icon("sliders")}</button>
        </div>
        <div class="sw-body">
          ${row("region", "truck", "sw.country", withCurrent(favs.countries, cur.region), cur.region, countryLabel, countryHint)}
          ${row("currency", "coins", "sw.currency", withCurrent(favs.currencies, cur.currency), cur.currency, currencyLabel, currencyHint)}
          ${row("language", "globe", "sw.language", withCurrent(favs.languages, cur.language), cur.language, (id) => `<span>${esc(langShort(id))}</span>`, langName)}
          ${busy ? `<p class="caption sw-busy">${esc(t("sw.busy"))}</p>` : ""}
          ${addressRegion && addressRegion !== cur.region
            ? `<p class="caption sw-note sw-addr">${esc(t("sw.addressNote", { name: countryName(addressRegion) }))}</p>` : ""}
          ${pageCurrency && cur.currency && pageCurrency !== cur.currency
            ? `<p class="caption sw-note">${esc(t("sw.currencyNote", { page: pageCurrency, chosen: cur.currency }))}</p>` : ""}
          <p class="caption err sw-error" hidden></p>
        </div>
      </div>`;
  }

  /*
   * Wires a rendered switcher. A tap applies that one setting straight away (the page reloads).
   * onApply(store) → { ok, error? }; onEdit(); onFold(collapsed).
   * Returns { dirty() } so the caller doesn't rebuild the block while a change is being applied.
   */
  function bindSwitcher(root, { current, onApply, onEdit, onFold }) {
    const box = root.querySelector(".sw");
    if (!box) return { dirty: () => false };
    const err = box.querySelector(".sw-error");
    let busy = false;
    box.addEventListener("click", async (e) => {
      const chipEl = e.target.closest(".sw-chip");
      if (chipEl) {
        const { name, value } = chipEl.dataset;
        if (chipEl.disabled || busy || current[name] === value) return;
        busy = true;
        err.hidden = true;
        const chips = [...box.querySelectorAll(".sw-chip")];
        const was = chips.find((c) => c.dataset.name === name && c.getAttribute("aria-checked") === "true");
        chips.forEach((c) => { if (c.dataset.name === name) c.setAttribute("aria-checked", String(c === chipEl)); c.disabled = true; });
        chipEl.classList.add("pending");
        const next = { region: current.region, currency: current.currency, language: current.language, [name]: value };
        box.querySelector(".sw-line").textContent = storeLine(next);
        const res = await onApply(next);
        if (res && res.ok) {
          // Usually the page reloads now. If it didn't (a payment page, or not an AliExpress tab), the choice simply stays
          if (res.reloaded === false) {
            Object.assign(current, next);
            busy = false;
            chipEl.classList.remove("pending");
            chips.forEach((c) => { c.disabled = false; });
          }
          return;
        }
        busy = false;
        chipEl.classList.remove("pending");
        chips.forEach((c) => { c.disabled = false; if (c.dataset.name === name) c.setAttribute("aria-checked", String(c === was)); });
        box.querySelector(".sw-line").textContent = storeLine(current);
        err.hidden = false;
        err.textContent = t("sw.error", { e: res && res.error ? ": " + res.error : "" });
        return;
      }
      const b = e.target.closest("[data-sw]");
      if (!b) return;
      if (b.dataset.sw === "fold") {
        const collapsed = !box.classList.contains("collapsed");
        box.classList.toggle("collapsed", collapsed);
        b.setAttribute("aria-expanded", String(!collapsed));
        b.title = t(collapsed ? "sw.expand" : "sw.collapse");
        if (onFold) onFold(collapsed);
      } else if (b.dataset.sw === "edit") onEdit();
    });
    return { dirty: () => busy };
  }

  // Count of codes as "1 code" / "5 codes" / "5 кодів"
  const plural = (n) => t("codes.count", { n });

  return { esc, switcher, bindSwitcher, storeLine, countryName, langShort, modes, progress, ticket, offer, outcome, chip, results, plural };
})();
