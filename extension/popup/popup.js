const $ = (s) => document.querySelector(s);
const { esc, plural } = ACF.view;
const CHECKOUT_RE = /^https?:\/\/[^/]*aliexpress\.(com|us|ru)\/p\/trade\/(confirm|checkout)/;
const regionName = (id) => (id === "ALL" ? "All countries" : ACF.view.countryName(id));

let tab = null;
let selRegion = null;   // country selected in the Codes tab
let hereRegion = null;  // country AliExpress is currently shipping to

// Static icons in the markup
document.querySelectorAll("[data-icon]").forEach((el) => { el.innerHTML = ACF.icon(el.dataset.icon); });
const label = (ic, text) => `${ACF.icon(ic)}<span>${text}</span>`;
$("#openPanel").innerHTML = label("panel", "Show on page");
$("#stopBtn").innerHTML = label("stop", "Stop");
$("#importToggle").innerHTML = label("paste", "Paste a post");
$("#editToggle").innerHTML = label("edit", "Edit as text");

// ---------------------------------------------------------------- tabs
let currentTab = "search";
function showTab(name) {
  currentTab = name;
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x.dataset.tab === name)));
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== name));
  $("#where").setAttribute("aria-expanded", "false");
  if (name === "codes") loadCodesTab();
  if (name === "history") loadHistory();
}
document.querySelectorAll(".tabs button").forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });

// ---------------------------------------------------------------- country, currency, language
let store = {};
async function loadStore() {
  store = (await chrome.runtime.sendMessage({ type: "getStore" })) || {};
  $("#where").innerHTML = `${ACF.icon("truck")}<span class="where-t">${esc(ACF.view.storeSummary(store))}</span>${ACF.icon("down")}`;
}

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

async function openStore() {
  if ($("#where").getAttribute("aria-expanded") === "true") return showTab(currentTab);
  await loadStore();
  const favs = await getFavorites();
  const counts = await codeCounts([...new Set([...favs.countries, store.region].filter(Boolean))]);
  const onAli = tab && /aliexpress\.(com|us|ru)/.test(tab.url || "");
  document.querySelectorAll("main > section").forEach((s) => (s.hidden = s.id !== "store"));
  document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", "false"));
  $("#where").setAttribute("aria-expanded", "true");
  $("#storeInfo").textContent = "";
  $("#storeBox").innerHTML = ACF.view.storeForm(store, favs, counts,
    onAli ? "The AliExpress tab reloads with the new settings." : "Saved for AliExpress. Pages you open next use these settings.");
  ACF.view.bindStoreForm($("#storeBox"), {
    current: store,
    onCancel: () => showTab(currentTab),
    onEdit: () => showTab("settings"),
    onApply: async (next) => {
      if (onAli && CHECKOUT_RE.test(tab.url || "")) {
        const r = await send({ type: "status" });
        if (r && (r.state.phase === "running" || r.state.phase === "paused")) return { ok: false, error: "stop the search on the page first" };
      }
      const res = await chrome.runtime.sendMessage({ type: "setStore", store: next, tabId: onAli ? tab.id : null });
      if (res && res.ok) {
        await loadStore();
        showTab(currentTab);
        lastRender = "";
      }
      return res;
    }
  });
  const first = $("#storeBox .qs-chip[aria-checked=true]") || $("#storeBox .qs-chip");
  if (first) first.focus();
}

// ---------------------------------------------------------------- list editor (Settings)
const LISTS = [
  { key: "countries", title: "Countries", icon: "truck", add: "Add a country",
    all: () => Object.keys(ACF.STORE.countries), label: (id) => ACF.view.countryName(id), hint: (id) => id },
  { key: "currencies", title: "Currencies", icon: "coins", add: "Add a currency",
    all: () => Object.keys(ACF.STORE.currencies), label: (id) => id, hint: (id) => ACF.STORE.currencies[id] },
  { key: "languages", title: "Languages", icon: "globe", add: "Add a language",
    all: () => Object.keys(ACF.STORE.languages), label: (id) => ACF.STORE.languages[id].native, hint: (id) => ACF.STORE.languages[id].name }
];

