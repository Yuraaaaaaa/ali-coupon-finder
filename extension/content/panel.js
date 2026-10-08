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
    Panel.injectFonts();

    this.host = document.createElement("div");
    this.host.id = "acf-host";
    this.host.style.cssText = "position: fixed; z-index: 2147483647; visibility: hidden;";
    this.root = this.host.attachShadow({ mode: "open" });
    const css = (path) => `<link rel="stylesheet" href="${chrome.runtime.getURL(path)}">`;
    this.root.innerHTML = `${css("lib/ui.css")}${css("content/panel.css")}
      <button class="launcher" type="button" aria-label="Open Coupon Finder">${ACF.icon("ticket")}<span>Coupons</span><i class="dot"></i></button>
      <section class="panel" role="dialog" aria-label="Coupon Finder" hidden>
        <header class="head">
          <span class="brand"><span class="logo">${ACF.icon("ticket")}</span>Coupon Finder</span>
          <button class="icon-btn close" type="button" aria-label="Close">${ACF.icon("close")}</button>
        </header>
        <div class="body">
          <dl class="facts">
            <div><dt>Order total</dt><dd class="f-total">—</dd></div>
            <div><dt>Shipping to</dt><dd><button class="fact-btn store-open" type="button" title="Change shipping country, currency or language" aria-expanded="false"><span class="f-region">—</span>${ACF.icon("down")}</button></dd></div>
            <div><dt>Codes</dt><dd class="f-codes">—</dd></div>
          </dl>
          <p class="note f-skipped" hidden></p>
          <div class="storebox" hidden></div>
          <div class="result stack"></div>
          <div class="modes"></div>
          <div class="run" hidden>
            <div class="run-head"><span class="run-title"></span><span class="run-count"></span></div>
            <div class="bar"><i></i></div>
            <p class="run-msg"></p>
            <div class="btn-row"><button class="btn run-toggle" type="button"></button><button class="btn btn-danger run-stop" type="button">${ACF.icon("stop")}<span>Stop</span></button></div>
          </div>
          <div class="results"></div>
        </div>
        <footer class="foot">
          <button class="link pick" type="button">Set order total manually</button>
          <button class="link diag" type="button">Copy diagnostics</button>
        </footer>
        <p class="flash" role="status" aria-live="polite"></p>
      </section>`;
    document.documentElement.appendChild(this.host);

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
    this.$(".store-open").onclick = () => (this.storeOpen ? this.closeStore() : this.openStore());
    this.$(".body").addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const { act, arg } = b.dataset;
      if (act === "start") this.h.onStart(arg);
      else if (act === "copy") this.h.onCopy(arg);
      else if (act === "applyBest") this.h.onApplyBest();
      else if (act === "huntExhausted") this.h.onHuntExhausted();
    });
    this.root.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !this.open) return;
      if (this.storeOpen) this.closeStore(); else this.toggle(false);
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

  toggle(open) {
    this.open = open;
    this.$(".panel").hidden = !open;
    this.$(".launcher").hidden = open;
    if (open) { this.lastKey = ""; this.$(".close").focus({ preventScroll: true }); }
    else this.$(".launcher").focus({ preventScroll: true });
  }

  // Country, currency and language form, shown in place of the search controls
  openStore() {
    if (this.running) return this.flash("Stop the search before changing the country");
    const { current, favorites, counts } = this.h.storeInfo();
    this.storeOpen = true;
    this.$(".store-open").setAttribute("aria-expanded", "true");
    const box = this.$(".storebox");
    box.innerHTML = ACF.view.storeForm(current, favorites, counts, "The checkout page reloads with the new settings. A promo code that was applied may need to be applied again.");
    ACF.view.bindStoreForm(box, {
      current,
      onApply: (store) => this.h.onSetStore(store),
      onCancel: () => this.closeStore(),
      onEdit: () => this.h.onEditLists()
    });
    this.layout();
    const first = box.querySelector(".qs-chip[aria-checked=true]") || box.querySelector(".qs-chip");
    if (first) first.focus({ preventScroll: true });
  }

  closeStore() {
    this.storeOpen = false;
    this.$(".store-open").setAttribute("aria-expanded", "false");
    this.$(".storebox").innerHTML = "";
    this.layout();
  }

  // Which blocks are visible: the store form replaces everything below the facts row
  layout() {
    const store = !!this.storeOpen;
    this.$(".storebox").hidden = !store;
    this.$(".modes").hidden = store || this.running;
    this.$(".run").hidden = store || !this.running;
    this.$(".result").hidden = store;
    this.$(".results").hidden = store;
    this.$(".f-skipped").hidden = store || this.running || !this.skipped;
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
    this.skipped = info.skipped;
    if (running && this.storeOpen) this.closeStore();

    // Launcher dot: amber while searching or waiting, green when a code is applied
    const dot = this.$(".launcher .dot");
    dot.className = "dot " + (running ? "busy" : st.best && st.applied === st.best.code ? "good" : "");

    this.$(".f-total").textContent = ACF.money(info.total, info.currency);
    this.$(".f-total").title = info.total == null ? "Not found. Use “Set order total manually” below." : "";
    this.$(".f-region").textContent = ACF.view.countryName(info.region);
    this.$(".f-codes").textContent = String(info.available);
    this.$(".f-skipped").textContent = `${ACF.view.plural(info.skipped, "code is", "codes are")} skipped: another country, too small an order, or failed recently.`;

    this.layout();

    if (running) {
      const p = ACF.view.progress(st);
      this.$(".run").classList.toggle("wait", p.wait);
      this.$(".run-title").textContent = p.title;
      this.$(".run-count").textContent = p.count;
      this.$(".run-msg").textContent = p.message;
      this.$(".bar").classList.toggle("indeterminate", p.pct == null);
      this.$(".bar i").style.width = p.pct == null ? "" : p.pct + "%";
      this.$(".run-toggle").innerHTML = this.paused ? `${ACF.icon("play")}<span>Resume</span>` : `${ACF.icon("pause")}<span>Pause</span>`;
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
    this.$(".results").innerHTML = ACF.view.results(st.results, st.best, info.currency);
  }
};
