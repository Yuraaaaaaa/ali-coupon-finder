/*
 * Floating panel on the checkout page. Lives in a Shadow DOM so the shop's styles can't affect it,
 * and uses the same stylesheet and markup helpers as the popup (lib/ui.css, lib/views.js).
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.Panel = class Panel {
  constructor(handlers) {
    this.h = handlers;
    this.open = false;
    this.lastKey = "";
    this.swKey = "";
    Panel.injectFonts();

    this.host = document.createElement("div");
    this.host.id = "acf-host";
    this.host.style.cssText = "position: fixed; z-index: 2147483647; visibility: hidden;";
    this.root = this.host.attachShadow({ mode: "open" });
    const css = (path) => `<link rel="stylesheet" href="${chrome.runtime.getURL(path)}">`;
    this.root.innerHTML = `${css("lib/ui.css")}${css("content/panel.css")}
      <button class="launcher" type="button" data-t-aria="panel.open">${ACF.icon("ticket")}<span data-t="panel.launcher"></span><i class="dot"></i></button>
      <section class="panel" role="dialog" aria-label="Coupon Finder" hidden>
        <header class="head">
          <span class="brand"><span class="logo">${ACF.icon("ticket")}</span>Coupon Finder</span>
          <button class="icon-btn close" type="button" data-t-aria="common.close">${ACF.icon("close")}</button>
        </header>
        <div class="body">
          <dl class="facts two">
            <div><dt data-t="facts.total"></dt><dd class="f-total">—</dd></div>
            <div><dt data-t="facts.codes"></dt><dd class="f-codes">—</dd></div>
          </dl>
          <div class="swbox"></div>
          <p class="note f-skipped" hidden></p>
          <div class="result stack"></div>
          <div class="modes"></div>
          <div class="run" hidden>
            <div class="run-head"><span class="run-title"></span><span class="run-count"></span></div>
            <div class="bar"><i></i></div>
            <p class="run-msg"></p>
            <div class="btn-row"><button class="btn run-toggle" type="button"></button><button class="btn btn-danger run-stop" type="button">${ACF.icon("stop")}<span data-t="run.stop"></span></button></div>
          </div>
          <div class="results"></div>
        </div>
        <footer class="foot">
          <button class="link pick" type="button" data-t="panel.pickTotal"></button>
          <button class="link diag" type="button" data-t="panel.diag"></button>
        </footer>
        <p class="flash" role="status" aria-live="polite"></p>
      </section>`;
    document.documentElement.appendChild(this.host);
    ACF.applyI18n(this.root);

    // Show only once both stylesheets have loaded, so the page never sees unstyled markup
    const links = [...this.root.querySelectorAll("link")];
    Promise.all(links.map((l) => new Promise((r) => { l.onload = l.onerror = r; }))).then(() => { this.host.style.visibility = "visible"; });

    this.$ = (s) => this.root.querySelector(s);
    this.$(".launcher").onclick = () => this.toggle(true);
    this.$(".close").onclick = () => this.toggle(false);
    this.$(".pick").onclick = () => this.h.onPickTotal();
    this.$(".diag").onclick = () => this.h.onDiagnose();
    this.$(".run-stop").onclick = () => this.h.onStop();
    this.$(".run-toggle").onclick = () => (this.paused ? this.h.onResume() : this.h.onPause());
    this.$(".body").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const { act, arg } = b.dataset;
      if (act === "start") this.h.onStart(arg);
      else if (act === "copy") this.h.onCopy(arg);
      else if (act === "applyBest") this.h.onApplyBest();
      else if (act === "huntExhausted") this.h.onHuntExhausted();
      else if (act === "drop") this.h.onDrop(arg);
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.open) this.toggle(false);
    });
  }

  // @font-face is ignored inside a shadow root, so the bundled fonts are declared on the page itself
  static injectFonts() {
    if (document.getElementById("acf-fonts")) return;
    const url = (f) => chrome.runtime.getURL("fonts/" + f);
    const style = document.createElement("style");
    style.id = "acf-fonts";
    style.textContent = [400, 500, 600].map((w) =>
      `@font-face{font-family:"Plex Sans";font-weight:${w};font-display:swap;src:url("${url(`ibm-plex-sans-latin-${w}-normal.woff2`)}") format("woff2")}`).join("") +
      `@font-face{font-family:"Plex Mono";font-weight:500;font-display:swap;src:url("${url("ibm-plex-mono-latin-500-normal.woff2")}") format("woff2")}`;
    (document.head || document.documentElement).appendChild(style);
  }

  // The interface language changed: redo static texts and everything rendered
  relabel() {
    ACF.applyI18n(this.root);
    this.lastKey = "";
    this.swKey = "";
  }

  toggle(open) {
    this.open = open;
    this.$(".panel").hidden = !open;
    this.$(".launcher").hidden = open;
    if (open) { this.lastKey = ""; this.$(".close").focus({ preventScroll: true }); }
    else this.$(".launcher").focus({ preventScroll: true });
  }

  // Country, currency and language block; rebuilt only when its inputs change and no choice is pending
  renderSwitcher(running) {
    const { current, favorites, counts, collapsed, pageCurrency, addressRegion } = this.h.storeInfo();
    const key = JSON.stringify([current, favorites, counts, running, ACF.getLang(), pageCurrency, addressRegion]);
    if (key === this.swKey || (this.sw && this.sw.dirty())) return;
    this.swKey = key;
    const box = this.$(".swbox");
    box.innerHTML = ACF.view.switcher(current, favorites, counts, { collapsed, busy: running, pageCurrency, addressRegion });
    this.sw = ACF.view.bindSwitcher(box, {
      current,
      onApply: (store) => (this.running ? { ok: false, error: ACF.t("sw.stopFirst") } : this.h.onSetStore(store)),
      onEdit: () => this.h.onEditLists(),
      onFold: (c) => this.h.onFold(c)
    });
  }

  flash(text) {
    const el = this.$(".flash");
    el.textContent = text;
    el.classList.add("on");
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove("on"), 2200);
  }

  render(st, info, waitable) {
    const running = st.phase === "running" || st.phase === "paused";
    this.paused = st.phase === "paused";
    this.running = running;

    // Launcher dot: amber while searching or waiting, green when a code is applied
    const dot = this.$(".launcher .dot");
    dot.className = "dot " + (running ? "busy" : st.best && st.applied === st.best.code ? "good" : "");

    this.$(".f-total").textContent = ACF.money(info.total, info.currency);
    this.$(".f-total").title = info.total == null ? ACF.t("panel.totalMissing") : "";
    this.$(".f-codes").textContent = String(info.available);
    this.$(".f-skipped").textContent = ACF.t("facts.skipped", { n: info.skipped });
    this.$(".f-skipped").hidden = running || !info.skipped;
    this.$(".modes").hidden = running;
    this.$(".run").hidden = !running;
    this.renderSwitcher(running);

    if (running) {
      const p = ACF.view.progress(st);
      this.$(".run").classList.toggle("wait", p.wait);
      this.$(".run-title").textContent = p.title;
      this.$(".run-count").textContent = p.count;
      this.$(".run-msg").textContent = p.message;
      this.$(".bar").classList.toggle("indeterminate", p.pct == null);
      this.$(".bar i").style.width = p.pct == null ? "" : p.pct + "%";
      this.$(".run-toggle").innerHTML = this.paused ? `${ACF.icon("play")}<span>${ACF.t("run.resume")}</span>` : `${ACF.icon("pause")}<span>${ACF.t("run.pause")}</span>`;
      this.$(".result").innerHTML = "";
    }

    // Rebuild the rest only when it changed, so hover and keyboard focus survive the periodic refresh
    const key = JSON.stringify([running, info.available, info.currency, st.phase, st.message, st.best, st.applied, waitable,
      st.results.map((r) => [r.code, r.status, r.tries, r.total])]);
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (!running) {
      this.$(".modes").innerHTML = ACF.view.modes(info.available, st.phase !== "idle");
      this.$(".result").innerHTML = st.phase === "idle" ? "" :
        ACF.view.outcome(st) + ACF.view.ticket(st, info.currency) + ACF.view.offer(waitable);
    }
    // While waiting, codes still waited for can be removed with ×
    this.$(".results").innerHTML = ACF.view.results(st.results, st.best, info.currency, { removable: running && st.mode === "hunt" });
  }
};
