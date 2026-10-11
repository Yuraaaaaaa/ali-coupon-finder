const $ = (s) => document.querySelector(s);
const { esc } = ACF.view;
const t = (k, v) => ACF.t(k, v);
const CHECKOUT_RE = /^https?:\/\/[^/]*aliexpress\.(com|us|ru)\/p\/trade\/(confirm|checkout)/;
const regionName = (id) => (id === "ALL" ? t("common.allCountries") : ACF.view.countryName(id));
const dateShort = (ms) => new Date(ms).toLocaleDateString(ACF.locale(), { day: "numeric", month: "short" });

let tab = null;
let selRegion = null;   // country selected in the Codes tab
let hereRegion = null;  // country AliExpress is currently shipping to

// ---------------------------------------------------------------- language and static texts
const label = (ic, text) => `${ACF.icon(ic)}<span>${esc(text)}</span>`;

// Choices in the settings selects, worded in the interface language
function fillSelects() {
  const num = (v) => Number(v).toLocaleString(ACF.locale());
  const make = {
    sec: (v) => [String(v * 1000), t("time.sec", { n: v })],
    range: (v) => { const [a, b] = v.split("-").map(Number); return [`${a * 1000}-${b * 1000}`, t("time.secRange", { a: num(a), b: num(b) })]; },
    pause: (v) => [String(v * 1000), v < 60 ? t("time.sec", { n: v }) : t("time.min", { n: v / 60 })],
    minutes: (v) => [String(v), v === 0 ? t("time.never") : v < 60 ? t("time.min", { n: v }) : t("time.hour", { n: v / 60 })]
  };
  document.querySelectorAll("select[data-opts]").forEach((sel) => {
    const [kind, list] = sel.dataset.opts.split(":");
    const keep = sel.value;
    sel.innerHTML = list.split(",").map((v) => {
      const [value, text] = make[kind](kind === "range" ? v : Number(v));
      return `<option value="${value}">${esc(text)}</option>`;
    }).join("");
    if (keep) sel.value = keep;
  });
}

function applyStatic() {
  document.documentElement.lang = ACF.getLang();
  ACF.applyI18n(document);
  document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = ACF.icon(el.dataset.icon); });
  $("#openPanel").innerHTML = label("panel", t("run.showOnPage"));
  $("#stopBtn").innerHTML = label("stop", t("run.stop"));
  $("#importToggle").innerHTML = label("paste", t("codes.paste"));
  $("#editToggle").innerHTML = label("edit", t("codes.editText"));
  fillSelects();
}

// ---------------------------------------------------------------- tabs
let currentTab = "search";
function showTab(name) {
  currentTab = name;
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.tab === name)));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== name));
  if (name === "codes") loadCodesTab();
  if (name === "history") loadHistory();
  if (name === "search") renderSwitcher(true);
}
document.querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

// ---------------------------------------------------------------- country, currency, language
let store = {};
let running = false;
let pageCurrency = null; // currency the checkout page shows its total in
let sw = null, swKey = "";

// Saved quick-switch lists
async function getFavorites() {
  const { favorites } = await chrome.storage.local.get("favorites");
  return ACF.normalizeFavorites(favorites);
}

// Codes that would be tried in each country (its own list plus All countries)
async function codeCounts(ids) {
  const all = (await chrome.runtime.sendMessage({ type: "getCodes" })) || [];
  const now = Date.now();
  const live = all.filter((c) => !(c.expires && Date.parse(c.expires) < now));
  const counts = {};
  for (const id of ids) counts[id] = live.filter((c) => !c.regions || !c.regions.length || c.regions.includes(id)).length;
  return counts;
}

async function loadStore() {
  store = (await chrome.runtime.sendMessage({ type: "getStore" })) || {};
  await renderSwitcher();
}