async function renderFavEditor() {
  const favs = await getFavorites();
  $("#favEditor").innerHTML = LISTS.map((L) => `
    <div class="fav" data-key="${L.key}">
      <div class="fav-head">${ACF.icon(L.icon)}${L.title}</div>
      <div class="fav-chips">${favs[L.key].length ? favs[L.key].map((id) => `
        <span class="fav-chip" title="${esc(L.hint(id))}">${esc(L.label(id))}<button type="button" data-remove="${esc(id)}" aria-label="Remove ${esc(L.label(id))}">${ACF.icon("close")}</button></span>`).join("")
        : `<span class="fav-empty">Nothing yet. Add at least one.</span>`}</div>
      <div class="picker">${ACF.icon("search")}<input type="search" placeholder="${L.add}" aria-label="${L.add}" autocomplete="off"><ul role="listbox" hidden></ul></div>
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

// Search-as-you-type picker: matches name, code or native name; Enter adds the highlighted item
function pickerMatches(L, q, taken) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return L.all()
    .filter((id) => !taken.includes(id))
    .map((id) => {
      const hay = [id, L.label(id), L.hint(id)].join(" ").toLowerCase();
      const label = L.label(id).toLowerCase();
      const rank = id.toLowerCase() === q ? 0 : label.startsWith(q) ? 1 : hay.includes(q) ? 2 : 9;
      return { id, rank };
    })
    .filter((m) => m.rank < 9)
    .sort((a, b) => a.rank - b.rank || L.label(a.id).localeCompare(L.label(b.id)))
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
    : `<li class="none">No matches</li>`;
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

$("#where").onclick = openStore;
$("#fRegionBtn").onclick = openStore;
$("#emptyStoreBtn").onclick = openStore;

// ---------------------------------------------------------------- search
async function send(msg) {
  try { return await chrome.tabs.sendMessage(tab.id, msg); } catch (e) { return null; }
}

async function initSearch() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onCheckout = tab && CHECKOUT_RE.test(tab.url || "");
  $("#notCheckout").hidden = onCheckout;
  if (!onCheckout) return;
  await refreshStatus();
  setInterval(refreshStatus, 1000);
}

let lastRender = "";
async function refreshStatus() {
  const r = await send({ type: "status" });
  $("#loading").hidden = !!r;
  $("#onCheckout").hidden = !r;
  if (!r) return;

  const { state: st, info } = r;
  if (info.region) hereRegion = info.region;
  $("#fTotal").textContent = ACF.money(info.total, info.currency);
  $("#fTotal").title = info.total == null ? "Order total not found on the page" : "";
  $("#fRegion").textContent = ACF.view.countryName(info.region);
  $("#fCodes").textContent = String(info.available);
  $("#fSkipped").hidden = !info.skipped;
  $("#fSkipped").textContent = `${plural(info.skipped, "code is", "codes are")} skipped: another country, too small an order, or failed recently.`;

  const running = st.phase === "running" || st.phase === "paused";
  $("#running").hidden = !running;
  $("#modes").hidden = running;

  if (running) {
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
    b.innerHTML = label("check", "Copied");
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
  hereRegion = hereRegion || lastRegion || null;
  // Tabs: All, the user's countries, and any other country that already has codes
  const favs = await getFavorites();
  const withCodes = Object.keys(codesByRegion).filter((id) => id !== "ALL" && ACF.parseCodeText(codesByRegion[id]).codes.length);
  const tabs = [{ id: "ALL", short: "All", name: "All countries" },
    ...[...new Set([...favs.countries, ...withCodes])].map((id) => ({ id, short: id, name: ACF.view.countryName(id) }))];
  if (!selRegion || !tabs.some((r) => r.id === selRegion)) selRegion = tabs.some((r) => r.id === hereRegion) ? hereRegion : "ALL";

  $("#regionTabs").innerHTML = tabs.map((r) => {
    const n = ACF.parseCodeText(codesByRegion[r.id]).codes.length;
    const on = r.id === selRegion;
    return `<button role="radio" aria-checked="${on}" data-region="${r.id}" class="${r.id === hereRegion ? "here" : ""}"
      title="${esc(r.name)}${r.id === hereRegion ? " (current shipping country)" : ""}">${esc(r.short)}<span>${n}</span></button>`;
  }).join("");

  const reg = tabs.find((r) => r.id === selRegion);
  $("#regionHint").textContent = selRegion === "ALL"
    ? "Tried in every country."
    : `Tried only when AliExpress ships to ${reg.name}.`;
  $("#editLabel").textContent = selRegion === "ALL" ? "Codes for all countries" : `Codes for ${reg.name}`;

  const text = codesByRegion[selRegion] || "";
  if (document.activeElement !== $("#regionCodes")) $("#regionCodes").value = text;
  showEditInfo();
  renderCodeTable(ACF.parseCodeText(text).codes, codeStats, reg);
}

function renderCodeTable(codes, stats, reg) {
  if (!codes.length) {
    $("#codeTable").innerHTML = `<div class="empty compact">
      <h2>No codes for ${esc(reg.id === "ALL" ? "all countries" : reg.name)}</h2>
      <p>Paste a post from Telegram, or add codes as text.</p></div>`;
    return;
  }
  const now = Date.now();
  const sorted = codes.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
  const exp = codes.map((c) => c.expires).filter(Boolean).sort()[0];
  $("#codeTable").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Code</th><th class="num">Off</th><th class="num">Min. order</th><th>Last result</th></tr></thead>
    <tbody>${sorted.map((c) => {
      const expired = c.expires && Date.parse(c.expires) < now;
      const st = stats[c.code];
      return `<tr class="${expired ? "expired" : ""}">
        <td><code>${esc(c.code)}</code></td>
        <td class="num">${esc(ACF.num(c.value))}</td>
        <td class="num">${esc(ACF.num(c.minOrder))}</td>
        <td>${expired ? ACF.view.chip("expired") : ACF.view.chip(st && st.status)}</td></tr>`;
    }).join("")}</tbody></table>
    <div class="table-foot">${esc(plural(codes.length, "code", "codes"))}${exp ? `, valid until ${esc(ACF.fmtDate(exp))}` : ""}</div></div>`;
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
  $("#regionInfo").innerHTML = (saved ? "Saved. " : "") +
    (codes.length ? esc(ACF.summarizeCodes(codes)) + "." : "No codes yet.") +
    (bad ? ` <span class="err">${esc(plural(bad, "line doesn’t", "lines don’t"))} look like a code.</span>` : "") +
    ` Format: <code>CODE 60 min 475</code>; discount and minimum are optional.`;
}

// Every keystroke is saved straight away (writes are queued in order), so closing the popup never loses an edit
let saving = Promise.resolve();
let infoTimer = null;
function flushRegion() { return saving; }
$("#regionCodes").oninput = () => {
  const region = selRegion, text = $("#regionCodes").value;
  saving = saving.then(async () => {
    const { codesByRegion = {} } = await chrome.storage.local.get("codesByRegion");
    codesByRegion[region] = text;
    await chrome.storage.local.set({ codesByRegion });
  }).catch(() => {});
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
      ? `<p class="caption err">No codes found. Codes are 4–32 letters and digits, like DEPRD60.</p>` : "";
    return;
  }
  const order = ["ALL", ...(await getFavorites()).countries];
  entries.sort((a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99));
  $("#importPreview").innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Country</th><th class="num">Codes</th><th class="num">Off</th><th class="num">Until</th></tr></thead>
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
  $("#regionHint").textContent = `${replace ? "Imported" : "Added"} ${plural(added, "code", "codes")}. ` + $("#regionHint").textContent;
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
  $("#autoConfirm").checked = s.autoConfirm !== false;
  $("#skipDead").checked = s.skipDead !== false;
  $("#betweenCodes").value = String(s.betweenCodes || 2000);
  $("#huntPause").value = String(s.huntPause ?? 30000);
  $("#huntMinutes").value = String(s.huntMinutes ?? 60);
  const { codeStats = {} } = await chrome.storage.local.get("codeStats");
  const failed = Object.values(codeStats).filter((x) => ACF.DEAD_TTL_HOURS[x.status]).length;
  $("#statsInfo").textContent = failed
    ? `${plural(failed, "code is", "codes are")} marked as failed. Forget them so they’re tried again.`
    : "No codes are marked as failed.";
  $("#resetStats").disabled = !failed;
}
$("#autoConfirm").onchange = (e) => patchSettings({ autoConfirm: e.target.checked });
$("#skipDead").onchange = (e) => patchSettings({ skipDead: e.target.checked });
$("#betweenCodes").onchange = (e) => patchSettings({ betweenCodes: Number(e.target.value) });
$("#huntPause").onchange = (e) => patchSettings({ huntPause: Number(e.target.value) });
$("#huntMinutes").onchange = (e) => patchSettings({ huntMinutes: Number(e.target.value) });

