/*
 * Background service worker: owns the code list.
 * Sources: codes entered in the Codes tab (one list per country), plus an optional
 * shared list from a link (Settings). codes.json is only used once, to seed
 * the All countries list on first install.
 */
importScripts("lib/regions.js", "lib/store-data.js");

const REFRESH_HOURS = 6;
const MAX_CODES = 500;

// Chrome can drop alarms when the browser restarts; recreate the refresh alarm if it's missing
chrome.runtime.onStartup.addListener(async () => {
  if (!(await chrome.alarms.get("refreshCodes"))) chrome.alarms.create("refreshCodes", { periodInMinutes: REFRESH_HOURS * 60 });
});

chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({
      settings: { autoConfirm: true, skipDead: true, betweenCodes: 2000, codesUrl: "", totalSelectors: {} }
    });
  }
  await seedCodes();
  const { favorites } = await chrome.storage.local.get("favorites");
  if (!favorites) await chrome.storage.local.set({ favorites: ACF.DEFAULT_FAVORITES });
  chrome.alarms.create("refreshCodes", { periodInMinutes: REFRESH_HOURS * 60 });
  refreshRemote().catch(() => {});
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "refreshCodes") refreshRemote().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "getCodes") {
    getAllCodes().then(reply);
    return true;
  }
  if (msg.type === "getStore") {
    readStore().then(reply);
    return true;
  }
  if (msg.type === "setStore") {
    const tabId = msg.tabId ?? (_sender.tab && _sender.tab.id);
    setStore(msg.store, tabId).then(reply, (e) => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type === "openSettings") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup/popup.html?page=1#settings") });
    return false;
  }
  if (msg.type === "notify") {
    chrome.notifications.create({
      type: "basic", iconUrl: "icons/icon128.png", priority: 2,
      title: String(msg.title || "Ali Coupon Finder"), message: String(msg.message || "")
    });
    return false;
  }
  if (msg.type === "refreshCodes") {
    refreshRemote().then((n) => reply({ ok: true, count: n }), (e) => reply({ ok: false, error: String(e.message || e) }));
    return true;
  }
  return false;
});

// ---------------------------------------------------------------- parsing

function cleanCode(c) {
  if (!c || typeof c.code !== "string") return null;
  const code = c.code.trim();   // keep the case: AliExpress codes are case-sensitive
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(code)) return null;
  const value = Number(c.value);
  return {
    code,
    value: Number.isFinite(value) ? value : 0,
    regions: Array.isArray(c.regions) ? c.regions.map((r) => String(r).toUpperCase()).slice(0, 50) : undefined,
    expires: typeof c.expires === "string" ? c.expires : undefined,
    minOrder: Number.isFinite(Number(c.minOrder)) ? Number(c.minOrder) : undefined,
    note: typeof c.note === "string" ? c.note.slice(0, 100) : undefined
  };
}

function parseList(json) {
  const arr = Array.isArray(json) ? json : json && Array.isArray(json.codes) ? json.codes : null;
  if (!arr) throw new Error("Unsupported format. Expected {\"codes\": [...]} or an array.");
  return arr.map(cleanCode).filter(Boolean).slice(0, MAX_CODES);
}

// A country's text list → codes (format described in lib/regions.js)
function parseCustom(text, region) {
  return ACF.parseCodeText(text).codes
    .map((c) => cleanCode({ ...c, regions: region && region !== "ALL" ? [region] : undefined }))
    .filter(Boolean);
}

// ---------------------------------------------------------------- sources

async function bundled() {
  const res = await fetch(chrome.runtime.getURL("codes.json"));
  return parseList(await res.json());
}

// First install, or upgrade from an older version: create the per-country lists
async function seedCodes() {
  const { codesByRegion, customCodes } = await chrome.storage.local.get(["codesByRegion", "customCodes"]);
  if (codesByRegion) return;
  let base = [];
  try { base = await bundled(); } catch (e) {}
  const groups = new Map();
  for (const c of base) {
    if (!groups.has(c.value)) groups.set(c.value, []);
    groups.get(c.value).push(c.code);
  }
  const text = [...groups.entries()].sort((a, b) => b[0] - a[0])
    .map(([v, list]) => `${v}\n${list.join("\n")}`).join("\n\n");
  const seeded = { ALL: [String(customCodes || "").trim(), text].filter(Boolean).join("\n\n") };
  await chrome.storage.local.set({ codesByRegion: seeded });
  await chrome.storage.local.remove("customCodes");
}

async function refreshRemote() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  const url = (settings.codesUrl || "").trim();
  if (!url) return 0;
  if (!/^https:\/\/(raw|gist)\.githubusercontent\.com\//.test(url)) {
    throw new Error("Only raw.githubusercontent.com and gist.githubusercontent.com links are supported.");
  }
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const list = parseList(await res.json());
  await chrome.storage.local.set({ remoteCodes: list, remoteUpdatedAt: Date.now() });
  return list.length;
}

/*
 * The merged list. A code listed for several countries gets all of them as regions.
 * Country codes are tried only in that country; All countries codes are tried everywhere.
 */