// The switcher block on the Search tab; not rebuilt while a choice is pending
async function renderSwitcher(force) {
  const favs = await getFavorites();
  const counts = await codeCounts([...new Set([...favs.countries, store.region].filter(Boolean))]);
  const { ui = {} } = await chrome.storage.local.get("ui");
  const key = JSON.stringify([store, favs, counts, running, pageCurrency, ACF.getLang()]);
  if (!force && (key === swKey || (sw && sw.dirty()))) return;
  if (force && sw && sw.dirty()) return;
  swKey = key;
  const onAliNow = () => !!(tab && /aliexpress\.(com|us|ru)/.test(tab.url || ""));
  $("#swBox").innerHTML = ACF.view.switcher(store, favs, counts, { collapsed: !!ui.swCollapsed, busy: running, pageCurrency });
  sw = ACF.view.bindSwitcher($("#swBox"), {
    current: store,
    onEdit: () => showTab("settings"),
    onFold: async (collapsed) => {
      const { ui = {} } = await chrome.storage.local.get("ui");
      chrome.storage.local.set({ ui: { ...ui, swCollapsed: collapsed } });
    },
    onApply: async (next) => {
      // The tab is looked up when Apply is pressed, not when the block was drawn
      const onAli = onAliNow();
      if (onAli && CHECKOUT_RE.test(tab.url || "")) {
        const r = await send({ type: "status" });
        if (r && (r.state.phase === "running" || r.state.phase === "paused")) return { ok: false, error: t("sw.stopPage") };
      }
      const res = await chrome.runtime.sendMessage({ type: "setStore", store: next, tabId: onAli ? tab.id : null });
      if (res && res.code === "otherSite") return { ok: false, error: t("sw.otherSite", { host: res.host }) };
      if (res && res.ok) {
        store = (await chrome.runtime.sendMessage({ type: "getStore" })) || {};
        sw = null;
        await renderSwitcher(true);
        lastRender = "";
        relang();
      }
      return res;
    }
  });
}

// ---------------------------------------------------------------- list editor (Settings)
const LISTS = [
  { key: "countries", title: "set.countries", icon: "truck", add: "set.addCountry",
    all: () => Object.keys(ACF.STORE.countries), label: (id) => ACF.view.countryName(id),
    hint: (id) => [id, ACF.STORE.countries[id]].filter((x, i, a) => a.indexOf(x) === i && x !== ACF.view.countryName(id)).join(" · ") || id },
  { key: "currencies", title: "set.currencies", icon: "coins", add: "set.addCurrency",
    all: () => Object.keys(ACF.STORE.currencies), label: (id) => id, hint: (id) => ACF.STORE.currencies[id] },
  { key: "languages", title: "set.languages", icon: "globe", add: "set.addLanguage",
    all: () => Object.keys(ACF.STORE.languages), label: (id) => ACF.STORE.languages[id].native, hint: (id) => ACF.STORE.languages[id].name }
];

async function renderFavEditor() {
  const favs = await getFavorites();
  $("#favEditor").innerHTML = LISTS.map((L) => `
    <div class="fav" data-key="${L.key}">
      <div class="fav-head">${ACF.icon(L.icon)}${esc(t(L.title))}</div>
      <div class="fav-chips">${favs[L.key].length ? favs[L.key].map((id) => `
        <span class="fav-chip" title="${esc(L.hint(id))}">${esc(L.label(id))}<button type="button" data-remove="${esc(id)}" aria-label="${esc(t("set.remove", { x: L.label(id) }))}">${ACF.icon("close")}</button></span>`).join("")
        : `<span class="fav-empty">${esc(t("set.favEmpty"))}</span>`}</div>
      <div class="picker">${ACF.icon("search")}<input type="search" placeholder="${esc(t(L.add))}" aria-label="${esc(t(L.add))}" autocomplete="off"><ul role="listbox" hidden></ul></div>
    </div>`).join("");
}

async function saveFavorites(update) {
  const favs = await getFavorites();
  update(favs);
  await chrome.storage.local.set({ favorites: favs });
  await renderFavEditor();
}

// Removing a chip
$("#favEditor").addEventListener("click", async (e) => {
  const rm = e.target.closest("[data-remove]");
  if (rm) {
    const key = rm.closest(".fav").dataset.key;
    await saveFavorites((f) => { f[key] = f[key].filter((x) => x !== rm.dataset.remove); });
    return;
  }
  const li = e.target.closest(".picker li[data-id]");
  if (li) addFavorite(li.closest(".fav").dataset.key, li.dataset.id);
});

