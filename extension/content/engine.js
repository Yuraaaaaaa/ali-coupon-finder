/*
 * Search engine: opens the promo field, enters a code, presses Apply,
 * reads the outcome (message, dialog or total change) and keeps the best code.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

const T = (k, v) => ACF.t(k, v);

ACF.Engine = class Engine {
  constructor({ onUpdate, onResult, onHunt, onNotify, settings }) {
    this.cfg = ACF.CONFIG;
    this.d = ACF.dom;
    this.onUpdate = onUpdate || (() => {});
    this.onResult = onResult || (() => {});
    this.onHunt = onHunt || (() => {});
    this.onNotify = onNotify || (() => {});
    this.settings = settings || {};
    this.state = this.freshState();
    this.watcher = this.makeWatcher();
  }

  freshState() {
    return {
      phase: "idle",        // idle | running | paused | done | error
      mode: null,           // quick | full
      queue: [],
      index: 0,
      results: [],          // {code, value, status, total, accepted}
      baseline: null,       // order total before any code was tried
      best: null,           // {code, value, total}
      applied: null,        // code currently applied on the page
      current: null,
      message: "",
      skipped: 0,
      round: 0,
      deadline: null
    };
  }

  emit(patch = {}) {
    Object.assign(this.state, patch);
    this.onUpdate(this.state);
  }

  // ---------------------------------------------------------------- watcher
  // Collects only text that appears AFTER Apply is pressed,
  // so earlier messages on the page aren't mistaken for the new result.
  makeWatcher() {
    let chunks = [];
    let size = 0;
    let lastChange = 0;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (target && target.closest && target.closest("#acf-host")) continue;
        lastChange = Date.now();
        // Only a bounded amount of text is kept: AliExpress may re-render big parts of the page
        if (size > 200000) continue;
        const add = (s) => { if (s) { chunks.push(s); size += s.length; } };
        if (m.type === "characterData") add(m.target.data || "");
        for (const n of m.addedNodes || []) {
          if (n.nodeType === 3) add(n.data);
          else if (n.nodeType === 1 && n.id !== "acf-host") {
            const raw = n.textContent || "";
            add(raw.length > 20000 ? "" : n.innerText || raw);
          }
        }
      }
    });
    return {
      start: () => {
        chunks = []; size = 0; lastChange = Date.now();
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      },
      stop: () => { obs.disconnect(); chunks = []; size = 0; },
      text: () => chunks.join(" \n ").toLowerCase(),
      quietFor: () => Date.now() - lastChange
    };
  }

  // ------------------------------------------------------------- page parts
  findInput() {
    const { inputHints, inputExactPlaceholders } = this.cfg;
    const inputs = document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),textarea");
    for (const input of inputs) {
      if (input.closest("#acf-host") || !this.d.visible(input) || input.readOnly) continue;
      const ph = this.d.norm(input.placeholder);
      const meta = this.d.norm([
        input.getAttribute("aria-label"), input.name, input.id,
        input.closest("label") && input.closest("label").innerText
      ].join(" "));
      if (this.cfg.inputExclude.test(ph + " " + meta)) continue;
      if (inputExactPlaceholders.includes(ph)) return input;
      if (inputHints.some((h) => ph.includes(h) || meta.includes(h))) return input;
    }
    return null;
  }

  async openField() {
    let input = this.findInput();
    if (input) return input;

    const triggers = this.findOpenTriggers();

    // The Promo codes section is a toggle. A full simulated click
    // (pointerdown + mousedown + click) can toggle it twice and close it again,
    // so try a plain click() first and only fall back to the full sequence.
    for (const t of triggers.slice(0, 3)) {
      const target = this.d.clickable(t);
      for (const how of ["click", "point", "press"]) {
        if (this.findInput()) return this.findInput();
        try {
          target.scrollIntoView({ block: "center" });
          if (how === "click") target.click();
          else if (how === "point") {
            // Click whatever is actually on top at that point, like a real mouse
            const r = t.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!top || top.closest("#acf-host")) continue;
            top.click();
          } else this.d.press(target);
        } catch (e) {}
        input = await this.d.waitFor(() => this.findInput(), this.cfg.timing.openFieldWait);
        if (input) return input;
      }
    }
    return null;
  }

  /*
   * Finds what to click to expand the promo code section.
   * 1) The section label ("Promo codes", "Gutscheincodes", "Kody promocyjne"…)
   *    and the "Enter"/"Add"/… control on the same row — the most precise.
   * 2) Fallback: any such control with promo/code in its ancestors.
   * 3) Last resort: the section label itself.
   */
  findOpenTriggers() {
    const d = this.d, cfg = this.cfg;
    const labels = [...document.querySelectorAll("span,div,p,b,strong,h2,h3,h4,label,dt")].filter((el) =>
      el.children.length <= 2 && d.shortText(el) && !el.closest("#acf-host") && cfg.promoLabel.test(d.textOf(el)) && d.visible(el));
    const out = [];
    for (const label of labels) {
      let p = label.parentElement;
      for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
        if ((p.innerText || "").length > 400) break;
        const hits = d.findByText(cfg.openTriggers, p).filter((el) => el !== label && !el.contains(label) && !label.contains(el));
        if (hits.length) { out.push(...hits); break; }
      }
    }
    if (out.length) return [...new Set(out)];

    const depthOf = (el) => {
      let p = el;
      for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
        const txt = p.innerText || "";
        if (txt.length > 300) return Infinity;
        if (cfg.promoContext.test(txt)) return i;
      }
      return Infinity;
    };
    const risky = /^(change|edit|ändern|bearbeiten|zmień|změnit|змінити|изменить)$/i;
    const loose = d.findByText(cfg.openTriggers)
      .map((el) => ({ el, depth: depthOf(el) + (risky.test(d.textOf(el)) ? 10 : 0) }))
      .filter((t) => t.depth !== Infinity)
      .sort((a, b) => a.depth - b.depth)
      .map((t) => t.el);
    return loose.length ? loose : labels;
  }

  findApply(input) {
    const texts = this.cfg.applyTexts;
    // Look next to the field first; it's more reliable
    let scope = input;
    for (let i = 0; i < 5 && scope; i++) {
      scope = scope.parentElement;
      if (!scope) break;
      const hit = this.d.findByText(texts, scope).map(this.d.clickable).find((el) => this.d.enabled(el));
      if (hit) return hit;
    }
    // Page-wide search, without the too-generic "ok"
    return this.d.findByText(texts.filter((t) => t !== "ok")).map(this.d.clickable).find((el) => this.d.enabled(el)) || null;
  }

  findConfirm() {
    const exactAnywhere = this.cfg.confirmExact;
    const all = this.d.findByText(this.cfg.confirmTexts, document, "button,[role='button'],a,span,div");
    for (const el of all) {
      const t = this.d.textOf(el);
      const inDialog = el.closest("[role='dialog'],[aria-modal='true'],[class*='modal'],[class*='dialog'],[class*='popup']");
      if (exactAnywhere.includes(t) || inDialog) return this.d.clickable(el);
    }
    return null;
  }

  // "No thanks" / "Cancel" next to the confirm button
  findCancel(confirm = this.findConfirm()) {
    if (!confirm) return null;
    let scope = confirm.parentElement;
    for (let i = 0; i < 4 && scope; i++, scope = scope.parentElement) {
      const hit = this.d.findByText(this.cfg.cancelTexts, scope).map(this.d.clickable).find((el) => el !== confirm && !el.contains(confirm));
      if (hit) return hit;
    }
    return null;
  }

  // AliExpress is asking "Sure you want to use this coupon/code?". While it's open, the total
  // behind it already shows the new code, but nothing is applied until the dialog is answered.
  confirmDialogOpen() {
    const c = this.findConfirm();
    if (!c) return false;
    return this.cfg.confirmExact.includes(this.d.textOf(c)) || !!this.findCancel(c);
  }

  // Close a dialog left open by an earlier attempt, keeping the order as it was
  async dismissDialog() {
    const cancel = this.findCancel();
    if (cancel) this.d.press(cancel);
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await this.d.waitFor(() => !this.confirmDialogOpen(), 2500);
    await this.d.sleep(500);
  }

  /*
   * The error shown under the promo field right now, if the field still holds this code.
   * AliExpress keeps the same red text when the same error repeats, so the page doesn't change
   * and the message can't be caught as new text; it's read from the page instead.
   */
  promoError(code) {
    const input = this.findInput();
    if (!input || this.d.norm(input.value) !== code.toLowerCase()) return null;
    let area = input.parentElement;
    for (let i = 0; i < 4 && area && area.parentElement; i++) {
      if ((area.parentElement.innerText || "").length > 1500) break;
      area = area.parentElement;
    }
    if (!area) return null;
    for (const el of area.querySelectorAll("div,span,p,em,small,strong,label")) {
      if (el.closest("#acf-host") || el.contains(input) || el.children.length > 1) continue;
      const t = this.d.textOf(el);
      if (t.length < 12 || t.length > 400 || !this.d.visible(el)) continue;
      const cls = typeof el.className === "string" ? el.className : "";
      if (!this.cfg.errorClass.test(cls) && !this.d.reddish(el)) continue;
      const o = this.classify(t);
      if (o) return o;
    }
    return null;
  }

  readTotal() {
    const { parsePrice, visible, textOf } = this.d;

    // 1) Selector the user set manually
    if (this.settings.totalSelector) {
      const el = document.querySelector(this.settings.totalSelector);
      const v = el && parsePrice(el.innerText);
      if (v != null) { this.totalText = el.innerText; return v; }
    }
    // 2) Known selectors
    for (const sel of this.cfg.totalSelectors) {
      const el = [...document.querySelectorAll(sel)].reverse().find(visible);
      const v = el && parsePrice(el.innerText);
      if (v != null) { this.totalText = el.innerText; return v; }
    }
    // 3) Heuristic: a "Total" label with a price on the same row
    return this.readLabeledPrice(this.cfg.totalLabels, true);
  }

  // The total for display: read at most once a second (searches always read it fresh)
  readTotalCached() {
    const now = Date.now();
    if (this._totalAt && now - this._totalAt < 1000 && this._total != null) return this._total;
    this._totalAt = now;
    return (this._total = this.readTotal());
  }

  // Currency the order total is shown in on the page (may differ from the one chosen in settings)
  readTotalCurrency() {
    return this.readTotalCached() == null ? null : this.d.detectCurrency(this.totalText);
  }

  // The order's savings as AliExpress itself shows them ("Saved −€54.73"), or null
  readSaved() {
    return this.readLabeledPrice(this.cfg.savedLabels);
  }

  // A price on the same row as a label matching re (searched from the bottom of the page up)
  readLabeledPrice(re, isTotal = false) {
    const { parsePrice, visible, textOf } = this.d;
    const labels = [...document.querySelectorAll("span,div,p,dt,td,strong,b,label")].filter((el) =>
      el.children.length <= 1 && this.d.shortText(el, 40) && !el.closest("#acf-host") &&
      re.test(textOf(el)) && textOf(el).length < 30 && visible(el));
    for (const label of labels.reverse()) {
      let row = label.parentElement;
      for (let i = 0; i < 3 && row; i++, row = row.parentElement) {
        const txt = (row.innerText || "").replace(label.innerText || "", " ");
        if (/\d/.test(txt) && txt.length < 120) {
          const v = parsePrice(txt);
          if (v != null) { if (isTotal) this.totalText = txt; return v; }
        }
      }
    }
    return null;
  }

  captchaVisible() {
    // Checked often while a code is tried; the answer is reused for a moment to keep this light
    const now = Date.now();
    if (this._captchaAt && now - this._captchaAt < 700) return this._captcha;
    this._captchaAt = now;
    return (this._captcha = this.scanCaptcha());
  }

  scanCaptcha() {
    if (this.cfg.captchaSelectors.some((s) => [...document.querySelectorAll(s)].some(this.d.visible))) return true;
    for (const el of document.querySelectorAll(this.cfg.captchaContainers)) {
      const raw = el.textContent;
      // A security check is a small box; large containers (whole page sections) are skipped
      if (!raw || raw.length > 3000 || el.closest("#acf-host") || !this.d.visible(el)) continue;
      const t = (el.innerText || "").slice(0, 400);
      if (t && this.cfg.captchaText.test(t)) return true;
    }
    return false;
  }

  // Random delay between codes while waiting; longer after a security check was shown
  async codeGap() {
    const [min, max] = this.settings.huntGap || this.cfg.timing.huntGap;
    const ms = (min + Math.random() * (max - min)) * (this.slowdown || 1);
    await this.countdown(ms);
  }

  // Security check on the page: pause until the user has completed it and selected Resume
  async handleCaptcha() {
    this.slowdown = Math.min((this.slowdown || 1) * this.cfg.timing.captchaBackoff, this.cfg.timing.captchaBackoffMax);
    this.emit({ phase: "paused", captcha: true, message: T("msg.captcha") });
    this.onNotify({ title: T("msg.captchaTitle"), message: T("msg.captchaNotify") });
    await this.pauseIfNeeded();
    this._captchaAt = 0; // look at the page again rather than reuse the answer from before the pause
  }

  // "You've already applied this code" means it works and is on the order now
  fromMessage(msg) {
    const total = this.readTotal();
    if (msg.id === "applied_now") return { status: "ok", accepted: true, total, note: "already applied" };
    return { status: msg.id, stop: !!msg.stop, total };
  }

  classify(text) {
    for (const o of this.cfg.outcomes) if (o.re.test(text)) return o;
    return null;
  }

  // ------------------------------------------------------------ one code
  async tryCode(item, input) {
    const { timing } = this.cfg;
    const before = this.readTotal();
    const codeLc = item.code.toLowerCase();

    this.watcher.start();
    try {
      this.d.setInputValue(input, item.code);
      const apply = await this.d.waitFor(() => this.findApply(input), 2000);
      if (!apply) return { status: "unknown", note: "Apply button not found" };
      this.d.press(apply);

      let confirmed = false;
      let presses = 0, lastPress = 0;
      let handled = false;
      let accepted = false;
      const started = Date.now();
      let end = started + timing.outcomeTimeout;

      while (Date.now() < end) {
        if (this.stopRequested) return { status: "skipped" };
        if (this.captchaVisible()) return { status: "captcha" };

        const msg = this.classify(this.watcher.text());
        if (msg) return this.fromMessage(msg);

        const dialog = !handled && this.confirmDialogOpen();
        if (dialog) {
          if (this.settings.autoConfirm === false) {
            // The user decides; only a changed total or the code on the page counts as accepted
            this.emit({ message: T("msg.confirmDialog") });
            await this.d.waitFor(() => !this.confirmDialogOpen() || this.stopRequested, 60000);
            handled = true;
            end = Math.max(end, Date.now() + timing.afterConfirmWait);
          } else if (presses < 3 && Date.now() - lastPress > 1500) {
            // Press "Yes, I'm sure"; press again if the dialog is still there a moment later
            this.d.press(this.findConfirm());
            presses++; lastPress = Date.now();
            end = Math.max(end, Date.now() + timing.afterConfirmWait);
          }
        }
        // Only a dialog that has closed after "Yes" counts as confirmed
        const open = dialog && this.confirmDialogOpen();
        if (presses && !open) confirmed = true;

        if (!open) {
          const now = this.readTotal();
          const totalChanged = before != null && now != null && Math.abs(now - before) > 0.009;
          const codeShown = this.watcher.text().includes(codeLc);
          if (totalChanged || codeShown || confirmed) accepted = true;
        }

        // Accepted and the page has settled: the result is final
        if (accepted && !open && this.watcher.quietFor() >= timing.settleQuiet) break;
        // Nothing new on the page for a while, but the field shows an error for this code: that's the result
        if (!accepted && !open && Date.now() - started > 4000 && this.watcher.quietFor() >= timing.settleQuiet) {
          const shown = this.promoError(item.code);
          if (shown) return this.fromMessage(shown);
        }
        await this.d.sleep(timing.poll);
      }

      // The dialog was never answered: nothing was applied, and the total behind it isn't real
      if (this.confirmDialogOpen()) {
        await this.dismissDialog();
        return { status: "unknown", total: this.readTotal(), note: "confirmation dialog not answered" };
      }
      // Final check: an error message may arrive at the very end, or be the one already under the field
      const late = this.classify(this.watcher.text()) || this.promoError(item.code);
      if (late) return this.fromMessage(late);
      if (!accepted) return { status: "unknown", total: this.readTotal() };

      const total = this.readTotal();
      const ref = this.state.baseline;
      const worse = ref != null && total != null && total > ref + 0.009;
      return { status: "ok", accepted: true, total, worse, note: worse ? "higher than before the search" : undefined };
    } finally {
      this.watcher.stop();
    }
  }

  // ------------------------------------------------------------ one attempt
  // Open the field and try one code. Returns the result, or null after a fatal error (already stopped).
  async attempt(item, { tolerant = false } = {}) {
    let failures = 0;
    for (;;) {
      if (this.stopRequested) return { status: "skipped" };
      await this.pauseIfNeeded();
      // Never type a code while a security check is on screen
      if (this.captchaVisible()) { await this.handleCaptcha(); continue; }
      // A confirmation left open earlier would swallow the next code: close it first
      if (this.confirmDialogOpen()) await this.dismissDialog();
      const input = await this.openField();
      if (!input) {
        failures++;
        if (failures < this.cfg.maxOpenFailures) { await this.d.sleep(1000); continue; }
        if (tolerant && failures < 10) {
          // While waiting, the page may have reloaded: pause and try again
          await this.wait(30000, (s) => T("msg.fieldRetry", { s }));
          continue;
        }
        this.finish("error", T("msg.noField"));
        return null;
      }
      const res = await this.tryCode(item, input);
      if (res.status === "captcha") { await this.handleCaptcha(); continue; }
      return res;
    }
  }

  // ------------------------------------------------------------ one search at a time
  /*
   * Stop only asks the current loop to end; it may still be inside a wait for a few seconds.
   * Every entry point goes through here, so a new search starts only after the old loop has exited
   * and can never run alongside it or inherit its stop request.
   */
  async exclusive(fn) {
    while (this.loop) {
      this.stopRequested = true;
      await this.loop.catch(() => {});
    }
    this.stopRequested = false;
    const p = fn();
    this.loop = p;
    try { await p; } finally { if (this.loop === p) this.loop = null; }
  }

  run(queue, mode, skipped = 0) { return this.exclusive(() => this._run(queue, mode, skipped)); }
  hunt(queue, opts = {}) { return this.exclusive(() => this._hunt(queue, opts)); }
  applyBest() { return this.exclusive(() => this._applyBest()); }
  get busy() { return !!this.loop; }

  // ------------------------------------------------------------ main loop
  async _run(queue, mode, skipped = 0) {
    this.state = this.freshState();
    this.emit({ phase: "running", mode, queue, skipped, baseline: this.readTotal(), message: T("msg.starting") });

    if (!queue.length) {
      return this.emit({ phase: "done", message: T("msg.noCodes") });
    }

    for (let i = 0; i < queue.length; i++) {
      if (this.stopRequested) break;
      const item = queue[i];
      this.emit({ index: i, current: item.code, message: T("msg.trying", { code: item.code }) });

      const res = await this.attempt(item);
      if (!res) return;
      if (res.status === "skipped") break;

      const row = { code: item.code, value: item.value, status: res.status, total: res.total ?? null, accepted: !!res.accepted, note: res.note, tries: 1 };
      this.state.results.push(row);
      this.onResult(item, res.status);
      if (res.accepted) this.state.applied = item.code;
      if (res.status === "ok") this.considerBest(row);

      if (res.stop) {
        return this.finish("error", T("msg.rateLimit"));
      }
      // Quick search: stop at the first working code, unless it's worse than before
      if (mode === "quick" && res.status === "ok" && !res.worse) break;

      this.emit({ message: `${item.code}: ${ACF.statusLabel(res.status)}` });
      if (i < queue.length - 1 && !this.stopRequested) await this.countdown((this.settings.betweenCodes ?? this.cfg.timing.betweenCodes) * (this.slowdown || 1));
    }

    if (this.stopRequested) return this.finish("done", T("msg.stopped"));

    // If the last applied code isn't the best one, re-apply the best
    if (this.state.best && this.state.applied !== this.state.best.code) {
      await this._applyBest();
    }
    const b = this.state.best;
    this.finish("done", b ? T("msg.bestCode", { code: b.code }) : T("msg.noneLowered"), !!b);
  }

  // Sold-out codes bigger than the best found: candidates for waiting
  exhaustedBetterThanBest() {
    const bestVal = this.settings.huntCollect !== false ? -1 : this.state.best ? (this.state.best.value || 0) : -1;
    return this.state.results
      .filter((r) => (r.status === "used_up" || r.status === "unknown") && (r.value || 0) > bestVal)
      .map((r) => ({ code: r.code, value: r.value, minOrder: r.minOrder }));
  }

  /*
   * WAIT FOR SOLD-OUT CODES: retry codes in rounds, back to back, with one pause between rounds.
   * - Codes that can never work (invalid, wrong country, expired, order too small) are dropped.
   * - Sold-out and no-response codes stay in the rotation.
   * - Collect mode (default): every code is applied once as soon as it frees up, whatever its size,
   *   because an entered code stays saved to the account. After each round the biggest collected
   *   code is put back on the order, so the order always ends up with the best discount.
   * - Otherwise: once a code applies, only BIGGER codes are waited for.
   */
  async _hunt(queue, opts = {}) {
    this.state = this.freshState();
    const PERMANENT = new Set(["invalid", "region", "expired", "already", "min_order", "not_eligible"]);
    const collect = opts.collect !== false;
    const roundPause = opts.roundPause ?? 30000;
    const deadline = opts.deadline ?? (opts.maxMinutes ? Date.now() + opts.maxMinutes * 60e3 : Infinity);
    let targets = queue.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
    // Savings are measured from the total before any code was tried, also when waiting follows a search
    const baseline = opts.baseline ?? this.readTotal();
    const collected = new Set(opts.collected || []);
    const startedAt = Date.now();
    const totalToCollect = () => collected.size + targets.length;
    this.emit({ phase: "running", mode: "hunt", queue: targets, round: 0, deadline, baseline, message: T("msg.waiting") });
    const names = (list, key) => list.length <= 3 ? list.map((x) => x.code).join(list.length === 2 ? ` ${T("common.and")} ` : ", ") : T(key, { n: list.length });
    // Everything needed to continue after a page reload
    const saved = () => ({ codes: targets, deadline, roundPause, baseline, best: this.state.best, collected: [...collected], collect });

    const rows = new Map();
    const record = (item, res) => {
      let r = rows.get(item.code);
      if (!r) { r = { code: item.code, value: item.value, tries: 0 }; rows.set(item.code, r); this.state.results.push(r); }
      r.tries++;
      Object.assign(r, { status: res.status, total: res.total ?? r.total ?? null, note: res.note, accepted: !!res.accepted });
      return r;
    };

    // A code applied earlier (by the search before, or before a page reload)
    if (opts.best && opts.best.code) {
      this.state.best = { ...opts.best };
      // After the extension's own reload the page may have dropped the code: put it back at the end of the round
      this.state.applied = opts.reapply ? null : opts.best.code;
      collected.add(opts.best.code);
    }
    for (const code of collected) {
      if (rows.has(code)) continue;
      const known = queue.find((q) => q.code === code) || (opts.best && opts.best.code === code ? opts.best : { code });
      const r = { code, value: known.value, tries: 0, status: "ok", total: code === (opts.best || {}).code ? opts.best.total ?? null : null, note: collect ? "collected" : "applied", accepted: true };
      rows.set(code, r); this.state.results.push(r);
    }
    targets = targets.filter((t) => !collected.has(t.code) &&
      (collect || !this.state.best || !this.state.best.value || (t.value || 0) > this.state.best.value));

    // Collect mode: after other codes were applied, put the biggest collected code back on the order
    const restoreBest = async () => {
      const b = this.state.best;
      if (!collect || !b || this.state.applied === b.code || this.stopRequested) return;
      this.emit({ current: b.code, message: T("msg.restoring", { code: b.code }) });
      const res = await this.attempt({ code: b.code, value: b.value }, { tolerant: true });
      if (res && res.accepted) {
        this.state.applied = b.code;
        if (res.total != null) b.total = res.total;
      }
    };

    // After the extension's own reload, the pause between rounds that the reload replaced is still kept
    if (opts.reapply && targets.length) await this.wait(roundPause, (s) => T("msg.nextRound", { s }));

    while (targets.length && !this.stopRequested) {
      if (Date.now() > deadline) break;
      this.state.round++;
      this.onHunt(saved());

      // One round: every remaining code back to back, no pause between them
      const round = [...targets];
      for (const [k, item] of round.entries()) {
        if (this.stopRequested || Date.now() > deadline) break;
        this.emit({ current: item.code, queue: targets, message: T("msg.roundTrying", { r: this.state.round, code: item.code, k: k + 1, n: round.length }) });

        const res = await this.attempt(item, { tolerant: true });
        if (!res) { this.onHunt(null); return; }
        if (res.status === "skipped") break;
        const row = record(item, res);
        this.onResult(item, res.status);

        if (res.status === "ok") {
          this.state.applied = item.code;
          this.considerBest(row);
          collected.add(item.code);
          if (collect) {
            // Keep going with every other sold-out code, smaller ones included
            targets = targets.filter((t) => t !== item);
            row.note = "collected";
            this.onNotify({ title: T("msg.collectedTitle", { code: item.code }), message: targets.length ? T("msg.collectedMore", { n: targets.length }) : T("msg.collectedAll") });
            this.onHunt(targets.length ? saved() : null);
            await this.codeGap();
            continue;
          }
          this.onNotify({ title: T("msg.appliedTitle", { code: item.code }), message: T("msg.appliedNotify", { off: item.value ? T("msg.offPrefix", { v: ACF.num(item.value) }) : "" }) });
          // From now on only bigger codes (unknown discount: stop)
          targets = item.value ? targets.filter((t) => (t.value || 0) > item.value) : [];
          this.onHunt(targets.length ? saved() : null);
          break;
        }
        if (res.stop) {
          await this.wait(5 * 60e3, (s) => T("msg.rateLimitWait", { m: Math.ceil(s / 60) }));
          continue;
        }
        if (PERMANENT.has(res.status)) {
          targets = targets.filter((t) => t !== item);
          this.onHunt(targets.length ? saved() : null);
        }
        await this.codeGap();
      }

      await restoreBest();
      this.state.queue = targets;
      if (!targets.length || this.stopRequested || Date.now() > deadline) break;

      // Free the page's memory with a reload between rounds; waiting continues after it
      if (opts.onRefresh && this.pageNeedsRefresh(startedAt)) {
        this.onHunt({ ...saved(), refreshed: true });
        this.emit({ current: null, message: T("msg.refreshing") });
        await this.d.sleep(1000);
        if (this.stopRequested) break;
        opts.onRefresh();
        return;
      }
      await this.wait(roundPause, (s) => {
        const b = this.state.best;
        const next = " " + T("msg.nextRound", { s });
        if (collect) {
          return T("msg.collectStatus", { c: collected.size, n: totalToCollect() }) + (b ? T("msg.onOrderPart", { code: b.code }) : "") + ". " +
            T("msg.waitingFor", { names: names(targets, "msg.namesSold") }) + next;
        }
        return (b
          ? T("msg.onlyBigger", { code: b.code, names: names(targets, "msg.namesBigger") })
          : targets.length === 1 ? T("msg.oneSoldOut", { code: targets[0].code }) : T("msg.allSoldOut", { n: targets.length })) + next;
      });
    }

    if (!this.stopRequested) await restoreBest();
    this.onHunt(null);
    if (this.stopRequested) return this.finish("done", T("msg.stoppedWaiting"));
    const b = this.state.best;
    const onOrder = b ? T("msg.onOrder", { code: b.code }) : "";
    if (collect) {
      if (!targets.length && collected.size) return this.finish("done", T("msg.allCollected", { n: collected.size }) + onOrder);
      if (Date.now() > deadline) return this.finish("done", T("msg.timeCollected", { c: collected.size, n: totalToCollect() }) + onOrder);
      if (collected.size) return this.finish("done", T("msg.collectedRest", { c: collected.size }) + onOrder);
    }
    if (b && targets.length && Date.now() > deadline) return this.finish("done", T("msg.timeStays", { code: b.code }), true);
    if (b) return this.finish("done", T(targets.length ? "msg.appliedDot" : "msg.appliedNoBigger", { code: b.code }), true);
    if (Date.now() > deadline) return this.finish("done", T("msg.timeNone"));
    this.finish("done", T("msg.nothingLeft"));
  }

  // Long enough on this page, or the page uses a lot of memory
  pageNeedsRefresh(startedAt) {
    const { refreshHeapMB } = this.cfg.timing;
    const refreshEvery = this.settings.refreshEvery || this.cfg.timing.refreshEvery;
    if (Date.now() - startedAt > refreshEvery) return true;
    const mem = globalThis.performance && performance.memory;
    return !!(mem && mem.usedJSHeapSize > refreshHeapMB * 1048576);
  }

  // Countdown shown in the status; respects pause and stop
  async wait(ms, msg) {
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopRequested) {
      if (this.state.phase === "paused") { await this.pauseIfNeeded(); continue; }
      this.emit({ current: null, message: msg(Math.ceil((end - Date.now()) / 1000)) });
      await this.d.sleep(1000);
    }
  }

  considerBest(row) {
    const b = this.state.best;
    const better = !b ||
      (row.total != null && b.total != null ? row.total < b.total - 0.009 : row.value > b.value);
    if (better) this.state.best = { code: row.code, value: row.value, total: row.total };
  }

  async _applyBest() {
    const b = this.state.best;
    if (!b) return;
    this.emit({ phase: "running", message: T("msg.reapplying", { code: b.code }), current: b.code });
    const input = await this.openField();
    if (!input) return this.emit({ message: T("msg.enterManually", { code: b.code }) });
    const res = await this.tryCode({ code: b.code, value: b.value }, input);
    if (res.accepted) {
      this.state.applied = b.code;
      if (res.total != null) b.total = res.total;
    }
  }

  // explained: the result card already says this (best code found or applied), so the message isn't repeated
  finish(phase, message, explained = false) {
    // When a code is on the order, take the saving from the page itself: the total at the start
    // may already have included an older code, so a difference of totals can understate it
    const savedOnPage = this.state.applied ? this.readSaved() : null;
    this.emit({ phase, message, current: null, savedOnPage, explained, captcha: false });
  }

  async countdown(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopRequested) await this.d.sleep(100);
  }

  async pauseIfNeeded() {
    while (this.state.phase === "paused" && !this.stopRequested) await this.d.sleep(300);
  }

  pause() { if (this.state.phase === "running") this.emit({ phase: "paused", captcha: false, message: T("msg.paused") }); }
  resume() { this._captchaAt = 0; if (this.state.phase === "paused") this.emit({ phase: "running", captcha: false, message: T("msg.resuming") }); }
  stop() {
    this.stopRequested = true;
    if (this.state.phase === "running" || this.state.phase === "paused") this.finish("done", T("msg.stopped"));
  }
};