$("#resetTotal").onclick = async () => {
  await patchSettings({ totalSelectors: {} });
  notify("Order total detection reset.");
};
$("#diagBtn").onclick = async () => {
  if (!tab || !CHECKOUT_RE.test(tab.url || "")) return notify("Open an AliExpress checkout page first.", true);
  const r = await send({ type: "diagnose" });
  if (!r) return notify("The page isn’t responding. Reload it and try again.", true);
  await navigator.clipboard.writeText(r.text);
  notify("Diagnostics copied. Paste them into your message.");
};
$("#resetStats").onclick = async () => {
  await chrome.storage.local.set({ codeStats: {} });
  notify("Failed codes forgotten.");
  loadSettings();
};

// Shared code list
async function loadRemote() {
  const s = await getSettings();
  const { remoteCodes = [], remoteUpdatedAt } = await chrome.storage.local.get(["remoteCodes", "remoteUpdatedAt"]);
  if (document.activeElement !== $("#codesUrl")) $("#codesUrl").value = s.codesUrl || "";
  $("#remoteInfo").textContent = s.codesUrl
    ? (remoteUpdatedAt
      ? `${plural(remoteCodes.length, "code", "codes")}, updated ${new Date(remoteUpdatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`
      : "Not downloaded yet. Select Update.")
    : "";
  if (s.codesUrl) $(".shared").open = true;
}
$("#codesUrl").onchange = () => $("#refreshBtn").click();
$("#refreshBtn").onclick = async () => {
  await patchSettings({ codesUrl: $("#codesUrl").value.trim() });
  if (!$("#codesUrl").value.trim()) return loadRemote();
  $("#remoteInfo").textContent = "Updating…";
  const r = await chrome.runtime.sendMessage({ type: "refreshCodes" });
  if (r && r.ok) loadRemote();
  else $("#remoteInfo").textContent = "Couldn’t update: " + (r ? r.error : "unknown error");
};

// ---------------------------------------------------------------- history
async function loadHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  $("#historyEmpty").hidden = history.length > 0;
  $("#historyList").hidden = !history.length;
  $("#historyList").innerHTML = history.map((h) => `
    <li>
      <span><code>${esc(h.code)}</code>
        <small>${esc(regionName(h.region))}, ${esc(new Date(h.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" }))}</small></span>
      <span class="val">${h.value ? esc(ACF.num(h.value)) + " off" : ""}</span>
      <button class="icon-btn" data-copy="${esc(h.code)}" title="Copy ${esc(h.code)}" aria-label="Copy ${esc(h.code)}">${ACF.icon("copy")}</button>
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

// Opened as a full page (from "Edit lists" on the checkout page)
if (new URLSearchParams(location.search).has("page")) document.body.classList.add("page");
if (location.hash === "#settings") showTab("settings");

initSearch().then(loadStore);
loadSettings();
loadRemote();