async function addFavorite(key, id) {
  await saveFavorites((f) => { if (!f[key].includes(id)) f[key].push(id); });
  const input = $(`#favEditor .fav[data-key="${key}"] input`);
  if (input) input.focus();
}

// Search-as-you-type picker: matches name (in the interface language and in English), code or native name
function pickerMatches(L, q, taken) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return L.all()
    .filter((id) => !taken.includes(id))
    .map((id) => {
      const english = L.key === "countries" ? ACF.STORE.countries[id] : "";
      const hay = [id, L.label(id), L.hint(id), english].join(" ").toLowerCase();
      const name = L.label(id).toLowerCase();
      const rank = id.toLowerCase() === q ? 0 : name.startsWith(q) || english.toLowerCase().startsWith(q) ? 1 : hay.includes(q) ? 2 : 9;
      return { id, rank };
    })
    .filter((m) => m.rank < 9)
    .sort((a, b) => a.rank - b.rank || L.label(a.id).localeCompare(L.label(b.id), ACF.locale()))
    .slice(0, 6)
    .map((m) => m.id);
}

$("#favEditor").addEventListener("input", async (e) => {
  if (!e.target.matches(".picker input")) return;
  const box = e.target.closest(".fav");
  const L = LISTS.find((x) => x.key === box.dataset.key);
  const favs = await getFavorites();
  const ids = pickerMatches(L, e.target.value, favs[L.key]);
  const ul = box.querySelector("ul");
  ul.hidden = !e.target.value.trim();
  ul.innerHTML = ids.length
    ? ids.map((id, i) => `<li role="option" data-id="${esc(id)}" aria-selected="${i === 0}"><span>${esc(L.label(id))}</span><small>${esc(L.hint(id))}</small></li>`).join("")
    : `<li class="none">${esc(t("set.noMatches"))}</li>`;
});

$("#favEditor").addEventListener("keydown", (e) => {
  if (!e.target.matches(".picker input")) return;
  const ul = e.target.closest(".picker").querySelector("ul");
  const items = [...ul.querySelectorAll("li[data-id]")];
  const i = items.findIndex((li) => li.getAttribute("aria-selected") === "true");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!items.length) return;
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((li, k) => li.setAttribute("aria-selected", String(k === next)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (items[i]) addFavorite(e.target.closest(".fav").dataset.key, items[i].dataset.id);
  } else if (e.key === "Escape") {
    e.target.value = "";
    ul.hidden = true;
  }
});

// ---------------------------------------------------------------- search
async function send(msg) {
  try { return await chrome.tabs.sendMessage(tab.id, msg); } catch (e) { return null; }
}

let statusTimer = null;
async function initSearch() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onCheckout = tab && CHECKOUT_RE.test(tab.url || "");
  $("#notCheckout").hidden = onCheckout;
  $("#onCheckout").hidden = $("#onCheckoutMain").hidden = true;
  if (!onCheckout) return;
  await refreshStatus();
  clearInterval(statusTimer);
  statusTimer = setInterval(refreshStatus, 1000);
}