async function getAllCodes() {
  await seedCodes();
  const { remoteCodes = [], codesByRegion = {}, settings = {} } =
    await chrome.storage.local.get(["remoteCodes", "codesByRegion", "settings"]);
  const lists = [];
  for (const [id, text] of Object.entries(codesByRegion)) {
    if (id !== "ALL") lists.push(parseCustom(text, id));
  }
  lists.push(parseCustom(codesByRegion.ALL, "ALL"));
  if (settings.codesUrl) lists.push(remoteCodes);

  const map = new Map();
  for (const list of lists) {
    for (const c of list) {
      const prev = map.get(c.code);
      if (!prev) { map.set(c.code, { ...c }); continue; }
      if (prev.regions && c.regions) prev.regions = [...new Set([...prev.regions, ...c.regions])];
      if (!prev.value && c.value) prev.value = c.value;
    }
  }
  return [...map.values()];
}

// ---------------------------------------------------------------- store settings
/*
 * Shipping country, currency and language live in AliExpress's "aep_usuc_f" cookie
 * (site=glo&c_tp=EUR&region=CZ&b_locale=en_US). Switching rewrites that cookie, asks AliExpress
 * to store the same values for the account, then reloads the tab so prices are recalculated.
 */
const STORE_COOKIE = "aep_usuc_f";
const ALI_URL = "https://www.aliexpress.com";

async function readStore() {
  const c = await chrome.cookies.get({ url: ALI_URL, name: STORE_COOKIE }).catch(() => null);
  return ACF.parseStoreCookie(c && c.value);
}

// Pages where reloading could interrupt a payment; never reload these
function isPaymentPage(url) {
  try {
    const u = new URL(url);
    return /^(pay|payment|cashier)\./.test(u.hostname) || u.hostname.includes("alipay.") ||
      /\/(second-payment|pay\/|cashier)/.test(u.pathname);
  } catch (e) { return true; }
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);

async function setStore(store, tabId) {
  // The settings cookie lives on aliexpress.com; other AliExpress sites keep their own settings
  if (tabId != null) {
    const t = await chrome.tabs.get(tabId).catch(() => null);
    const host = t && t.url ? new URL(t.url).hostname : "";
    if (/aliexpress\.(us|ru)$/.test(host)) throw new Error("switching works on aliexpress.com only; this tab is on " + host);
  }
  const region = String(store.region || "").toUpperCase();
  const currency = String(store.currency || "").toUpperCase();
  const language = String(store.language || "");
  if (!ACF.STORE.countries[region]) throw new Error("Unknown country");
  if (!ACF.STORE.currencies[currency]) throw new Error("Unknown currency");
  if (!ACF.STORE.languages[language]) throw new Error("Unknown language");

  // Keep unrelated fields of the existing cookie; drop the old city when the country changes
  const existing = await chrome.cookies.get({ url: ALI_URL, name: STORE_COOKIE }).catch(() => null);
  const params = new URLSearchParams(existing ? existing.value : "");
  if ((params.get("region") || "").toUpperCase() !== region) ["province", "city", "ups_d", "ups_u"].forEach((k) => params.delete(k));
  if (!params.get("site")) params.set("site", "glo");
  params.set("c_tp", currency);
  params.set("region", region);
  params.set("b_locale", language);

  // Remove host-only copies that would shadow the domain-wide cookie
  const all = await chrome.cookies.getAll({ name: STORE_COOKIE }).catch(() => []);
  for (const c of all) {
    if (c.domain !== ".aliexpress.com" && c.domain.endsWith("aliexpress.com")) {
      await chrome.cookies.remove({ url: `https://${c.domain.replace(/^\./, "")}${c.path}`, name: STORE_COOKIE }).catch(() => {});
    }
  }
  await chrome.cookies.set({
    url: ALI_URL, domain: ".aliexpress.com", path: "/", name: STORE_COOKIE,
    value: decodeURIComponent(params.toString()), secure: true, sameSite: "no_restriction",
    expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600
  });

  // Ask AliExpress to save the same settings server-side (best effort, at most 4 seconds)
  const q = new URLSearchParams({ fromApp: "false", currency, region, bLocale: language, site: "glo", province: "", city: "" });
  await withTimeout(Promise.allSettled([
    fetch(`https://login.aliexpress.com/setCommonCookie.htm?${q}`, { credentials: "include" }),
    fetch(`https://login.aliexpress.com/preference.htm?locale=${encodeURIComponent(language)}`, { credentials: "include" })
  ]), 4000);

  // The server sync can rewrite the cookie; make sure our values win
  const after = await chrome.cookies.get({ url: ALI_URL, name: STORE_COOKIE }).catch(() => null);
  const now = ACF.parseStoreCookie(after && after.value);
  if (now.region !== region || now.currency !== currency || now.language !== language) {
    await chrome.cookies.set({
      url: ALI_URL, domain: ".aliexpress.com", path: "/", name: STORE_COOKIE,
      value: decodeURIComponent(params.toString()), secure: true, sameSite: "no_restriction",
      expirationDate: Math.floor(Date.now() / 1000) + 365 * 24 * 3600
    });
  }
  await chrome.storage.local.set({ lastRegion: region });

  let reloaded = false;
  if (tabId != null) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab && /aliexpress\.(com|us|ru)/.test(tab.url || "") && !isPaymentPage(tab.url)) {
      await chrome.tabs.reload(tabId);
      reloaded = true;
    }
  }
  return { ok: true, reloaded, store: { region, currency, language } };
}
