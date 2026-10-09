"""End-to-end tests: the real extension in Chromium against a configurable fake checkout page.

Setup:  pip install playwright && python -m playwright install chromium
Run:    python tests/e2e.py              (all scenarios)
        python tests/e2e.py s_captcha    (one scenario)
        SCHEME=dark python tests/e2e.py  (dark mode)
Screenshots go to tests/output/.
"""
import asyncio, base64, json, os, sys, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).resolve().parent
EXT = str(HERE.parent / "extension")
TPL = (HERE / "fixtures" / "mock_template.html").read_text(encoding="utf-8")
POST = (HERE / "fixtures" / "post.txt").read_text(encoding="utf-8")
OUT = str(HERE / "output")
SCHEME = os.environ.get("SCHEME", "light")
ONLY = sys.argv[1:]
P = "#acf-host"
os.makedirs(OUT, exist_ok=True)

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("  PASS " if cond else "  FAIL ") + name + ("" if cond else f"  [{detail}]"))

def url(cfg, host="www.aliexpress.com"):
    return f"https://{host}/p/trade/confirm.html?cfg=" + base64.b64encode(json.dumps(cfg).encode()).decode()

class Env:
    async def start(self, p):
        self.ctx = await p.chromium.launch_persistent_context(tempfile.mkdtemp(prefix="acf-e2e-"), channel="chromium", headless=True,
            color_scheme=SCHEME, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width": 1280, "height": 860})
        for host in ("www.aliexpress.com", "www.aliexpress.us"):
            await self.ctx.route(f"https://{host}/p/trade/confirm.html*", lambda r: r.fulfill(body=TPL, content_type="text/html"))
        await self.ctx.route("https://login.aliexpress.com/**", lambda r: r.fulfill(body="ok", content_type="text/plain"))
        self.sw = self.ctx.service_workers[0] if self.ctx.service_workers else await self.ctx.wait_for_event("serviceworker")
        await asyncio.sleep(1)
        self.ext = self.sw.url.split("/")[2]
        self.errors = []

    async def store(self, data):
        await self.sw.evaluate("d => chrome.storage.local.set(d)", data)

    async def get(self, key):
        return await self.sw.evaluate("async k => (await chrome.storage.local.get(k))[k]", key)

    async def reset(self, codes, settings=None):
        s = {"autoConfirm": True, "skipDead": True, "betweenCodes": 200, "huntPause": 2500, "huntMinutes": 60, "totalSelectors": {}}
        s.update(settings or {})
        await self.sw.evaluate("() => chrome.storage.local.remove(['codeStats','hunt','history'])")
        await self.store({"codesByRegion": codes, "settings": s})

    async def cookie(self, region="DE", currency="EUR", host=".aliexpress.com"):
        await self.ctx.add_cookies([{"name": "aep_usuc_f", "value": f"site=glo&c_tp={currency}&region={region}&b_locale=en_US",
                                     "domain": host, "path": "/", "secure": True}])

    async def checkout(self, cfg, host="www.aliexpress.com", open_panel=True):
        page = await self.ctx.new_page()
        page.on("pageerror", lambda e: self.errors.append(f"page: {e}"))
        await page.goto(url(cfg, host))
        await page.wait_for_selector(P, state="attached")
        await asyncio.sleep(0.8)
        if open_panel:
            await page.locator(f"{P} .launcher").click()
            await asyncio.sleep(0.4)
        return page

    async def popup(self, target_page=None, width=360):
        pop = await self.ctx.new_page()
        pop.on("pageerror", lambda e: self.errors.append(f"popup: {e}"))
        await pop.set_viewport_size({"width": width, "height": 640})
        await pop.goto(f"chrome-extension://{self.ext}/popup/popup.html")
        if target_page is not None:
            # A popup normally talks to the active tab; point it at the checkout page under test
            await pop.evaluate("""async (u) => { const t = (await chrome.tabs.query({})).find(x => x.url === u); chrome.tabs.query = async () => [t]; }""", target_page.url)
            await pop.evaluate("initSearch().then(loadStore)")
            await asyncio.sleep(1.2)
        return pop

async def start(page, mode):
    await page.locator(f"{P} .mode[data-arg={mode}]").click()
    await asyncio.sleep(0.8)

async def wait_idle(page, timeout=60000):
    await page.wait_for_function(f"""() => {{ const r = document.querySelector('{P}').shadowRoot;
        return r.querySelector('.run').hidden && r.querySelector('.result').innerHTML.trim().length > 0; }}""", timeout=timeout)

async def text(page, sel):
    return (await page.locator(f"{P} {sel}").inner_text()).replace("\n", " | ")

async def rows(page):
    return await page.evaluate(f"""() => Object.fromEntries([...document.querySelector('{P}').shadowRoot.querySelectorAll('.results tbody tr')]
        .map(tr => [tr.cells[0].innerText.trim(), tr.cells[2].innerText.trim()]))""")

async def page_total(page):
    return await page.locator("#total").inner_text()

async def shot(page, name, clip=True):
    kw = {"clip": {"x": 880, "y": 100, "width": 400, "height": 760}} if clip else {"full_page": True}
    await page.screenshot(path=f"{OUT}/{SCHEME}-{name}.png", **kw)

DE_CODES = {"ALL": "", "DE": "DEA60 60 min 100\nDEX70 70\nDEB45 45\nDEC20 20"}
BASE = {"lang": "en", "subtotal": 150, "valid": {"DEB45": 45, "DEC20": 20, "DEA60": 60}, "errors": {"DEX70": "region"}, "quota": {"DEA60": 3}}

# ------------------------------------------------------------------ scenarios
async def s_quick_and_wait(E):
    """Quick search finds the best available code; waiting gets the sold-out bigger one; survives a reload."""
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout(BASE)
    facts = await text(page, ".facts")
    check("panel shows country, currency and code count", "Germany" in facts and "US$150.00" not in facts and "4" in facts, facts)
    await shot(page, "01-idle")
    await start(page, "quick"); await wait_idle(page)
    res = await text(page, ".result")
    check("quick search picks DEB45 (biggest available)", "DEB45" in res and "−" in res, res)
    check("page total lowered by 45", await page_total(page) == "US $105.00", await page_total(page))
    r = await rows(page)
    check("wrong-country and sold-out codes classified", r.get("DEX70") == "Wrong country" and r.get("DEA60") == "Sold out", r)
    check("offer to wait for the bigger sold-out code", "DEA60" in res and "Wait and retry" in res, res)
    await shot(page, "02-quick-done")
    await page.locator(f"{P} [data-act=huntExhausted]").click()
    await asyncio.sleep(1.0)
    check("waiting state is persisted for reloads", bool(await E.get("hunt")))
    await shot(page, "03-waiting")
    await page.reload(); await page.wait_for_selector(P, state="attached")
    await page.wait_for_function(f"() => document.querySelector('{P}').shadowRoot.querySelector('.panel') && !document.querySelector('{P}').shadowRoot.querySelector('.panel').hidden", timeout=15000)
    check("waiting resumes by itself after reload", True)
    await page.wait_for_function(f"() => /Round|applied/.test(document.querySelector('{P}').shadowRoot.querySelector('.run-msg').innerText)", timeout=15000)
    msg = await text(page, ".run-msg")
    rws = await rows(page)
    check("after reload it still knows which code is applied", "DEB45 is applied" in msg or rws.get("DEB45") == "Works", f"{msg} / {rws}")
    await wait_idle(page, 60000)
    res = await text(page, ".result")
    check("waiting applies DEA60 once its limit refills", "DEA60" in res, res)
    check("saving measured from the original total", "60.00" in res, res)
    check("page total lowered by 60", await page_total(page) == "US $90.00", await page_total(page))
    check("wait state cleared when done", not await E.get("hunt"))
    hist = await E.get("history") or []
    check("history records working codes", {"DEB45", "DEA60"} <= {h["code"] for h in hist}, [h["code"] for h in hist])
    await shot(page, "04-wait-done")
    await page.close()

async def s_wait_rounds(E):
    """Waiting tries all sold-out codes back to back, then pauses once per round."""
    codes = "SOLD70 70\nSOLD60 60\nSOLD50 50"
    # A long per-code delay that must NOT be used while waiting, and a 6 s pause between rounds
    await E.reset({"ALL": "", "DE": codes}, {"betweenCodes": 9000, "huntPause": 12000, "huntCollect": False}); await E.cookie()
    page = await E.checkout({**BASE, "valid": {"SOLD50": 50}, "errors": {}, "quota": {"SOLD70": 99, "SOLD60": 99, "SOLD50": 3}})
    await start(page, "hunt")
    await page.wait_for_function("window.__log.length >= 6", timeout=60000)
    times = await page.evaluate("window.__times"); log = await page.evaluate("window.__log")
    gaps = [round((b - a) / 1000, 1) for a, b in zip(times, times[1:])]
    check("each round tries every sold-out code in order", log[:6] == ["SOLD70", "SOLD60", "SOLD50"] * 2, log[:6])
    inner = [gaps[0], gaps[1], gaps[3], gaps[4]]
    check("1.5–2.5 s random delay between codes in a round (not the 9 s search delay)", min(inner) >= 1.5 and max(inner) < 5.5, gaps)
    check("one longer pause between rounds (12 s)", gaps[2] >= 12 and gaps[2] < 18, gaps)
    await page.wait_for_function(f"() => /SOLD50 is applied/.test(document.querySelector('{P}').shadowRoot.querySelector('.run-msg').innerText)", timeout=60000)
    msg = await text(page, ".run-msg")
    check("applies the code when it frees up, then keeps waiting for bigger ones", "Waiting for SOLD70 and SOLD60" in msg, msg)
    await page.locator(f"{P} .run-stop").click()
    await page.close()

async def s_collect(E):
    """Collect mode: every sold-out code is applied once it frees up, smaller ones too; the biggest ends on the order."""
    await E.reset({"ALL": "", "DE": "SOLD70 70\nSOLD50 50\nSOLD20 20"}, {"huntPause": 3000}); await E.cookie()
    page = await E.checkout({**BASE, "valid": {"SOLD70": 70, "SOLD50": 50, "SOLD20": 20}, "errors": {}, "quota": {"SOLD50": 3, "SOLD20": 2}})
    await start(page, "hunt")
    await page.wait_for_function(f"() => /Collected 1 of 3/.test(document.querySelector('{P}').shadowRoot.querySelector('.run-msg').innerText)", timeout=30000)
    await shot(page, "14-collecting")
    msg = await text(page, ".run-msg")
    check("keeps collecting after the biggest code applied", "Collected 1 of 3" in msg and "SOLD70 is on the order" in msg, msg)
    await wait_idle(page, 90000)
    res = await text(page, ".result"); r = await rows(page); log = await page.evaluate("window.__log")
    check("all sold-out codes collected, smaller ones included", all((r.get(c) or "").startswith("Works") for c in ("SOLD70", "SOLD50", "SOLD20")), r)
    check("the biggest code is put back on the order", await page_total(page) == "US $80.00", await page_total(page))
    check("finish message says all were collected", "All 3 codes collected" in res and "SOLD70" in res, res)
    check("each code is applied only until it is collected", log.count("SOLD50") == 3 and log.count("SOLD20") == 2, log)
    hist = {h["code"] for h in (await E.get("history") or [])}
    check("history lists every collected code", {"SOLD70", "SOLD50", "SOLD20"} <= hist, hist)
    await shot(page, "15-collected")
    await page.close()

async def s_full_german(E):
    """German page: every code tested, swap dialog confirmed, best re-applied at the end."""
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout({**BASE, "lang": "de", "confirm": True, "quota": {}})
    facts = await text(page, ".facts")
    check("German total parsed (150,00 €)", "€150.00" in facts, facts)
    await start(page, "full"); await wait_idle(page)
    res = await text(page, ".result"); r = await rows(page)
    check("full search keeps DEA60 (lowest total)", "DEA60" in res, res)
    check("all four codes tried", len(r) == 4, r)
    check("German error texts classified", r.get("DEX70") == "Wrong country", r)
    check("best code re-applied at the end", await page_total(page) == "90,00 €", await page_total(page))
    await shot(page, "05-full-german")
    await page.close()

async def s_already_applied(E):
    await E.reset({"ALL": "", "DE": "DEB45 45"}); await E.cookie()
    page = await E.checkout({**BASE, "applied": "DEB45"})
    await start(page, "quick"); await wait_idle(page)
    res = await text(page, ".result"); r = await rows(page)
    check("'already applied' counts as working", r.get("DEB45") == "Works", r)
    check("no failure message", "Couldn" not in res, res)
    await page.close()

async def s_saving_from_page(E):
    """A smaller code was already on the order: the saving shown is the page's own "Saved", not the difference."""
    await E.reset({"ALL": "", "DE": "DEB45 45"}); await E.cookie()
    page = await E.checkout({**BASE, "applied": "DEC20"})
    await start(page, "quick"); await wait_idle(page)
    res = await text(page, ".result")
    check("ticket shows the full saving from the page (45, not 45−20)", "€45.00" in res and "€25.00" not in res, res)
    await page.close()

async def s_rate_limit(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout({**BASE, "rateLimit": True})
    await start(page, "quick"); await wait_idle(page)
    res = await text(page, ".result")
    log = await page.evaluate("window.__log")
    check("rate limit stops the search", "limiting attempts" in res, res)
    check("stops after the first limited attempt", len(log) == 1, log)
    await page.close()

async def s_captcha(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout({**BASE, "captchaAfter": 1})
    await start(page, "quick")
    await page.wait_for_function(f"() => /security check/i.test(document.querySelector('{P}').shadowRoot.querySelector('.run-msg').innerText)", timeout=20000)
    check("security check pauses the search", True)
    check("Resume button offered", "Resume" in await text(page, ".run-toggle"))
    await shot(page, "06-captcha")
    await page.evaluate("document.getElementById('cap').remove()")
    await page.locator(f"{P} .run-toggle").click()
    await wait_idle(page)
    check("search finishes after resuming", "DEB45" in await text(page, ".result"))
    await page.close()

async def s_slider_check(E):
    """A slider check with only text (like AliExpress's) pauses the search; codes go slower afterwards."""
    await E.reset({"ALL": "", "DE": "SOLD70 70\nSOLD60 60\nSOLD50 50"}, {"huntPause": 3000}); await E.cookie()
    page = await E.checkout({**BASE, "valid": {"SOLD50": 50}, "errors": {}, "quota": {"SOLD70": 99, "SOLD60": 99, "SOLD50": 99}, "captchaAfter": 2, "captchaKind": "slider"})
    await start(page, "hunt")
    await page.wait_for_function(f"() => /security check/i.test(document.querySelector('{P}').shadowRoot.querySelector('.run-msg').innerText)", timeout=30000)
    n = await page.evaluate("window.__log.length")
    await asyncio.sleep(4)
    check("slider check recognised by its text and the search pauses", await page.evaluate("window.__log.length") == n and "Resume" in await text(page, ".run-toggle"))
    check("message says codes will go slower", "more slowly" in await text(page, ".run-msg"))
    await shot(page, "16-slider-check")
    await page.evaluate("document.getElementById('cap').remove()")
    await page.locator(f"{P} .run-toggle").click()
    await page.wait_for_function("window.__log.length >= 5", timeout=40000)
    t = await page.evaluate("window.__times")
    after = [round((b - a) / 1000, 1) for a, b in zip(t[2:], t[3:])][:2]
    check("after the check, codes are tried more slowly (≥3 s apart)", all(g >= 3.0 for g in after), after)
    await page.locator(f"{P} .run-stop").click()
    await page.close()

async def s_no_field(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout({**BASE, "noField": True})
    t0 = time.time(); await start(page, "quick"); await wait_idle(page, 40000)
    res = await text(page, ".result")
    check("missing promo field gives a clear error", "Couldn't find the promo code field" in res, res)
    check("postal code field is never used as the promo field", await page.evaluate("window.__log.length") == 0)
    check(f"error shown within 30s ({time.time()-t0:.0f}s)", time.time() - t0 < 30)
    await page.close()

async def s_collapsed_start(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout({**BASE, "startOpen": False})
    await start(page, "quick"); await wait_idle(page)
    check("opens a collapsed promo section", "DEB45" in await text(page, ".result"))
    await page.close()

async def s_manual_decline(E):
    await E.reset({"ALL": "", "DE": "DEB45 45"}, {"autoConfirm": False}); await E.cookie()
    page = await E.checkout({**BASE, "confirm": True, "applied": "DEC20"})
    await start(page, "quick")
    await page.wait_for_selector(".modal #no", timeout=15000)
    await page.click(".modal #no")
    await wait_idle(page, 30000)
    r = await rows(page)
    check("declining the swap is not counted as working", r.get("DEB45") not in ("Works", None), r)
    hist = await E.get("history") or []
    check("declined code not added to history", not any(h["code"] == "DEB45" for h in hist))
    await page.close()

async def s_stop_restart(E):
    many = "\n".join(f"Z{i:02d}ABC {i}" for i in range(1, 15))
    await E.reset({"ALL": "", "DE": many + "\nDEB45 45"}, {"betweenCodes": 900}); await E.cookie()
    page = await E.checkout(BASE)
    await start(page, "full"); await asyncio.sleep(2.5)
    await page.locator(f"{P} .run-stop").click()
    await start(page, "quick")
    await wait_idle(page, 60000)
    n1 = await page.evaluate("window.__log.length")
    await asyncio.sleep(4)
    n2 = await page.evaluate("window.__log.length")
    check("no leftover search keeps running after a restart", n1 == n2, f"{n1} -> {n2}")
    check("restarted search completes", "DEB45" in await text(page, ".result"))
    await page.close()

async def s_apply_after_stop(E):
    await E.reset({"ALL": "", "DE": "DEB45 45\nDEC20 20\nZ01ABC 1\nZ02ABC 1\nZ03ABC 1\nZ04ABC 1"}, {"betweenCodes": 700}); await E.cookie()
    page = await E.checkout({**BASE, "quota": {}})
    await start(page, "full")
    await page.wait_for_function(f"() => [...document.querySelector('{P}').shadowRoot.querySelectorAll('.results tbody tr')].some(tr => tr.cells[0].innerText.trim()==='DEC20')", timeout=30000)
    await page.locator(f"{P} .run-stop").click()
    await page.wait_for_function(f"() => document.querySelector('{P}').shadowRoot.querySelector('[data-act=applyBest]')", timeout=15000)
    await page.locator(f"{P} [data-act=applyBest]").click()
    await page.wait_for_function(f"() => /DEB45 applied|Applied/.test(document.querySelector('{P}').shadowRoot.querySelector('.result').innerText)", timeout=30000)
    res = await text(page, ".result")
    check("Apply works after Stop", "Couldn" not in res and await page_total(page) == "US $105.00", f"{res} / {await page_total(page)}")
    await page.close()

async def s_store_and_favourites(E):
    await E.reset({"ALL": "", "DE": "DEB45 45", "PL": "PLX10 10"}); await E.cookie("CZ", "EUR")
    await E.store({"favorites": {"countries": ["UA", "PL", "DE", "CZ"], "currencies": ["EUR", "PLN", "CZK"], "languages": ["en_US", "pl_PL"]}})
    pop = await E.popup()
    await pop.click(".tabs [data-tab=settings]"); await asyncio.sleep(0.3)
    inp = pop.locator(".fav[data-key=countries] input")
    await inp.fill("slov"); await asyncio.sleep(0.2)
    check("country search finds Slovakia and Slovenia", "Slovakia" in await pop.locator(".fav[data-key=countries] ul").inner_text())
    await inp.press("Enter"); await asyncio.sleep(0.3)
    await pop.click(".fav[data-key=countries] [data-remove=UA]"); await asyncio.sleep(0.3)
    favs = await E.get("favorites")
    check("lists saved (added SK, removed UA)", favs["countries"] == ["PL", "DE", "CZ", "SK"], favs)
    await shot(pop, "07-settings", clip=False)
    await pop.click(".tabs [data-tab=codes]"); await asyncio.sleep(0.4)
    tabs = await pop.locator("#regionTabs").inner_text()
    check("code tabs follow the country list", "SK" in tabs and "UA" not in tabs, tabs.replace("\n", " "))
    await pop.close()

    page = await E.checkout(BASE)
    await page.locator(f"{P} .store-open").click(); await asyncio.sleep(0.4)
    form = await text(page, ".storebox")
    check("quick switch shows only the user's lists", "Slovakia" in form and "Ukraine" not in form, form[:200])
    check("Apply disabled until something changes", await page.locator(f"{P} [data-store=apply]").is_disabled())
    await page.locator(f'{P} .qs-chip[data-name=region][data-value=PL]').click()
    await page.locator(f'{P} .qs-chip[data-name=currency][data-value=PLN]').click()
    await shot(page, "08-quick-switch")
    async with page.expect_navigation(timeout=15000):
        await page.locator(f"{P} [data-store=apply]").click()
    await page.wait_for_selector(P, state="attached"); await asyncio.sleep(1)
    await page.locator(f"{P} .launcher").click(); await asyncio.sleep(0.4)
    facts = await text(page, ".facts")
    check("page reloads with Poland / PLN", "Poland" in facts and "PLN" in facts, facts)
    c = {x["name"]: x for x in await E.ctx.cookies("https://www.aliexpress.com")}
    check("settings cookie rewritten", c["aep_usuc_f"]["value"] == "site=glo&c_tp=PLN&region=PL&b_locale=en_US", c["aep_usuc_f"]["value"])

    pop = await E.popup(page)
    check("popup header shows the new setting", "Poland, PLN" in await pop.locator("#where").inner_text())
    await pop.click("#where"); await asyncio.sleep(0.4)
    await shot(pop, "09-popup-switch", clip=False)
    await pop.click('.qs-chip[data-name=region][data-value=DE]'); await pop.click('.qs-chip[data-name=currency][data-value=EUR]')
    async with page.expect_navigation(timeout=15000):
        await pop.click("[data-store=apply]")
    await asyncio.sleep(0.6)
    check("switch from the popup works", "Germany, EUR" in await pop.locator("#where").inner_text())
    async with E.ctx.expect_page() as newp:
        await page.locator(f"{P} .launcher").click(); await asyncio.sleep(0.3)
        await page.locator(f"{P} .store-open").click(); await asyncio.sleep(0.3)
        await page.locator(f"{P} [data-store=edit]").click()
    sp = await newp.value; await sp.wait_for_load_state(); await asyncio.sleep(0.5)
    check("'Edit lists' opens Settings in a tab", await sp.locator("#settings").is_visible())
    for x in (sp, pop, page): await x.close()

    # .us site keeps its own settings: switching there must explain instead of silently doing nothing
    await E.cookie("DE", "EUR", ".aliexpress.us")
    page = await E.checkout(BASE, host="www.aliexpress.us")
    await page.locator(f"{P} .store-open").click(); await asyncio.sleep(0.3)
    await page.locator(f'{P} .qs-chip[data-name=region][data-value=PL]').click()
    await page.locator(f"{P} [data-store=apply]").click(); await asyncio.sleep(1.5)
    err = await text(page, ".store-error")
    check("aliexpress.us: clear message instead of a silent no-op", "aliexpress.com only" in err, err)
    await page.close()

async def s_popup_codes(E):
    await E.reset({"ALL": ""}); await E.cookie()
    await E.store({"favorites": {"countries": ["UA", "PL", "DE", "CZ"], "currencies": ["EUR"], "languages": ["en_US"]}})
    pop = await E.popup()
    await pop.click(".tabs [data-tab=codes]"); await pop.click("#importToggle"); await pop.fill("#importText", POST)
    await asyncio.sleep(0.3)
    prev = await pop.locator("#importPreview").inner_text()
    check("import preview lists all countries", all(x in prev for x in ("Ukraine", "Poland", "Germany", "Czechia", "All countries")), prev)
    await shot(pop, "10-import", clip=False)
    await pop.click("#importReplace"); await asyncio.sleep(0.6)
    cb = await E.get("codesByRegion")
    check("Replace imports 42 codes", sum(len([l for l in v.splitlines() if l and not l.startswith("#")]) for v in cb.values()) == 42)
    await pop.click("#importToggle"); await pop.fill("#importText", POST + "\n🇩🇪 Germany\nNEWDE1 5 from 30"); await asyncio.sleep(0.3)
    await pop.click("#importAdd"); await asyncio.sleep(0.6)
    cb = await E.get("codesByRegion")
    de = [l for l in cb["DE"].splitlines() if l and not l.startswith("#")]
    check("Add skips duplicates and adds only new codes", len(de) == 8 and any(l.startswith("NEWDE1") for l in de), len(de))
    await pop.click("#regionTabs [data-region=DE]"); await asyncio.sleep(0.3)
    await shot(pop, "11-codes", clip=False)
    await pop.click("#editToggle"); await pop.locator("#regionCodes").press("End")
    await pop.locator("#regionCodes").press("Control+End"); await pop.keyboard.type("\nQUICKSAVE9 9")
    await pop.close()  # closed immediately: the edit must still be saved
    await asyncio.sleep(0.5)
    cb = await E.get("codesByRegion")
    check("edits survive closing the popup immediately", "QUICKSAVE9 9" in cb["DE"])

    pop = await E.popup()
    await pop.click(".tabs [data-tab=settings]")
    await pop.click("label[for=skipDead]"); await pop.select_option("#huntPause", "60000"); await asyncio.sleep(0.3)
    await pop.reload(); await pop.click(".tabs [data-tab=settings]"); await asyncio.sleep(0.3)
    check("settings persist", not await pop.locator("#skipDead").is_checked() and await pop.locator("#huntPause").input_value() == "60000")
    await pop.click(".shared summary")
    await pop.locator("#codesUrl").fill("https://example.com/codes.json"); await pop.click("#refreshBtn"); await asyncio.sleep(0.6)
    check("shared list rejects non-GitHub links", "Only raw.githubusercontent.com" in await pop.locator("#remoteInfo").inner_text())
    await pop.close()

async def s_diagnostics(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout(BASE, open_panel=False)
    pop = await E.popup(page)
    diag = await pop.evaluate("async () => (await chrome.tabs.sendMessage((await chrome.tabs.query({}))[0].id, {type:'diagnose'})).text")
    check("diagnostics include the promo section", "Promo codes" in diag and "Apply" in diag, diag[:200])
    check("diagnostics exclude name and address", not any(x in diag for x in ("Kowalski", "Marszałkowska", "Warszawa", "00-950")), diag)
    await pop.close(); await page.close()

async def s_popup_search(E):
    await E.reset(DE_CODES); await E.cookie()
    page = await E.checkout(BASE, open_panel=False)
    pop = await E.popup(page)
    await shot(pop, "12-popup-search", clip=False)
    await pop.click(".mode[data-arg=quick]")
    await pop.locator("#running").wait_for(state="visible", timeout=8000)
    check("popup can start a search and shows progress", True)
    # In this test the popup is a separate tab, so Chrome slows the checkout tab down; allow for that
    await pop.locator("#result .ticket-code", has_text="DEB45").wait_for(timeout=60000)
    check("popup shows the result", True)
    await shot(pop, "13-popup-result", clip=False)
    blank = await E.ctx.new_page(); await blank.goto("about:blank")
    pop2 = await E.popup()
    await pop2.evaluate("chrome.tabs.query = async () => [{id: -1, url: 'https://example.com/'}]"); await pop2.evaluate("initSearch()")
    await asyncio.sleep(0.4)
    check("popup outside checkout explains what to do", await pop2.locator("#notCheckout").is_visible())
    for x in (pop, pop2, blank, page): await x.close()

SCENARIOS = [s_saving_from_page, s_quick_and_wait, s_wait_rounds, s_collect, s_full_german, s_already_applied, s_rate_limit, s_captcha, s_slider_check, s_no_field, s_collapsed_start,
             s_manual_decline, s_stop_restart, s_apply_after_stop, s_store_and_favourites, s_popup_codes, s_diagnostics, s_popup_search]

async def main():
    async with async_playwright() as p:
        E = Env(); await E.start(p)
        for s in SCENARIOS:
            if ONLY and s.__name__ not in ONLY: continue
            print(f"\n{s.__name__}: {s.__doc__ or ''}".rstrip())
            try:
                await asyncio.wait_for(s(E), 150)
            except Exception as e:
                check(f"{s.__name__} ran without exceptions", False, f"{type(e).__name__}: {str(e)[:300]}")
                for pg in E.ctx.pages[1:]:
                    try: await pg.close()
                    except Exception: pass
        check("no JavaScript errors in pages or popup", not E.errors, E.errors[:5])
        await E.ctx.close()
    ok = sum(r[1] for r in results)
    print(f"\nE2E ({SCHEME}): {ok}/{len(results)} checks passed")
    sys.exit(0 if ok == len(results) else 1)

asyncio.run(main())