let lastRender = "";
async function refreshStatus() {
  const r = await send({ type: "status" });
  $("#loading").hidden = !!r;
  $("#onCheckout").hidden = $("#onCheckoutMain").hidden = !r;
  if (!r) return;

  const { state: st, info } = r;
  if (info.region) hereRegion = info.region;
  $("#fTotal").textContent = ACF.money(info.total, info.currency);
  $("#fTotal").title = info.total == null ? t("facts.totalMissing") : "";
  $("#fCodes").textContent = String(info.available);

  const isRunning = st.phase === "running" || st.phase === "paused";
  if (isRunning !== running || (info.pageCurrency || null) !== pageCurrency) { running = isRunning; pageCurrency = info.pageCurrency || null; renderSwitcher(); }
  $("#fSkipped").hidden = isRunning || !info.skipped;
  $("#fSkipped").textContent = t("facts.skipped", { n: info.skipped });
  $("#running").hidden = !isRunning;
  $("#modes").hidden = isRunning;

  if (isRunning) {
    const p = ACF.view.progress(st);
    $("#running").classList.toggle("wait", p.wait);
    $("#runTitle").textContent = p.title;
    $("#runCount").textContent = p.count;
    $("#runMsg").textContent = p.message;
    $("#runBar").classList.toggle("indeterminate", p.pct == null);
    $("#runBar i").style.width = p.pct == null ? "" : p.pct + "%";
    $("#result").innerHTML = "";
    lastRender = "";
    return;
  }

  // Re-render only when something changed, so hover and focus aren't lost every second
  const key = JSON.stringify([info.available, st.phase, st.message, st.best, st.applied, st.waitable]);
  if (key === lastRender) return;
  lastRender = key;
  $("#modes").innerHTML = ACF.view.modes(info.available, st.phase !== "idle");
  $("#result").innerHTML = st.phase === "idle" ? "" :
    `<div class="stack">${ACF.view.outcome(st)}${ACF.view.ticket(st, info.currency)}${ACF.view.offer(st.waitable)}</div>`;
}

// One handler for every action button on the Search tab
$("#search").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, arg } = b.dataset;
  if (act === "copy") {
    await navigator.clipboard.writeText(arg);
    b.innerHTML = label("check", t("common.copied"));
    return;
  }
  await send(act === "start" ? { type: "start", mode: arg } : { type: act });
  lastRender = "";
  refreshStatus();
});
$("#stopBtn").onclick = () => send({ type: "stop" }).then(refreshStatus);
$("#openPanel").onclick = () => send({ type: "openPanel" }).then(() => window.close());

// ---------------------------------------------------------------- storage helpers
async function getSettings() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  return settings;
}
async function patchSettings(patch) {
  const s = await getSettings();
  await chrome.storage.local.set({ settings: { ...s, ...patch } });
}

// ---------------------------------------------------------------- codes
async function loadCodesTab() {
  await chrome.runtime.sendMessage({ type: "getCodes" }); // makes sure the per-country lists exist
  const { codesByRegion = {}, codeStats = {}, lastRegion } = await chrome.storage.local.get(["codesByRegion", "codeStats", "lastRegion"]);
  cachedCodes = { ...codesByRegion };
  hereRegion = hereRegion || lastRegion || null;
  // Tabs: All, the user's countries, and any other country that already has codes
  const favs = await getFavorites();
  const withCodes = Object.keys(codesByRegion).filter((id) => id !== "ALL" && ACF.parseCodeText(codesByRegion[id]).codes.length);
  const tabs = [{ id: "ALL", short: t("common.all"), name: t("common.allCountries") },
    ...[...new Set([...favs.countries, ...withCodes])].map((id) => ({ id, short: id, name: ACF.view.countryName(id) }))];
  if (!selRegion || !tabs.some((r) => r.id === selRegion)) selRegion = tabs.some((r) => r.id === hereRegion) ? hereRegion : "ALL";

  $("#regionTabs").innerHTML = tabs.map((r) => {
    const n = ACF.parseCodeText(codesByRegion[r.id]).codes.length;
    const on = r.id === selRegion;
    return `<button role="radio" aria-checked="${on}" data-region="${r.id}" class="${r.id === hereRegion ? "here" : ""}"
      title="${esc(r.name)}${r.id === hereRegion ? esc(t("codes.here")) : ""}">${esc(r.short)}<span>${n}</span></button>`;
  }).join("");

  const reg = tabs.find((r) => r.id === selRegion);
  $("#regionHint").textContent = selRegion === "ALL" ? t("codes.hintAll") : t("codes.hintCountry", { name: reg.name });
  $("#editLabel").textContent = selRegion === "ALL" ? t("codes.forAll") : t("codes.forCountry", { name: reg.name });

  const text = codesByRegion[selRegion] || "";
  if (document.activeElement !== $("#regionCodes")) $("#regionCodes").value = text;
  showEditInfo();
  renderCodeTable(ACF.parseCodeText(text).codes, codeStats, reg);
}

