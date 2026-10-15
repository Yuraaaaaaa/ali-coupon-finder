/* Small helpers for working with the page DOM. */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.dom = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Lower case, single spaces, and typographic apostrophes as plain ones ("Yes I’m sure" = "yes i'm sure")
  const norm = (s) => (s || "").replace(/[‘’ʼ`´]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();

  // Short text of a small element, or "" for containers (cheap: no layout, no copy of big subtrees)
  const shortText = (el, max = 60) => {
    if (el.childElementCount > 2) return "";
    const raw = el.textContent;
    return raw && raw.length <= max ? raw : "";
  };

  // Text drawn in red (AliExpress shows promo code errors in red under the field)
  function reddish(el) {
    const m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g);
    if (!m) return false;
    const [r, g, b] = m.map(Number);
    return r >= 170 && g < 120 && b < 120;
  }

  // Normalised text of an element, for buttons and labels
  const textOf = (el) => norm(el && (el.innerText || el.textContent));

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) !== 0;
  }

  function enabled(el) {
    const cls = typeof el.className === "string" ? el.className : "";
    return !el.disabled && el.getAttribute("aria-disabled") !== "true" && !/(^|[\s-])disabled\b/i.test(cls);
  }

  // Smallest visible elements whose text exactly matches one of the options
  function findByText(texts, root = document, selector = "button,[role='button'],a,span,div") {
    const wanted = new Set(texts.map(norm));
    const wantedList = [...wanted];
    const hits = [];
    for (const el of root.querySelectorAll(selector)) {
      // Cheap checks first: big containers are skipped without laying out or copying their text
      if (el.childElementCount > 4) continue;
      const raw = el.textContent;
      if (!raw || raw.length > 120) continue;
      // Compare the raw text first; the rendered text (which needs layout) only when it may match
      const quick = norm(raw);
      if (!wanted.has(quick) && !wantedList.some((w) => quick.includes(w))) continue;
      if (el.closest("#acf-host")) continue;
      const t = wanted.has(quick) ? quick : textOf(el);
      if (!t || t.length > 40 || !wanted.has(t)) continue;
      if (!visible(el)) continue;
      hits.push(el);
    }
    hits.sort((a, b) => area(a) - area(b));
    return hits;
  }

  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };

  // Clickable ancestor (or the element itself)
  const clickable = (el) => el.closest("button,[role='button'],a") || el;

  // Full click sequence: some AliExpress components react to pointerdown/mousedown, not click
  function press(el) {
    if (!el) return false;
    try { el.scrollIntoView({ block: "center", behavior: "auto" }); } catch (e) {}
    const r = el.getBoundingClientRect();
    const opts = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0
    };
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.click();
      return true;
    } catch (e) {
      console.warn("[ACF] click error", e);
      return false;
    }
  }

  // Sets the value so that React/Vue notice the change
  function setInputValue(input, value) {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    input.focus();
    setter.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Waits until fn() returns something truthy (or null on timeout)
  async function waitFor(fn, timeout, poll = 150) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(poll);
    }
    return null;
  }

  /*
   * Parses a price in any common format:
   * "US $12.34", "12,34 €", "1 234,56 грн", "UAH 1,234.56", "₴1.234,56"
   */
  function parsePrice(text) {
    if (!text) return null;
    const m = String(text).replace(/ | /g, " ").match(/\d[\d\s.,]*\d|\d/);
    if (!m) return null;
    let s = m[0].replace(/\s/g, "");
    const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
    if (lastComma > -1 && lastDot > -1) {
      const dec = lastComma > lastDot ? "," : ".";
      const thou = dec === "," ? "." : ",";
      s = s.split(thou).join("").replace(dec, ".");
    } else if (lastComma > -1 || lastDot > -1) {
      const sep = lastComma > -1 ? "," : ".";
      const parts = s.split(sep);
      const tail = parts[parts.length - 1];
      // one separator followed by 1–2 digits: decimal
      s = (parts.length === 2 && tail.length <= 2) ? parts.join(".") : parts.join("");
    }
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  /*
   * Currency of a price as written on the page: "US $719.04 (≈ грн.35,530.00)" → USD.
   * Only the main price is looked at, not an approximation after it. null if it can't be told.
   */
  const CURRENCY_MARKS = [
    [/US\s?\$|USD/, "USD"], [/C\$|CA\$|CAD/, "CAD"], [/A\$|AU\$|AUD/, "AUD"], [/NZ\$|NZD/, "NZD"], [/MX\$|MXN/, "MXN"],
    [/€|EUR/, "EUR"], [/zł|PLN/i, "PLN"], [/Kč|CZK/, "CZK"], [/₴|грн|UAH/i, "UAH"], [/£|GBP/, "GBP"],
    [/₽|руб|RUB/i, "RUB"], [/HUF|\bFt\b/, "HUF"], [/RON|\blei\b/i, "RON"], [/CHF/, "CHF"], [/₺|TRY/, "TRY"],
    [/лв|BGN/, "BGN"], [/₪|ILS/, "ILS"], [/R\$|BRL/, "BRL"], [/₩|KRW/, "KRW"], [/¥|JPY/, "JPY"], [/SEK/, "SEK"], [/NOK/, "NOK"], [/DKK/, "DKK"],
    [/\$/, "USD"]
  ];
  function detectCurrency(text) {
    if (!text) return null;
    const s = String(text).replace(/\u00a0|\u202f/g, " ");
    const m = s.match(/\d[\d\s.,]*\d|\d/);
    if (!m) return null;
    // The main price: everything before its number and a few characters after it, up to an opening bracket
    const seg = (s.slice(0, m.index) + m[0] + s.slice(m.index + m[0].length).split(/[(≈]/)[0].slice(0, 6)).slice(-40);
    for (const [re, code] of CURRENCY_MARKS) if (re.test(seg)) return code;
    return null;
  }

  /*
   * Country of the shipping address on the checkout page (AliExpress id, e.g. "UA"), or null.
   * On checkout AliExpress uses this address, not the "Ship to" setting, so codes must match it.
   * Country names are matched in the page's language and in English, Ukrainian, Polish, German, Czech and Russian;
   * the last name in the address wins, as the country comes at its end.
   */
  let countryNames = null;
  function countryNameList() {
    if (countryNames) return countryNames;
    const map = new Map();
    const langs = [...new Set([(document.documentElement.lang || "en").slice(0, 2), "en", "uk", "pl", "de", "cs", "ru"])];
    const S = ACF.STORE ? ACF.STORE.countries : {};
    for (const [id, english] of Object.entries(S)) {
      map.set(english.toLowerCase(), id);
      const iso = (ACF.ISO_OF && ACF.ISO_OF[id]) || id;
      if (!/^[A-Z]{2}$/.test(iso)) continue;
      for (const l of langs) {
        try { const n = new Intl.DisplayNames([l], { type: "region", fallback: "none" }).of(iso); if (n) map.set(n.toLowerCase(), id); } catch (e) {}
      }
    }
    map.set("united states of america", "US"); map.set("usa", "US"); map.set("czech republic", "CZ"); map.set("great britain", "UK");
    countryNames = [...map.entries()].filter(([n]) => n.length >= 4).sort((a, b) => b[0].length - a[0].length);
    return countryNames;
  }

  function addressCountry() {
    const re = ACF.CONFIG.shippingLabels;
    const label = [...document.querySelectorAll("h1,h2,h3,h4,div,span,p,b,strong")].find((el) =>
      el.childElementCount <= 1 && shortText(el, 40) && re.test(norm(el.textContent)) && !el.closest("#acf-host"));
    if (!label) return null;
    let box = label.parentElement, text = "";
    for (let i = 0; i < 3 && box; i++, box = box.parentElement) {
      const tc = box.textContent || "";
      if (tc.length > 700) break;
      text = tc;
    }
    if (!text) return null;
    const hay = text.toLowerCase();
    let best = null;
    for (const [name, id] of countryNameList()) {
      let at = -1, from = 0, i;
      while ((i = hay.indexOf(name, from)) !== -1) {
        const before = hay[i - 1] || " ", after = hay[i + name.length] || " ";
        if (!/\p{L}/u.test(before) && !/\p{L}/u.test(after)) at = i;
        from = i + 1;
      }
      if (at > -1 && (!best || at > best.at)) best = { at, id };
    }
    return best ? best.id : null;
  }

  // Short CSS path to an element (for the manual order total)
  function cssPath(el) {
    const parts = [];
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 8) {
      if (el.id && !/\d{3,}/.test(el.id)) { parts.unshift("#" + CSS.escape(el.id)); break; }
      let part = el.tagName.toLowerCase();
      const stable = [...el.classList].filter((c) => !/\d{3,}|--|__[a-z0-9]{5,}$/i.test(c)).slice(0, 2);
      if (stable.length) part += "." + stable.map(CSS.escape).join(".");
      const parent = el.parentElement;
      if (parent) {
        const same = [...parent.children].filter((c) => c.tagName === el.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(el) + 1})`;
      }
      parts.unshift(part);
      el = parent;
    }
    return parts.join(" > ");
  }

  // Shipping country and currency from the AliExpress cookie (aep_usuc_f=site=glo&c_tp=USD&region=UA&...)
  function aliRegion() {
    const m = document.cookie.match(/aep_usuc_f=([^;]+)/);
    if (!m) return { region: null, currency: null };
    const p = new URLSearchParams(decodeURIComponent(m[1]));
    return { region: p.get("region"), currency: p.get("c_tp") };
  }

  // Shipping country, currency and language from the same cookie
  function aliStore() {
    const m = document.cookie.match(/aep_usuc_f=([^;]+)/);
    return ACF.parseStoreCookie ? ACF.parseStoreCookie(m ? decodeURIComponent(m[1]) : "") : {};
  }

  return { aliStore, addressCountry, detectCurrency, shortText, sleep, norm, reddish, textOf, visible, enabled, findByText, clickable, press, setInputValue, waitFor, parsePrice, cssPath, aliRegion };
})();
