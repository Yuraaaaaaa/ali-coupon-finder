/* Entry point on the checkout page: connects the engine, the panel, storage and the popup. */
(() => {
  if (window.__acfLoaded) return;
  window.__acfLoaded = true;

  const ACF = globalThis.ACF;
  const d = ACF.dom;
  const host = location.hostname;

  let settings = {};
  let codes = [];
  let codeStats = {};
  let favorites = ACF.normalizeFavorites();

  const engine = new ACF.Engine({
    onUpdate: () => render(),
    onResult: (item, status) => saveResult(item, status),
    // Waiting state is saved so it continues by itself after a page reload
    onHunt: (h) => h
      ? chrome.storage.local.set({ hunt: { host, codes: h.codes, deadline: Number.isFinite(h.deadline) ? h.deadline : null, roundPause: h.roundPause, baseline: h.baseline ?? null, best: h.best || null, collected: h.collected || [], collect: h.collect !== false, at: Date.now() } })
      : chrome.storage.local.remove("hunt"),
    onNotify: (n) => chrome.runtime.sendMessage({ type: "notify", ...n }).catch(() => {})
  });

  const panel = new ACF.Panel({
    onStart: (mode) => start(mode),
    onHuntExhausted: () => startHunt(engine.exhaustedBetterThanBest(), null, engine.state.baseline, appliedBest()),
    onStop: () => engine.stop(),
    onPause: () => engine.pause(),
    onResume: () => engine.resume(),
    onApplyBest: () => applyBest(),
    onCopy: (code) => navigator.clipboard.writeText(code).then(() => panel.flash(`Copied ${code}`)),
    onPickTotal: () => pickTotal(),
    storeInfo: () => ({ current: d.aliStore(), favorites, counts: codeCounts() }),
    onEditLists: () => chrome.runtime.sendMessage({ type: "openSettings" }).catch(() => {}),
    onSetStore: (store) => chrome.runtime.sendMessage({ type: "setStore", store }).catch((e) => ({ ok: false, error: String(e.message || e) })),
    onDiagnose: () => navigator.clipboard.writeText(diagnose())
      .then(() => panel.flash("Diagnostics copied"))
      .catch(() => panel.flash("Couldn't copy. Use Settings → Diagnostics in the extension instead."))
  });

  // ------------------------------------------------------------ diagnostics
  // Collects ONLY input fields, short texts near the promo section, and the total.
  // Address, name and phone are excluded: only elements with promo/total keywords are read.
  function diagnose() {
    const cfg = ACF.CONFIG;
    const cls = (el) => (typeof el.className === "string" ? el.className : "").slice(0, 80);
    const short = (t) => (t || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const out = { v: chrome.runtime.getManifest().version, path: location.pathname, lang: document.documentElement.lang,
      ...d.aliRegion(), total: engine.readTotal(), inputs: [], promo: [], totals: [], dialogs: [] };

    for (const i of document.querySelectorAll("input:not([type=hidden]),textarea")) {
      if (!d.visible(i) || i.closest("#acf-host")) continue;
      const meta = [i.placeholder, i.getAttribute("aria-label"), i.name].join(" ");
      if (cfg.inputExclude.test(meta) && !cfg.promoContext.test(meta)) continue;
      out.inputs.push({ type: i.type, ph: short(i.placeholder), aria: short(i.getAttribute("aria-label")), name: i.name, cls: cls(i) });
    }
    const promoRe = cfg.promoContext;
    // Texts with no letters except a price, or that look like an address or a name, are never copied
    const isPrice = (t) => /^[^\p{L}]*$/u.test(t.replace(/[€$£₴]|zł|kč|pln|eur|usd|czk|uah|grn|грн/gi, ""));
    for (const el of document.querySelectorAll("button,[role=button],a,span,div,label,p,b,strong,dt,dd,td")) {
      if (el.closest("#acf-host") || !d.visible(el)) continue;
      const t = short(el.innerText);
      if (!t || t.length > 40 || el.children.length > 3) continue;
      if (cfg.totalLabels.test(t.toLowerCase())) {
        const row = short(el.parentElement && el.parentElement.innerText);
        out.totals.push({ tag: el.tagName, t, row: cfg.inputExclude.test(row) ? "" : row, cls: cls(el) });
        continue;
      }
      if (cfg.inputExclude.test(t)) continue;
      // Promo labels and buttons themselves, or short controls/prices right next to them (never address-like text)
      const near = (el.parentElement && el.parentElement.parentElement && el.parentElement.parentElement.innerText || "").slice(0, 300);
      const nearby = t.length < 20 && promoRe.test(near) && !cfg.inputExclude.test(near) && (isPrice(t) || !/\d/.test(t));
      if (promoRe.test(t) || nearby) out.promo.push({ tag: el.tagName, t, cls: cls(el) });
    }
    for (const dl of document.querySelectorAll("[role=dialog],[aria-modal=true],[class*=modal],[class*=dialog]")) {
      if (d.visible(dl) && !dl.closest("#acf-host") && promoRe.test(dl.innerText || "") && !cfg.inputExclude.test(dl.innerText || "")) out.dialogs.push({ t: short(dl.innerText), cls: cls(dl) });
    }
    out.promo = out.promo.slice(0, 40); out.totals = out.totals.slice(0, 15); out.inputs = out.inputs.slice(0, 15);
    return "ACF-DIAG " + JSON.stringify(out);
  }

  // ------------------------------------------------------------ storage
  async function load() {
    const s = await chrome.storage.local.get(["settings", "codeStats", "favorites"]);
    favorites = ACF.normalizeFavorites(s.favorites);
    settings = Object.assign({ autoConfirm: true, skipDead: true, betweenCodes: 2000, huntCollect: true, totalSelectors: {} }, s.settings || {});
    codeStats = s.codeStats || {};
    const { region } = d.aliRegion();
    if (region) chrome.storage.local.set({ lastRegion: region });
    engine.settings = { ...settings, totalSelector: settings.totalSelectors[host] || null };
    try {
      codes = (await chrome.runtime.sendMessage({ type: "getCodes" })) || [];
    } catch (e) {
      console.warn("[ACF] getCodes failed", e);
      codes = [];
    }
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings || changes.codesByRegion || changes.remoteCodes || changes.favorites) load().then(render);
  });

  function isDead(code, region) {
    const st = codeStats[code];
    if (!st || !settings.skipDead) return false;
    const ttl = ACF.DEAD_TTL_HOURS[st.status];
    if (!ttl) return false;
    if (st.status === "region" && st.region !== region) return false;
    return Date.now() - st.at < ttl * 3600e3;
  }

  // Codes that would be tried in each country (country lists plus All countries)
  function codeCounts() {
    const now = Date.now();
    const live = codes.filter((c) => !(c.expires && Date.parse(c.expires) < now));
    const out = {};
    const { region } = d.aliRegion();
    for (const id of new Set([...favorites.countries, region].filter(Boolean))) {
      out[id] = live.filter((c) => !c.regions || !c.regions.length || c.regions.includes(id)).length;
    }
    return out;
  }

  function buildQueue() {
    const { region } = d.aliRegion();
    const now = Date.now();
    const total = engine.readTotal();
    let skipped = 0;
    const queue = [];
    for (const c of codes) {
      if (c.expires && Date.parse(c.expires) < now) { skipped++; continue; }
      if (region && Array.isArray(c.regions) && c.regions.length && !c.regions.includes(region)) { skipped++; continue; }
      if (isDead(c.code, region)) { skipped++; continue; }
      // Order clearly below the code's minimum (with margin: currencies may differ)
      if (c.minOrder && total != null && c.minOrder > total * 1.3) { skipped++; continue; }
      queue.push(c);
    }
    // Biggest discount first, so Quick search stops at the best working code
    queue.sort((a, b) => (b.value || 0) - (a.value || 0));
    return { queue, skipped };
  }

  async function saveResult(item, status) {
    const { region } = d.aliRegion();
    codeStats[item.code] = { status, at: Date.now(), region };
    const patch = { codeStats };
    if (status === "ok") {
      const { history = [] } = await chrome.storage.local.get("history");
      history.unshift({ code: item.code, value: item.value, at: Date.now(), region, host });
      patch.history = history.slice(0, 50);
    }
    await chrome.storage.local.set(patch);
  }

  // ------------------------------------------------------------ actions
  async function start(mode) {
    await load();
    const { queue, skipped } = buildQueue();
    panel.toggle(true);
    if (mode === "hunt") return startHunt(queue);
    engine.run(queue, mode, skipped);
  }

  // The best code from the last search, if it is the one applied on the page right now
  function appliedBest() {
    const b = engine.state.best;
    return b && engine.state.applied === b.code ? b : null;
  }

  async function startHunt(queue, resume, baseline, best) {
    await load();
    panel.toggle(true);
    const opts = resume
      ? { deadline: resume.deadline ?? Infinity, roundPause: resume.roundPause, baseline: resume.baseline ?? undefined,
          best: resume.best || undefined, collected: resume.collected || [], collect: resume.collect !== false }
      : { roundPause: settings.huntPause ?? 30000, maxMinutes: settings.huntMinutes ?? 60, baseline: baseline ?? undefined,
          best: best || undefined, collect: settings.huntCollect !== false };
    engine.hunt(queue, opts);
  }

  // After a page reload, continue an unfinished wait
  async function resumeHunt() {
    const { hunt } = await chrome.storage.local.get("hunt");
    if (!hunt || hunt.host !== host || !hunt.codes || !hunt.codes.length) return;
    if (hunt.deadline && hunt.deadline < Date.now()) return chrome.storage.local.remove("hunt");
    if (Date.now() - hunt.at > 30 * 60e3) return chrome.storage.local.remove("hunt"); // too old: ignore
    panel.toggle(true);
    engine.emit({ message: "Page reloaded. Continuing to wait for sold-out codes." });
    await d.sleep(3000);
    startHunt(hunt.codes, hunt);
  }

  // Manual total: the user clicks the total, and its selector is saved for this site
  function pickTotal() {
    engine.emit({ message: "Click the order total on the page. Press Esc to cancel." });
    let last = null;
    const over = (e) => {
      if (e.target.closest && e.target.closest("#acf-host")) return;
      if (last) last.style.outline = last.__acfOutline || "";
      last = e.target;
      last.__acfOutline = last.style.outline;
      last.style.outline = "2px solid #38bdf8";
    };
    const cleanup = () => {
      document.removeEventListener("mouseover", over, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      if (last) last.style.outline = last.__acfOutline || "";
    };
    const click = async (e) => {
      if (e.target.closest && e.target.closest("#acf-host")) return;
      e.preventDefault(); e.stopPropagation();
      cleanup();
      const value = d.parsePrice(e.target.innerText);
      if (value == null) return engine.emit({ message: "That element doesn't contain a price. Click the order total." });
      const sel = d.cssPath(e.target);
      settings.totalSelectors = { ...(settings.totalSelectors || {}), [host]: sel };
      await chrome.storage.local.set({ settings });
      engine.settings.totalSelector = sel;
      engine.emit({ message: `Order total set to ${value.toFixed(2)}` });
    };
    const key = (e) => { if (e.key === "Escape") { cleanup(); engine.emit({ message: "Cancelled" }); } };
    document.addEventListener("mouseover", over, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  }

  // ------------------------------------------------------------ render
  function info() {
    const { region, currency } = d.aliRegion();
    const { queue, skipped } = buildQueue();
    return { region, currency, total: engine.readTotal(), available: queue.length, skipped };
  }

  let rendering = false;
  function render() {
    if (rendering) return;
    rendering = true;
    try { panel.render(engine.state, info(), waitable()); } finally { rendering = false; }
  }

  // While idle, keep the panel's total up to date
  setInterval(() => { if (panel.open && engine.state.phase !== "running") render(); }, 2500);

  // ------------------------------------------------------------ popup
  // Sold-out codes worth waiting for, offered after a normal search finishes
  function waitable() {
    const st = engine.state;
    return st.phase === "done" && st.mode !== "hunt" ? engine.exhaustedBetterThanBest() : [];
  }

  async function applyBest() {
    await engine.applyBest();
    const b = engine.state.best;
    engine.finish("done", b && engine.state.applied === b.code ? `${b.code} applied` : `Couldn't apply ${b ? b.code : "the code"}. Enter it manually.`);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    const st = engine.state;
    switch (msg.type) {
      case "status":
        reply({
          state: {
            phase: st.phase, mode: st.mode, round: st.round, message: st.message, current: st.current,
            best: st.best, applied: st.applied, baseline: st.baseline, savedOnPage: st.savedOnPage,
            done: st.results.length, total: st.queue.length, waitable: waitable()
          },
          info: info()
        });
        break;
      case "start": start(msg.mode); reply({ ok: true }); break;
      case "huntExhausted": startHunt(engine.exhaustedBetterThanBest(), null, engine.state.baseline, appliedBest()); reply({ ok: true }); break;
      case "applyBest": applyBest(); reply({ ok: true }); break;
      case "stop": engine.stop(); reply({ ok: true }); break;
      case "pause": engine.pause(); reply({ ok: true }); break;
      case "resume": engine.resume(); reply({ ok: true }); break;
      case "diagnose": reply({ text: diagnose() }); break;
      case "openPanel": panel.toggle(true); render(); reply({ ok: true }); break;
      default: return false;
    }
    return false;
  });

  load().then(render).then(resumeHunt);
})();