function renderCodeTable(codes, stats, reg) {
  if (!codes.length) {
    $("#codeTable").innerHTML = `<div class="empty compact">
      <h2>${esc(reg.id === "ALL" ? t("codes.emptyAll") : t("codes.empty", { name: reg.name }))}</h2>
      <p>${esc(t("codes.emptyText"))}</p></div>`;
    return;
  }
  const now = Date.now();
  const sorted = codes.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
  const exp = codes.map((c) => c.expires).filter(Boolean).sort()[0];
  $("#codeTable").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>${esc(t("table.code"))}</th><th class="num">${esc(t("table.off"))}</th><th class="num">${esc(t("table.min"))}</th><th>${esc(t("table.last"))}</th></tr></thead>
    <tbody>${sorted.map((c) => {
      const expired = c.expires && Date.parse(c.expires) < now;
      const st = stats[c.code];
      return `<tr class="${expired ? "expired" : ""}">
        <td><code>${esc(c.code)}</code></td>
        <td class="num">${esc(ACF.num(c.value))}</td>
        <td class="num">${esc(ACF.num(c.minOrder))}</td>
        <td>${expired ? ACF.view.chip("expired") : ACF.view.chip(st && st.status)}</td></tr>`;
    }).join("")}</tbody></table>
    <div class="table-foot">${esc(t("codes.count", { n: codes.length }))}${exp ? esc(t("codes.validUntil", { d: ACF.fmtDate(exp) })) : ""}</div></div>`;
}

$("#regionTabs").onclick = (e) => {
  const b = e.target.closest("[data-region]");
  if (!b) return;
  flushRegion().then(() => {
    selRegion = b.dataset.region;
    $("#regionCodes").blur();
    $("#regionCodes").value = "";
    loadCodesTab();
  });
};

// Switching between the table, the paste box and the text editor
function showView(name) {
  $("#codesView").hidden = name !== "table";
  $("#importView").hidden = name !== "import";
  $("#editView").hidden = name !== "edit";
  if (name === "import") $("#importText").focus();
  if (name === "edit") $("#regionCodes").focus();
}
$("#importToggle").onclick = () => showView("import");
$("#editToggle").onclick = () => showView("edit");
$("#editDone").onclick = () => flushRegion().then(() => { showView("table"); loadCodesTab(); });

function showEditInfo(saved) {
  const { codes, bad } = ACF.parseCodeText($("#regionCodes").value);
  $("#regionInfo").innerHTML = (saved ? esc(t("codes.saved")) : "") +
    (codes.length ? esc(ACF.summarizeCodes(codes)) + "." : esc(t("codes.none"))) +
    (bad ? ` <span class="err">${esc(t("codes.badLines", { n: bad }))}</span>` : "") +
    " " + t("codes.format");
}

// Every keystroke is written straight away in one call (no read first), so closing the popup never loses an edit
let cachedCodes = null;
let saving = Promise.resolve();
let infoTimer = null;
function flushRegion() { return saving; }
$("#regionCodes").oninput = () => {
  if (!cachedCodes) return;
  cachedCodes[selRegion] = $("#regionCodes").value;
  saving = chrome.storage.local.set({ codesByRegion: { ...cachedCodes } }).catch(() => {});
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => saving.then(() => showEditInfo(true)), 300);
};

// ---------------------------------------------------------------- paste a post
let parsedPost = null;
$("#importText").oninput = async () => {
  parsedPost = ACF.parsePost($("#importText").value);
  const entries = Object.entries(parsedPost);
  $("#importReplace").disabled = $("#importAdd").disabled = !entries.length;
  if (!entries.length) {
    $("#importPreview").innerHTML = $("#importText").value.trim()
      ? `<p class="caption err">${esc(t("codes.notFound"))}</p>` : "";
    return;
  }
  const order = ["ALL", ...(await getFavorites()).countries];
  entries.sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  $("#importPreview").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>${esc(t("table.country"))}</th><th class="num">${esc(t("table.codes"))}</th><th class="num">${esc(t("table.off"))}</th><th class="num">${esc(t("table.until"))}</th></tr></thead>
    <tbody>${entries.map(([id, list]) => {
      const vals = list.map((c) => c.value).filter(Boolean);
      const range = vals.length ? (Math.min(...vals) === Math.max(...vals) ? ACF.num(vals[0]) : `${ACF.num(Math.min(...vals))}–${ACF.num(Math.max(...vals))}`) : "—";
      const exp = list.map((c) => c.expires).filter(Boolean).sort()[0];
      return `<tr><td>${esc(regionName(id))}</td><td class="num">${list.length}</td><td class="num">${esc(range)}</td><td class="num">${exp ? esc(ACF.fmtDate(exp)) : "—"}</td></tr>`;
    }).join("")}</tbody></table></div>`;
};

