/* Small helpers for working with the page DOM. */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.dom = (() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

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
    const hits = [];
    for (const el of root.querySelectorAll(selector)) {
      if (el.closest("#acf-host")) continue;
      const t = textOf(el);
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

  return { aliStore, sleep, norm, textOf, visible, enabled, findByText, clickable, press, setInputValue, waitFor, parsePrice, cssPath, aliRegion };
})();
