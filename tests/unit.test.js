// Unit tests for the pure logic: parsing, classification, prices, favourites, cookies.
// Run: node tests/unit.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const EXT = path.join(__dirname, "..", "extension");
global.document = { cookie: "" };
for (const f of ["lib/config.js", "lib/regions.js", "lib/store-data.js", "lib/dom.js"]) require(`${EXT}/${f}`);
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log("FAIL", name, "\n   ", e.message); } };

// ---------- Telegram post parsing
const post = fs.readFileSync(path.join(__dirname, "fixtures", "post.txt"), "utf8");
const P = ACF.parsePost(post);
t("post: countries detected", () => assert.deepStrictEqual(Object.keys(P).sort(), ["ALL", "CZ", "DE", "PL", "UA"]));
t("post: counts", () => assert.deepStrictEqual([P.UA.length, P.PL.length, P.DE.length, P.CZ.length, P.ALL.length], [7, 14, 7, 7, 7]));
t("post: PL alternative codes share value/min", () => {
  const a = P.PL.find((c) => c.code === "PLLD02"), b = P.PL.find((c) => c.code === "AFCEOCD2");
  assert.strictEqual(a.value, 1.81); assert.strictEqual(b.value, 1.81); assert.strictEqual(a.minOrder, 16.25);
});
t("post: global expiry from heading", () => assert.ok(P.ALL.every((c) => c.expires && c.expires.slice(5, 10) === "10-08")));
t("post: country codes have no expiry", () => assert.ok(P.DE.every((c) => !c.expires)));
t("post: dollar values", () => assert.deepStrictEqual(P.UA.map((c) => c.value), [2, 3, 5, 8, 14, 25, 33]));
t("post: English headings", () => {
  const r = ACF.parsePost("🇩🇪 Germany (DE)\nDEPRD60 — 60€ from 475€\nGlobal codes (until 8 October):\nIFPXXXX1 — $2 from $18");
  assert.strictEqual(r.DE[0].minOrder, 475); assert.strictEqual(r.ALL[0].code, "IFPXXXX1"); assert.ok(r.ALL[0].expires);
});
t("post: codes before any heading go to ALL", () => assert.deepStrictEqual(Object.keys(ACF.parsePost("ABCD1234 5")), ["ALL"]));
t("post: flag emoji of unknown country", () => assert.ok(ACF.parsePost("🇸🇰 Slovensko\nSKCODE12 5").SK));
t("post: case of codes preserved", () => assert.strictEqual(ACF.parsePost("SUMMERx9 10").ALL[0].code, "SUMMERx9"));
t("post: capital headings, GB flag, names, global", () => {
  const r = ACF.parsePost(["🇵🇱 POLAND (PL)", "PLLD02 — 1.81€ від 16.25€", "🇬🇧 United Kingdom", "UKAB12 — £5 from £40",
    "France (FR)", "FRXY12 — 5€ from 40€", "GLOBAL CODES", "IFPX12 — $2 from $18", "Slovakia", "SKCODE1 3", "🇩🇪 GERMANY", "DEPRD60 — 60€ from 475€"].join("\n"));
  assert.deepStrictEqual(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map((c) => c.code)])),
    { PL: ["PLLD02"], UK: ["UKAB12"], FR: ["FRXY12"], ALL: ["IFPX12"], SK: ["SKCODE1"], DE: ["DEPRD60"] });
});
t("post: plain words are not codes without a discount", () => assert.deepStrictEqual(ACF.parsePost("HELLO THERE\nABCD1234 5"), { ALL: [{ code: "ABCD1234", value: 5, minOrder: undefined, expires: undefined }] }));
t("post: empty", () => assert.deepStrictEqual(ACF.parsePost(""), {}));

