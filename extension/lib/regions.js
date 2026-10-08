/* Countries with their own code lists, and parsing of code text. */
var ACF = globalThis.ACF || (globalThis.ACF = {});

// To add a country, add a line (id = the country code AliExpress uses).
ACF.REGIONS = [
  { id: "ALL", name: "All countries", short: "All", re: /глобальн|global|усі країни|всі країни|all countries/i },
  { id: "UA", name: "Ukraine", short: "UA", re: /україн|ukrain|\(ua\)/i },
  { id: "PL", name: "Poland", short: "PL", re: /польщ|polsk|poland|polska|\(pl\)/i },
  { id: "DE", name: "Germany", short: "DE", re: /німеч|german|deutschland|\(de\)/i },
  { id: "CZ", name: "Czechia", short: "CZ", re: /чехі|czech|česk|\(cz\)/i }
];

(() => {
  const MONTHS = {
    січ: 1, лют: 2, берез: 3, квіт: 4, трав: 5, черв: 6, лип: 7, серп: 8, верес: 9, жовт: 10, листоп: 11, груд: 12,
    янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12,
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
    sty: 1, lut: 2, kwi: 4, maj: 5, cze: 6, lip: 7, sie: 8, wrz: 9, paź: 10, paz: 10, lis: 11, gru: 12,
    januar: 1, februar: 2, märz: 3, mai: 5, juni: 6, juli: 7, okt: 10, dez: 12
  };
  const STOP = new Set(["PROMO", "CODE", "CODES", "COUPON", "USD", "EUR", "PLN", "CZK", "UAH", "ORDER", "ORDERS",
    "OVER", "FROM", "WITH", "AUTO", "APPLY", "ENTER", "TOTAL", "FREE", "SALE", "SAVE", "OFF"]);
  const KW_MIN = /^(від|вiд|from|od|ab|min|мін|мин|от|over)$/i;
  const KW_UNTIL = /^(до|until|till|do|bis|exp|expires|ends)$/i;
  const NUM = /^[$€₴]?(\d{1,5}(?:[.,]\d{1,2})?)(?:[$€₴]|usd|eur|zł|zl|pln|kč|czk|грн)?$/i;

  const isCode = (t) =>
    /^[A-Za-z0-9_-]{4,32}$/.test(t) && /[A-Za-z]/.test(t) &&
    (/\d/.test(t) || t === t.toUpperCase()) && !STOP.has(t.toUpperCase());

  // "08.10", "8.10.2026", or ["8", "October"] in several languages
  function parseDate(tok, next) {
    let d, m, y;
    let mm = tok.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
    if (mm) { d = +mm[1]; m = +mm[2]; y = mm[3] ? +mm[3] : null; }
    else if (/^\d{1,2}$/.test(tok) && next) {
      const key = Object.keys(MONTHS).find((k) => next.toLowerCase().startsWith(k));
      if (!key) return null;
      d = +tok; m = MONTHS[key];
    } else return null;
    if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12)) return null;
    const now = new Date();
    if (!y) {
      y = now.getFullYear();
      if (new Date(y, m - 1, d) < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 60)) y++;
    } else if (y < 100) y += 2000;
    // Valid until the end of that day
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T23:59:59`;
  }

  // Country from a flag emoji 🇵🇱 (two regional indicator letters)
  function flagRegion(line) {
    const cps = [...line].map((c) => c.codePointAt(0));
    for (let i = 0; i < cps.length - 1; i++) {
      if (cps[i] >= 0x1f1e6 && cps[i] <= 0x1f1ff && cps[i + 1] >= 0x1f1e6 && cps[i + 1] <= 0x1f1ff) {
        return String.fromCharCode(cps[i] - 0x1f1e6 + 65, cps[i + 1] - 0x1f1e6 + 65);
      }
    }
    return null;
  }

  /*
   * Parses one line. Understands:
   *   PLLD02 / AFCEOCD2 — 1.81€ від 16.25€     (two alternative codes, same discount)
   *   IFP1YW16 — $2 from $18
   *   IFPXXXX 70                                (code and discount only)
   *   IFPXXXX 2 min 18 until 08.10.2026         (how the extension stores codes)
   * Returns { codes, value, minOrder, expires, words }.
   */
  function parseLine(line) {
    const toks = line.split(/[\s,;|/]+/)
      .map((t) => t.replace(/^[^\p{L}\p{N}$€₴]+|[^\p{L}\p{N}$€₴.]+$/gu, "").replace(/\.$/, ""))
      .filter(Boolean);
    const out = { codes: [], value: null, minOrder: null, expires: null, words: 0 };
    let mode = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (KW_MIN.test(t)) { mode = "min"; continue; }
      if (KW_UNTIL.test(t)) {
        const date = parseDate(toks[i + 1] || "", toks[i + 2]);
        if (date) { out.expires = date; i += /^\d{1,2}$/.test(toks[i + 1]) && !/[./]/.test(toks[i + 1]) ? 2 : 1; }
        continue;
      }
      const n = t.match(NUM);
      if (n) {
        const v = parseFloat(n[1].replace(",", "."));
        if (mode === "min") { if (out.minOrder == null) out.minOrder = v; }
        else if (out.value == null) out.value = v;
        mode = null;
        continue;
      }
      if (isCode(t)) { out.codes.push(t); continue; }
      if (/\p{L}{2,}/u.test(t)) out.words++;
    }
    return out;
  }

  // One country's text list (Codes tab) → codes
  ACF.parseCodeText = function (text) {
    const codes = [];
    let bad = 0, current = 0, sectionExpires = null;
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("//")) continue;
      if (line.startsWith("#")) continue;
      const p = parseLine(line);
      if (!p.codes.length) {
        if (p.value != null && !p.words) current = p.value;    // a line with only a number sets the discount for the codes below
        else if (p.expires) sectionExpires = p.expires;        // e.g. "Global codes (until 8 October)"
        else if (p.words) { current = 0; }                     // section heading: reset the discount
        else bad++;
        continue;
      }
      for (const code of p.codes) {
        codes.push({ code, value: p.value ?? current, minOrder: p.minOrder ?? undefined, expires: p.expires || sectionExpires || undefined });
      }
    }
    return { codes, bad };
  };

  // Flag emoji give ISO codes; AliExpress uses its own ids for a few countries
  const ISO_TO_ALI = { GB: "UK", RS: "SRB", ME: "MNE", AX: "ALA", GG: "GGY", JE: "JEY", BL: "BLM", MF: "MAF", GS: "SGS", TL: "TLS", XK: "KS", CD: "ZR" };
  const toAli = (id) => ISO_TO_ALI[id] || id;
  const known = (id) => id && (!ACF.STORE || ACF.STORE.countries[id]) ? id : null;

  // English country names from the store list, longest first, matched as whole words
  let nameIndex = null;
  function countryByName(line) {
    if (!ACF.STORE) return null;
    if (!nameIndex) {
      nameIndex = Object.entries(ACF.STORE.countries)
        .filter(([, n]) => n.length >= 4)
        .map(([id, n]) => [id, new RegExp(`(^|[^\\p{L}])${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u"), n.length])
        .sort((x, y) => y[2] - x[2]);
    }
    const low = line.toLowerCase();
    const hit = nameIndex.find(([, re]) => re.test(low));
    return hit ? hit[0] : null;
  }

  /*
   * Is this line a country heading? Lines with a code that contains a digit never are.
   * Checked in order: flag emoji, "(PL)" in brackets, names in several languages
   * (including "Global"), then English country names.
   */
  function headingRegion(line, p) {
    if (p.codes.some((c) => /\d/.test(c))) return null;
    const flag = flagRegion(line);
    if (flag) return toAli(flag);
    const br = line.match(/\(([A-Za-z]{2,3})\)/);
    if (br && known(toAli(br[1].toUpperCase()))) return toAli(br[1].toUpperCase());
    const r = ACF.REGIONS.find((x) => x.re.test(line));
    if (r) return r.id;
    return countryByName(line);
  }

  /*
   * Parses a whole post (Telegram, a website…) and sorts codes into countries
   * by its headings: "🇵🇱 Poland (PL)", "GERMANY", "Global codes (until 8 October)".
   * Codes before the first heading go to All countries.
   */
  ACF.parsePost = function (text) {
    const byRegion = {};
    let region = "ALL", sectionExpires = null;
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const p = parseLine(line);
      const heading = headingRegion(line, p);
      if (heading) { region = heading; sectionExpires = p.expires; continue; }
      // In a post, a word without digits only counts as a code when the line also has a discount
      const codes = p.codes.filter((c) => /\d/.test(c) || p.value != null);
      if (!codes.length) {
        if (p.expires) sectionExpires = p.expires;
        continue;
      }
      (byRegion[region] = byRegion[region] || []);
      for (const code of codes) {
        byRegion[region].push({ code, value: p.value ?? 0, minOrder: p.minOrder ?? undefined, expires: p.expires || sectionExpires || undefined });
      }
    }
    return byRegion;
  };

  // How a code is written to a country list (and read back by parseCodeText)
  ACF.formatCode = function (c) {
    let s = c.code;
    if (c.value) s += " " + c.value;
    if (c.minOrder) s += " min " + c.minOrder;
    if (c.expires) {
      const [y, m, d] = c.expires.slice(0, 10).split("-");
      s += ` until ${d}.${m}.${y}`;
    }
    return s;
  };

  ACF.fmtDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}.${m}`; };

  // Short description of a list, e.g. "7 codes, 2–60 off, until 08.10"
  ACF.summarizeCodes = function (codes) {
    if (!codes.length) return "No codes";
    const vals = codes.map((c) => c.value).filter(Boolean);
    const parts = [`${codes.length} ${codes.length === 1 ? "code" : "codes"}`];
    if (vals.length) {
      const fmt = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
      const lo = Math.min(...vals), hi = Math.max(...vals);
      parts.push(lo === hi ? `${fmt(hi)} off` : `${fmt(lo)}–${fmt(hi)} off`);
    }
    const exp = codes.map((c) => c.expires).filter(Boolean).sort()[0];
    if (exp) parts.push(`until ${ACF.fmtDate(exp)}`);
    return parts.join(", ");
  };
})();
