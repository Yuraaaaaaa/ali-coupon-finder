/*
 * Search engine: opens the promo field, enters a code, presses Apply,
 * reads the outcome (message, dialog or total change) and keeps the best code.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

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
    let lastChange = 0;
    const obs = new MutationObserver((muts) => {
      for (const m of muts) {
        const target = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (target && target.closest && target.closest("#acf-host")) continue;
        lastChange = Date.now();
        if (m.type === "characterData") chunks.push(m.target.data || "");
        for (const n of m.addedNodes || []) {
          if (n.nodeType === 3) chunks.push(n.data);
          else if (n.nodeType === 1 && n.id !== "acf-host") chunks.push(n.innerText || n.textContent || "");
        }
      }
    });
    return {
      start: () => {
        chunks = []; lastChange = Date.now();
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
      },
      stop: () => obs.disconnect(),
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
      !el.closest("#acf-host") && el.children.length <= 2 && cfg.promoLabel.test(d.textOf(el)) && d.visible(el));
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

  readTotal() {
    const { parsePrice, visible, textOf } = this.d;

    // 1) Selector the user set manually
    if (this.settings.totalSelector) {
      const el = document.querySelector(this.settings.totalSelector);
      const v = el && parsePrice(el.innerText);
      if (v != null) return v;
    }
    // 2) Known selectors
    for (const sel of this.cfg.totalSelectors) {
      const el = [...document.querySelectorAll(sel)].reverse().find(visible);
      const v = el && parsePrice(el.innerText);
      if (v != null) return v;
    }
    // 3) Heuristic: a "Total" label with a price on the same row
    const labels = [...document.querySelectorAll("span,div,p,dt,td,strong,b,label")].filter((el) =>
      !el.closest("#acf-host") && el.children.length <= 1 && visible(el) &&
      this.cfg.totalLabels.test(textOf(el)) && textOf(el).length < 30);
    for (const label of labels.reverse()) {
      let row = label.parentElement;
      for (let i = 0; i < 3 && row; i++, row = row.parentElement) {
        const txt = (row.innerText || "").replace(label.innerText || "", " ");
        if (/\d/.test(txt) && txt.length < 120) {
          const v = parsePrice(txt);
          if (v != null) return v;
        }
      }
    }
    return null;
  }

  captchaVisible() {
    return this.cfg.captchaSelectors.some((s) => [...document.querySelectorAll(s)].some(this.d.visible));
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
      let handled = false;
      let accepted = false;
      let end = Date.now() + timing.outcomeTimeout;

      while (Date.now() < end) {
        if (this.stopRequested) return { status: "skipped" };
        if (this.captchaVisible()) return { status: "captcha" };

        const msg = this.classify(this.watcher.text());
        if (msg) return this.fromMessage(msg);

        const confirm = !confirmed && !handled && this.findConfirm();
        if (confirm) {
          if (this.settings.autoConfirm === false) {
            // The user decides; only a changed total or the code on the page counts as accepted
            this.emit({ message: "Confirm the coupon change in the AliExpress dialog." });
            await this.d.waitFor(() => !this.findConfirm() || this.stopRequested, 60000);
            handled = true;
          } else {
            this.d.press(confirm);
            confirmed = true;
          }
          end = Math.max(end, Date.now() + timing.afterConfirmWait);
        }

        const now = this.readTotal();
        const totalChanged = before != null && now != null && Math.abs(now - before) > 0.009;
        const codeShown = this.watcher.text().includes(codeLc);
        if (totalChanged || codeShown || confirmed) accepted = true;

        // Accepted and the page has settled: the result is final
        if (accepted && this.watcher.quietFor() >= timing.settleQuiet) break;
        await this.d.sleep(timing.poll);
      }

      // Final check: an error message may arrive at the very end
      const late = this.classify(this.watcher.text());
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
      const input = await this.openField();
      if (!input) {
        failures++;
        if (failures < this.cfg.maxOpenFailures) { await this.d.sleep(1000); continue; }
        if (tolerant && failures < 10) {
          // While waiting, the page may have reloaded: pause and try again
          await this.wait(30000, (s) => `Promo code field not visible. Retrying in ${s}s.`);
          continue;
        }
        this.finish("error", "Couldn't find the promo code field. Open the Promo codes section on the page so the field is visible, then start again. If it still fails, use Copy diagnostics at the bottom of this panel.");
        return null;
      }
      const res = await this.tryCode(item, input);
      if (res.status === "captcha") {
        this.emit({ phase: "paused", message: "AliExpress is showing a security check. Complete it, then select Resume." });
        this.onNotify({ title: "Security check required", message: "Complete the AliExpress security check to continue searching." });
        await this.pauseIfNeeded();
        continue;
      }
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
    this.emit({ phase: "running", mode, queue, skipped, baseline: this.readTotal(), message: "Starting" });

    if (!queue.length) {
      return this.emit({ phase: "done", message: "No codes to try. Add codes for this country, or check that they meet the order minimum." });
    }

    for (let i = 0; i < queue.length; i++) {
      if (this.stopRequested) break;
      const item = queue[i];
      this.emit({ index: i, current: item.code, message: `Trying ${item.code}` });

      const res = await this.attempt(item);
      if (!res) return;
      if (res.status === "skipped") break;

      const row = { code: item.code, value: item.value, status: res.status, total: res.total ?? null, accepted: !!res.accepted, note: res.note, tries: 1 };
      this.state.results.push(row);
      this.onResult(item, res.status);
      if (res.accepted) this.state.applied = item.code;
      if (res.status === "ok") this.considerBest(row);

      if (res.stop) {
        return this.finish("error", "AliExpress is limiting attempts. Wait 10–30 minutes and start again; results so far are saved.");
      }
      // Quick search: stop at the first working code, unless it's worse than before
      if (mode === "quick" && res.status === "ok" && !res.worse) break;

      this.emit({ message: `${item.code}: ${ACF.STATUS_LABELS[res.status] || res.status}` });
      if (i < queue.length - 1 && !this.stopRequested) await this.countdown(this.settings.betweenCodes ?? this.cfg.timing.betweenCodes);
    }

    if (this.stopRequested) return this.finish("done", "Stopped");

    // If the last applied code isn't the best one, re-apply the best
    if (this.state.best && this.state.applied !== this.state.best.code) {
      await this._applyBest();
    }
    const b = this.state.best;
    this.finish("done", b ? `Best code: ${b.code}` : "None of the codes lowered the total.");
  }

  // Sold-out codes bigger than the best found: candidates for waiting
  exhaustedBetterThanBest() {
    const bestVal = this.state.best ? (this.state.best.value || 0) : -1;
    return this.state.results
      .filter((r) => (r.status === "used_up" || r.status === "unknown") && (r.value || 0) > bestVal)
      .map((r) => ({ code: r.code, value: r.value, minOrder: r.minOrder }));
  }

  /*
   * WAIT FOR SOLD-OUT CODES: retry codes in rounds until one applies.
   * - Codes that can never work (invalid, wrong country, expired, order too small) are dropped.
   * - Sold-out and no-response codes stay in the rotation.
   * - Once a code applies, only BIGGER codes are waited for (when discounts are known).
   */
  async _hunt(queue, opts = {}) {
    this.state = this.freshState();
    const PERMANENT = new Set(["invalid", "region", "expired", "already", "min_order", "not_eligible"]);
    const roundPause = opts.roundPause ?? 30000;
    const deadline = opts.deadline ?? (opts.maxMinutes ? Date.now() + opts.maxMinutes * 60e3 : Infinity);
    let targets = queue.slice().sort((a, b) => (b.value || 0) - (a.value || 0));
    // Savings are measured from the total before any code was tried, also when waiting follows a search
    const baseline = opts.baseline ?? this.readTotal();
    this.emit({ phase: "running", mode: "hunt", queue: targets, round: 0, deadline, baseline, message: "Waiting for sold-out codes" });

    const rows = new Map();
    const record = (item, res) => {
      let r = rows.get(item.code);
      if (!r) { r = { code: item.code, value: item.value, tries: 0 }; rows.set(item.code, r); this.state.results.push(r); }
      r.tries++;
      Object.assign(r, { status: res.status, total: res.total ?? r.total ?? null, note: res.note, accepted: !!res.accepted });
      return r;
    };

    while (targets.length && !this.stopRequested) {
      if (Date.now() > deadline) break;
      this.state.round++;
      this.onHunt({ codes: targets, deadline, roundPause, baseline });

      // One round: every remaining code back to back, no pause between them
      const round = [...targets];
      for (const [k, item] of round.entries()) {
        if (this.stopRequested || Date.now() > deadline) break;
        this.emit({ current: item.code, queue: targets, message: `Round ${this.state.round}: trying ${item.code} (${k + 1} of ${round.length})` });

        const res = await this.attempt(item, { tolerant: true });
        if (!res) { this.onHunt(null); return; }
        if (res.status === "skipped") break;
        const row = record(item, res);
        this.onResult(item, res.status);

        if (res.status === "ok") {
          this.state.applied = item.code;
          this.considerBest(row);
          this.onNotify({ title: `${item.code} applied`, message: `${item.value ? `${item.value} off. ` : ""}Check the total and place your order.` });
          // From now on only bigger codes (unknown discount: stop)
          targets = item.value ? targets.filter((t) => (t.value || 0) > item.value) : [];
          this.onHunt(targets.length ? { codes: targets, deadline, roundPause, baseline } : null);
          break;
        }
        if (res.stop) {
          await this.wait(5 * 60e3, (s) => `AliExpress is limiting attempts. Resuming in ${Math.ceil(s / 60)} min.`);
          continue;
        }
        if (PERMANENT.has(res.status)) {
          targets = targets.filter((t) => t !== item);
          this.onHunt(targets.length ? { codes: targets, deadline, roundPause, baseline } : null);
        }
        await this.countdown(this.cfg.timing.huntGap); // just enough for the page to settle
      }

      this.state.queue = targets;
      if (!targets.length || this.stopRequested || Date.now() > deadline) break;
      const top = targets[0];
      await this.wait(roundPause, (s) =>
        (this.state.best
          ? `${this.state.best.code} is applied. ` + (targets.length === 1 ? `Waiting for ${targets[0].code}` : `Waiting for ${targets.length} bigger codes`)
          : targets.length === 1 ? `${targets[0].code} is sold out` : `All ${targets.length} codes are sold out`) +
        `. Next round in ${s}s.`);
    }

    this.onHunt(null);
    if (this.stopRequested) return this.finish("done", "Stopped waiting");
    const b = this.state.best;
    if (b && targets.length && Date.now() > deadline) return this.finish("done", `Time limit reached. ${b.code} stays applied; no bigger code became available.`);
    if (b) return this.finish("done", `${b.code} applied` + (targets.length ? "." : ". No bigger codes left to wait for."));
    if (Date.now() > deadline) return this.finish("done", "Time limit reached. None of the codes became available.");
    this.finish("done", "Nothing left to wait for. The remaining codes are invalid or don't fit this order.");
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
    this.emit({ phase: "running", message: `Re-applying ${b.code}`, current: b.code });
    const input = await this.openField();
    if (!input) return this.emit({ message: `Enter ${b.code} manually; the promo code field wasn't found.` });
    const res = await this.tryCode({ code: b.code, value: b.value }, input);
    if (res.accepted) {
      this.state.applied = b.code;
      if (res.total != null) b.total = res.total;
    }
  }

  finish(phase, message) {
    this.emit({ phase, message, current: null });
  }

  async countdown(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopRequested) await this.d.sleep(100);
  }

  async pauseIfNeeded() {
    while (this.state.phase === "paused" && !this.stopRequested) await this.d.sleep(300);
  }

  pause() { if (this.state.phase === "running") this.emit({ phase: "paused", message: "Paused" }); }
  resume() { if (this.state.phase === "paused") this.emit({ phase: "running", message: "Resuming" }); }
  stop() {
    this.stopRequested = true;
    if (this.state.phase === "running" || this.state.phase === "paused") this.finish("done", "Stopped");
  }
};