// ---------- stored text round trip
t("format/parse round trip", () => {
  for (const list of Object.values(P)) {
    const back = ACF.parseCodeText(list.map(ACF.formatCode).join("\n"));
    assert.strictEqual(back.bad, 0);
    assert.deepStrictEqual(back.codes.map((c) => [c.code, c.value, c.minOrder, c.expires]), list.map((c) => [c.code, c.value || 0, c.minOrder, c.expires]));
  }
});
t("parseCodeText: comments, headings, junk", () => {
  const r = ACF.parseCodeText("# Imported 01.10\n70\nIFPAAAA1\n\n50\nIFPBBBB2 40\nкривий рядок\n!!!\nPLAIN");
  assert.deepStrictEqual(r.codes.map((c) => [c.code, c.value]), [["IFPAAAA1", 70], ["IFPBBBB2", 40], ["PLAIN", 0]]);
  assert.strictEqual(r.bad, 1);
});
t("parseCodeText: legacy Ukrainian format still read", () => {
  const c = ACF.parseCodeText("DEPRD60 60 від 475 до 08.10.2026").codes[0];
  assert.strictEqual(c.minOrder, 475); assert.ok(c.expires.startsWith("2026-10-08"));
});
t("summarizeCodes", () => assert.strictEqual(ACF.summarizeCodes(P.ALL), "7 codes, 2–60 off, until 08.10"));

// ---------- message classification (first match wins)
const cls = (s) => { const o = ACF.CONFIG.outcomes.find((x) => x.re.test(s.toLowerCase())); return o && o.id; };
const cases = {
  "You've already applied this coupon code": "applied_now",
  "Sorry, this code has been used up.": "used_up",
  "This code isn't available in your country or region.": "region",
  "The promo code is invalid.": "invalid",
  "Order must be at least US $50": "min_order",
  "This promo code has expired": "expired",
  "Too many attempts, please try again later": "rate_limit",
  "Dieser Code ist leider aufgebraucht.": "used_up",
  "Der Code ist ungültig.": "invalid",
  "Ten kod został już wykorzystany": "already",
  "Kod jest nieprawidłowy": "invalid",
  "Tento kód je neplatný": "invalid",
  "Промокод вичерпано": "used_up",
  "Promo code applied": undefined
};
for (const [msg, want] of Object.entries(cases)) t(`classify: ${msg}`, () => assert.strictEqual(cls(msg), want));

// ---------- prices
const pp = ACF.dom.parsePrice;
const prices = { "US $12.34": 12.34, "12,34 €": 12.34, "1 234,56 грн": 1234.56, "UAH 1,234.56": 1234.56, "₴1.234,56": 1234.56,
  "2.554,10€": 2554.1, "€2,554.10": 2554.1, "PLN 1 294,00": 1294, "1294 Kč": 1294, "Total: 15": 15, "no price": null };
for (const [s, v] of Object.entries(prices)) t(`price: ${s}`, () => assert.strictEqual(pp(s), v));
t("totalLabels", () => {
  for (const s of ["total", "gesamtsumme", "razem", "celkem", "всього", "итого"]) assert.ok(ACF.CONFIG.totalLabels.test(s), s);
  for (const s of ["subtotal", "shipping fee"]) assert.ok(!ACF.CONFIG.totalLabels.test(s), s);
});

// ---------- store cookie and favourites
t("parseStoreCookie", () => assert.deepStrictEqual(ACF.parseStoreCookie("site=glo&c_tp=eur&region=cz&b_locale=en_US"), { region: "CZ", currency: "EUR", language: "en_US" }));
t("parseStoreCookie empty", () => assert.deepStrictEqual(ACF.parseStoreCookie(""), { region: null, currency: null, language: null }));
t("favourites default", () => assert.deepStrictEqual(ACF.normalizeFavorites(undefined), ACF.DEFAULT_FAVORITES));
t("favourites drop invalid + dupes", () => assert.deepStrictEqual(
  ACF.normalizeFavorites({ countries: ["PL", "XX", "PL"], currencies: ["EUR", "ZZZ"], languages: ["xx_XX"] }),
  { countries: ["PL"], currencies: ["EUR"], languages: [] }));
t("store data sizes", () => assert.ok(Object.keys(ACF.STORE.countries).length > 200 && ACF.STORE.currencies.CZK && ACF.STORE.languages.pl_PL));

console.log(`\nUNIT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