async function applyImport(replace) {
  if (!parsedPost) return;
  const { codesByRegion = {} } = await chrome.storage.local.get("codesByRegion");
  const stamp = `# Imported ${new Date().toLocaleDateString("en-GB")}`;
  let added = 0;
  for (const [id, list] of Object.entries(parsedPost)) {
    if (replace) {
      codesByRegion[id] = [stamp, ...list.map(ACF.formatCode)].join("\n");
      added += list.length;
    } else {
      const have = new Set(ACF.parseCodeText(codesByRegion[id]).codes.map((c) => c.code));
      const fresh = list.filter((c) => !have.has(c.code));
      added += fresh.length;
      codesByRegion[id] = [(codesByRegion[id] || "").trim(), fresh.length ? stamp : "", ...fresh.map(ACF.formatCode)].filter(Boolean).join("\n");
    }
  }
  await chrome.storage.local.set({ codesByRegion });
  resetImport();
  showView("table");
  selRegion = null;
  await loadCodesTab();
  $("#regionHint").textContent = t(replace ? "codes.imported" : "codes.added", { n: added }) + $("#regionHint").textContent;
}
function resetImport() {
  parsedPost = null;
  $("#importText").value = "";
  $("#importPreview").innerHTML = "";
  $("#importReplace").disabled = $("#importAdd").disabled = true;
}
$("#importReplace").onclick = () => applyImport(true);
$("#importAdd").onclick = () => applyImport(false);
$("#importCancel").onclick = () => { resetImport(); showView("table"); };

// ---------------------------------------------------------------- settings
function notify(text, bad) {
  $("#settingsInfo").textContent = text;
  $("#settingsInfo").classList.toggle("bad", !!bad);
}

async function loadSettings() {
  renderFavEditor();
  const s = await getSettings();
  $("#uiLang").value = ACF.UI_LANGS[s.uiLang] ? s.uiLang : "auto";
  $("#autoConfirm").checked = s.autoConfirm !== false;
  $("#skipDead").checked = s.skipDead !== false;
  $("#betweenCodes").value = String(s.betweenCodes || 2000);
  $("#huntPause").value = String(s.huntPause ?? 30000);
  $("#huntCollect").checked = s.huntCollect !== false;
  $("#huntGap").value = Array.isArray(s.huntGap) ? s.huntGap.join("-") : "1500-2500";
  $("#huntMinutes").value = String(s.huntMinutes ?? 60);
  const { codeStats = {} } = await chrome.storage.local.get("codeStats");
  const failed = Object.values(codeStats).filter((x) => ACF.DEAD_TTL_HOURS[x.status]).length;
  $("#statsInfo").textContent = failed ? t("set.failedCount", { n: failed }) : t("set.failedNone");
  $("#resetStats").disabled = !failed;
}

// Changing the interface language redraws everything in place, staying on Settings
$("#uiLang").onchange = async (e) => {
  await patchSettings({ uiLang: e.target.value });
  await relang(true);
};

// Sets the interface language from settings and AliExpress's language; redraws everything if it changed
async function relang(force) {
  const lang = ACF.uiLangFrom(await getSettings(), store.language);
  if (lang === ACF.getLang() && !force) return;
  ACF.setLang(lang);
  applyStatic();
  swKey = ""; sw = null; lastRender = "";
  await Promise.all([loadSettings(), loadRemote(), renderSwitcher(true), refreshIfCheckout()]);
};
const refreshIfCheckout = () => (tab && CHECKOUT_RE.test(tab.url || "") ? refreshStatus() : null);

$("#autoConfirm").onchange = (e) => patchSettings({ autoConfirm: e.target.checked });
$("#skipDead").onchange = (e) => patchSettings({ skipDead: e.target.checked });
$("#betweenCodes").onchange = (e) => patchSettings({ betweenCodes: Number(e.target.value) });
$("#huntPause").onchange = (e) => patchSettings({ huntPause: Number(e.target.value) });
$("#huntCollect").onchange = (e) => patchSettings({ huntCollect: e.target.checked });
$("#huntGap").onchange = (e) => patchSettings({ huntGap: e.target.value.split("-").map(Number) });
$("#huntMinutes").onchange = (e) => patchSettings({ huntMinutes: Number(e.target.value) });

$("#resetTotal").onclick = async () => {
  await patchSettings({ totalSelectors: {} });
  notify(t("set.totalReset"));
};
$("#diagBtn").onclick = async () => {
  if (!tab || !CHECKOUT_RE.test(tab.url || "")) return notify(t("set.openCheckout"), true);
  const r = await send({ type: "diagnose" });
  if (!r) return notify(t("set.noResponse"), true);
  await navigator.clipboard.writeText(r.text);
  notify(t("set.diagCopied"));
};
$("#resetStats").onclick = async () => {
  await chrome.storage.local.set({ codeStats: {} });
  notify(t("set.forgotten"));
  loadSettings();
};

// Shared code list
async function loadRemote() {
  const s = await getSettings();
  const { remoteCodes = [], remoteUpdatedAt } = await chrome.storage.local.get(["remoteCodes", "remoteUpdatedAt"]);
  if (document.activeElement !== $("#codesUrl")) $("#codesUrl").value = s.codesUrl || "";
  $("#remoteInfo").textContent = s.codesUrl
    ? (remoteUpdatedAt
      ? t("set.remoteCount", { n: remoteCodes.length, d: new Date(remoteUpdatedAt).toLocaleString(ACF.locale(), { dateStyle: "medium", timeStyle: "short" }) })
      : t("set.remoteNotYet"))
    : "";
  if (s.codesUrl) $(".shared").open = true;
}
$("#codesUrl").onchange = () => $("#refreshBtn").click();
$("#refreshBtn").onclick = async () => {
  await patchSettings({ codesUrl: $("#codesUrl").value.trim() });
  if (!$("#codesUrl").value.trim()) return loadRemote();
  $("#remoteInfo").textContent = t("set.updating");
  const r = await chrome.runtime.sendMessage({ type: "refreshCodes" });
  if (r && r.ok) loadRemote();
  else $("#remoteInfo").textContent = t("set.updateFailed", { e: r ? r.error : t("set.unknownError") });
};

// ---------------------------------------------------------------- history
async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  $("#historyEmpty").hidden = history.length > 0;
  $("#historyList").hidden = !history.length;
  $("#historyList").innerHTML = history.map((h) => `
    <li>
      <span><code>${esc(h.code)}</code>
        <small>${esc(regionName(h.region))}, ${esc(dateShort(h.at))}</small></span>
      <span class="val">${h.value ? esc(t("common.off", { v: ACF.num(h.value) })) : ""}</span>
      <button class="icon-btn" data-copy="${esc(h.code)}" title="${esc(t("hist.copy", { code: h.code }))}" aria-label="${esc(t("hist.copy", { code: h.code }))}">${ACF.icon("copy")}</button>
    </li>`).join("");
}
$("#historyList").onclick = (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.copy).then(() => {
    b.innerHTML = ACF.icon("check");
    b.classList.add("done");
  });
};

// ---------------------------------------------------------------- start
(async () => {
  store = (await chrome.runtime.sendMessage({ type: "getStore" })) || {};
  ACF.setLang(ACF.uiLangFrom(await getSettings(), store.language));
  applyStatic();
  // Opened as a full page (from "Edit lists" on the checkout page)
  if (new URLSearchParams(location.search).has("page")) document.body.classList.add("page");
  if (location.hash === "#settings") showTab("settings");
  await initSearch();
  await loadStore();
  loadSettings();
  loadRemote();
})();
