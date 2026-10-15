/*
 * Interface texts in English and Ukrainian.
 * ACF.t("key", { n: 3, code: "X" }) returns the text in the current interface language.
 * A text given as { one, few, many, other } is chosen by the number n (Ukrainian has three plural forms).
 * Markup uses data-t (text), data-t-html (trusted markup), data-t-ph (placeholder), data-t-title, data-t-aria.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

(() => {
  const en = {
    "common.close": "Close",
    "common.copy": "Copy",
    "common.copied": "Copied",
    "common.copiedCode": "Copied {code}",
    "common.cancel": "Cancel",
    "common.and": "and",
    "common.unknown": "Unknown",
    "common.allCountries": "All countries",
    "common.all": "All",
    "common.off": "{v} off",

    "panel.launcher": "Coupons",
    "panel.open": "Open Coupon Finder",
    "panel.pickTotal": "Set order total manually",
    "panel.diag": "Copy diagnostics",
    "panel.diagCopied": "Diagnostics copied",
    "panel.diagFailed": "Couldn't copy. Use Settings → Diagnostics in the extension instead.",
    "panel.totalMissing": "Not found. Use “Set order total manually” below.",

    "facts.total": "Order total",
    "facts.codes": "Codes",
    "facts.skipped": {
      one: "{n} code is skipped: another country, too small an order, or failed recently.",
      other: "{n} codes are skipped: another country, too small an order, or failed recently."
    },
    "facts.totalMissing": "Order total not found on the page",

    "run.pause": "Pause",
    "run.resume": "Resume",
    "run.stop": "Stop",
    "run.showOnPage": "Show on page",
    "run.round": "Round {n}",
    "run.of": "{a} of {b}",

    "mode.again": "Search again",
    "mode.full.name": "Test every code",
    "mode.full.run": "Testing every code",
    "mode.full.desc": { one: "Tries the code and keeps the lowest total.", other: "Tries all {n} codes and keeps the lowest total." },
    "mode.quick.name": "Quick search",
    "mode.quick.run": "Quick search",
    "mode.quick.desc": "Stops at the first code that works, biggest discount first.",
    "mode.hunt.name": "Wait for sold-out codes",
    "mode.hunt.run": "Waiting for sold-out codes",
    "mode.hunt.desc": "Retries codes that ran out, in rounds, until they apply.",

    "ticket.aria": "Best code",
    "ticket.saved": "saved",
    "ticket.off": "off",
    "ticket.total": "total",
    "ticket.newTotal": "New total {v}",
    "ticket.appliedToOrder": "Applied to your order",
    "ticket.bestFound": "Best code found",
    "ticket.appliedNote": "Applied. Check the total, then place your order.",
    "ticket.copyCode": "Copy code",
    "ticket.apply": "Apply {code}",

    "offer.one": "<b>{code}</b>{off} is sold out.",
    "offer.offPart": " ({v} off)",
    "offer.many": { one: "{n} code is sold out, up to <b>{top}</b>.", other: "{n} codes are sold out, up to <b>{top}</b>." },
    "offer.topped": "Limits are topped up from time to time.",
    "offer.wait": "Wait and retry",

    "table.code": "Code",
    "table.off": "Off",
    "table.result": "Result",
    "table.total": "Total",
    "table.min": "Min. order",
    "table.last": "Last result",
    "table.notTried": "Not tried yet",
    "table.country": "Country",
    "table.codes": "Codes",
    "table.until": "Until",
    "table.drop": "Stop waiting for {code}",
    "codes.delete": "Delete {code}",

    "status.ok": "Works",
    "status.used_up": "Sold out",
    "status.region": "Wrong country",
    "status.min_order": "Order too small",
    "status.expired": "Expired",
    "status.already": "Already used",
    "status.not_eligible": "Not eligible",
    "status.invalid": "Invalid",
    "status.unknown": "No response",
    "status.rate_limit": "Rate limited",
    "status.skipped": "Skipped",

    "sw.title": "Store region",
    "sw.country": "Ship to",
    "sw.currency": "Currency",
    "sw.language": "Language",
    "sw.edit": "Edit lists",
    "sw.collapse": "Collapse",
    "sw.expand": "Expand",
    "sw.apply": "Apply and reload",
    "sw.save": "Save",
    "sw.applying": "Applying…",
    "sw.reloadNote": "The page reloads with the new settings.",
    "sw.saveNote": "AliExpress pages you open next use these settings.",
    "sw.error": "Couldn’t change the settings{e}.",
    "sw.busy": "Stop the search to change these.",
    "sw.stopFirst": "Stop the search before changing the country",
    "sw.stopPage": "stop the search on the page first",
    "sw.otherSite": "switching works on aliexpress.com only; this tab is on {host}",
    "sw.codesIn": { one: "{name}: {n} code", other: "{name}: {n} codes" },
    "sw.emptyList": "Nothing in this list. Add some in Settings.",
    "sw.currencyNote": "AliExpress shows this order in {page}; {chosen} isn’t offered for it.",
    "sw.addressNote": "This order ships to your address in {name}, so codes for {name} are tried. The country above is used for browsing; to ship this order elsewhere, change the shipping address on this page.",

    "msg.captcha": "AliExpress is showing a security check. Complete it, then select Resume. Codes will be tried more slowly after this.",
    "msg.captchaTitle": "Security check required",
    "msg.captchaNotify": "Complete the AliExpress security check, then select Resume in the Coupons panel.",
    "msg.confirmDialog": "Confirm the coupon change in the AliExpress dialog.",
    "msg.noField": "Couldn't find the promo code field. Open the Promo codes section on the page so the field is visible, then start again. If it still fails, use Copy diagnostics at the bottom of this panel.",
    "msg.fieldRetry": "Promo code field not visible. Retrying in {s}s.",
    "msg.starting": "Starting",
    "msg.noCodes": "No codes to try. Add codes for this country, or check that they meet the order minimum.",
    "msg.trying": "Trying {code}",
    "msg.rateLimit": "AliExpress is limiting attempts. Wait 10–30 minutes and start again; results so far are saved.",
    "msg.rateLimitWait": "AliExpress is limiting attempts. Resuming in {m} min.",
    "msg.stopped": "Stopped",
    "msg.stoppedWaiting": "Stopped waiting",
    "msg.bestCode": "Best code: {code}",
    "msg.noneLowered": "None of the codes lowered the total.",
    "msg.waiting": "Waiting for sold-out codes",
    "msg.restoring": "Putting {code} back on the order",
    "msg.roundTrying": "Round {r}: trying {code} ({k} of {n})",
    "msg.collectedTitle": "{code} collected",
    "msg.collectedMore": { one: "{n} more is still sold out. Waiting continues.", other: "{n} more still sold out. Waiting continues." },
    "msg.collectedAll": "All codes are collected.",
    "msg.appliedTitle": "{code} applied",
    "msg.appliedNotify": "{off}Check the total and place your order.",
    "msg.offPrefix": "{v} off. ",
    "msg.collectStatus": "Collected {c} of {n}",
    "msg.onOrderPart": "; {code} is on the order",
    "msg.waitingFor": "Waiting for {names}.",
    "msg.onlyBigger": "{code} is applied; only bigger codes can beat it. Waiting for {names}.",
    "msg.oneSoldOut": "{code} is sold out.",
    "msg.allSoldOut": { one: "{n} code is sold out.", other: "All {n} codes are sold out." },
    "msg.nextRound": "Next round in {s}s.",
    "msg.namesSold": { one: "{n} sold-out code", other: "{n} sold-out codes" },
    "msg.namesBigger": { one: "{n} bigger code", other: "{n} bigger codes" },
    "msg.onOrder": " {code} is on the order.",
    "msg.allCollected": { one: "{n} code collected.", other: "All {n} codes collected." },
    "msg.timeCollected": "Time limit reached. Collected {c} of {n}.",
    "msg.collectedRest": "Collected {c}; the rest are invalid or don't fit this order.",
    "msg.timeStays": "Time limit reached. {code} stays applied; no bigger code became available.",
    "msg.appliedDot": "{code} applied.",
    "msg.appliedNoBigger": "{code} applied. No bigger codes left to wait for.",
    "msg.timeNone": "Time limit reached. None of the codes became available.",
    "msg.nothingLeft": "Nothing left to wait for. The remaining codes are invalid or don't fit this order.",
    "msg.reapplying": "Re-applying {code}",
    "msg.enterManually": "Enter {code} manually; the promo code field wasn't found.",
    "msg.applied": "{code} applied",
    "msg.applyFailed": "Couldn't apply {code}. Enter it manually.",
    "msg.theCode": "the code",
    "msg.paused": "Paused",
    "msg.resuming": "Resuming",
    "msg.reloaded": "Page reloaded. Continuing to wait for sold-out codes.",
    "msg.refreshing": "Reloading the page to free memory. Waiting continues after it.",
    "msg.pickTotal": "Click the order total on the page. Press Esc to cancel.",
    "msg.pickNoPrice": "That element doesn't contain a price. Click the order total.",
    "msg.totalSet": "Order total set to {v}",
    "msg.cancelled": "Cancelled",

    "tab.search": "Search",
    "tab.codes": "Codes",
    "tab.settings": "Settings",
    "tab.history": "History",

    "pop.notCheckoutTitle": "Open an AliExpress checkout",
    "pop.notCheckoutText": "Add items to your cart and select <b>Checkout</b>. Searches run on that page, and a Coupons button appears in its corner.",
    "pop.loadingTitle": "Connecting to the page",
    "pop.loadingText": "If this doesn’t change in a few seconds, reload the checkout page.",

    "codes.paste": "Paste a post",
    "codes.editText": "Edit as text",
    "codes.importLabel": "Paste a post with codes",
    "codes.importPh": "Copy the whole post from Telegram and paste it here.",
    "codes.importNote": "Codes are sorted into countries using the post’s headings. Discount, minimum order and end date are read from each line.",
    "codes.addExisting": "Add to existing",
    "codes.replace": "Replace",
    "codes.asText": "Codes as text",
    "codes.editPh": "One code per line, for example:\nDEPRD60 60 min 475\nDEPRD45 45 min 355\nIFPXXXXX",
    "codes.done": "Done",
    "codes.hintAll": "Tried in every country.",
    "codes.hintCountry": "Tried only when AliExpress ships to {name}.",
    "codes.forAll": "Codes for all countries",
    "codes.forCountry": "Codes for {name}",
    "codes.here": " (current shipping country)",
    "codes.emptyAll": "No codes for all countries",
    "codes.empty": "No codes for {name}",
    "codes.emptyText": "Paste a post from Telegram, or add codes as text.",
    "codes.count": { one: "{n} code", other: "{n} codes" },
    "codes.validUntil": ", valid until {d}",
    "codes.saved": "Saved. ",
    "codes.none": "No codes yet.",
    "codes.badLines": { one: "{n} line doesn’t look like a code.", other: "{n} lines don’t look like a code." },
    "codes.format": "Format: <code>CODE 60 min 475</code>; discount and minimum are optional.",
    "codes.notFound": "No codes found. Codes are 4–32 letters and digits, like DEPRD60.",
    "codes.imported": { one: "Imported {n} code. ", other: "Imported {n} codes. " },
    "codes.added": { one: "Added {n} code. ", other: "Added {n} codes. " },
    "codes.summaryRange": "{lo}–{hi} off",
    "codes.summaryUntil": "until {d}",

    "set.ui": "Interface",
    "set.uiLang": "Interface language",
    "set.uiLangNote": "Language of this extension. “Same as AliExpress” follows the language chosen in the Store region block: Ukrainian when AliExpress is in Ukrainian, English otherwise.",
    "set.uiAuto": "Same as AliExpress",
    "set.qs": "Quick switch",
    "set.qsNote": "Countries, currencies and languages you switch between. They appear as one-tap choices on the Search tab and on the checkout page, and each country gets its own code list.",
    "set.countries": "Countries",
    "set.currencies": "Currencies",
    "set.languages": "Languages",
    "set.addCountry": "Add a country",
    "set.addCurrency": "Add a currency",
    "set.addLanguage": "Add a language",
    "set.remove": "Remove {x}",
    "set.favEmpty": "Nothing yet. Add at least one.",
    "set.noMatches": "No matches",
    "set.search": "Search",
    "set.autoConfirm": "Confirm coupon swaps automatically",
    "set.autoConfirmNote": "When AliExpress asks to replace the current coupon, accept it so totals can be compared.",
    "set.skipDead": "Skip codes that recently failed",
    "set.skipDeadNote": "Invalid codes are skipped for 3 days, expired and wrong-country codes for 7, already used codes for 30. Sold-out codes are always retried.",
    "set.betweenCodes": "Delay between codes",
    "set.hunt": "Waiting for sold-out codes",
    "set.collect": "Collect every code",
    "set.collectNote": "Apply each sold-out code as soon as it frees up, smaller ones too, so it’s saved to your account. The biggest one is put back on the order after each round. When off, only codes bigger than the applied one are waited for.",
    "set.huntGapNote": "A random pause before each next code in a round. Longer is less likely to trigger AliExpress security checks.",
    "set.huntPause": "Pause between rounds",
    "set.huntPauseNote": "After trying every sold-out code, wait this long before the next round.",
    "set.huntMinutes": "Stop after",
    "set.trouble": "Troubleshooting",
    "set.totalDetect": "Order total detection",
    "set.totalDetectNote": "Use this if you set the total manually and it’s now wrong.",
    "set.reset": "Reset",
    "set.diag": "Diagnostics",
    "set.diagNote": "Copies the promo code section of the checkout page, without your name or address.",
    "set.failed": "Failed codes",
    "set.failedNote": "Forget which codes failed so they’re tried again.",
    "set.failedCount": { one: "{n} code is marked as failed. Forget it so it’s tried again.", other: "{n} codes are marked as failed. Forget them so they’re tried again." },
    "set.failedNone": "No codes are marked as failed.",
    "set.forget": "Forget",
    "set.shared": "Shared code list",
    "set.optional": "Optional",
    "set.sharedNote": "Keep codes in one file on GitHub so everyone using the extension gets new codes automatically every 6 hours. You don’t need this if you add codes yourself.",
    "set.sharedAria": "Shared list link",
    "set.update": "Update",
    "set.totalReset": "Order total detection reset.",
    "set.openCheckout": "Open an AliExpress checkout page first.",
    "set.noResponse": "The page isn’t responding. Reload it and try again.",
    "set.diagCopied": "Diagnostics copied. Paste them into your message.",
    "set.forgotten": "Failed codes forgotten.",
    "set.remoteCount": { one: "{n} code, updated {d}.", other: "{n} codes, updated {d}." },
    "set.remoteNotYet": "Not downloaded yet. Select Update.",
    "set.updating": "Updating…",
    "set.updateFailed": "Couldn’t update: {e}",
    "set.unknownError": "unknown error",

    "time.sec": { one: "{n} second", other: "{n} seconds" },
    "time.secRange": "{a}–{b} seconds",
    "time.min": { one: "{n} minute", other: "{n} minutes" },
    "time.hour": { one: "{n} hour", other: "{n} hours" },
    "time.never": "Never",

    "hist.emptyTitle": "No applied codes yet",
    "hist.emptyText": "Codes that lower your total are listed here so you can reuse them.",
    "hist.copy": "Copy {code}"
  };

  const uk = {
    "common.close": "Закрити",
    "common.copy": "Копіювати",
    "common.copied": "Скопійовано",
    "common.copiedCode": "Скопійовано {code}",
    "common.cancel": "Скасувати",
    "common.and": "і",
    "common.unknown": "Невідомо",
    "common.allCountries": "Усі країни",
    "common.all": "Усі",
    "common.off": "знижка {v}",

    "panel.launcher": "Купони",
    "panel.open": "Відкрити Coupon Finder",
    "panel.pickTotal": "Вказати суму вручну",
    "panel.diag": "Копіювати діагностику",
    "panel.diagCopied": "Діагностику скопійовано",
    "panel.diagFailed": "Не вдалося скопіювати. Скористайтеся Налаштування → Діагностика в розширенні.",
    "panel.totalMissing": "Не знайдено. Скористайтеся «Вказати суму вручну» нижче.",

    "facts.total": "Сума замовлення",
    "facts.codes": "Коди",
    "facts.skipped": {
      one: "{n} код пропущено: інша країна, замала сума або нещодавно не спрацював.",
      few: "{n} коди пропущено: інша країна, замала сума або нещодавно не спрацювали.",
      many: "{n} кодів пропущено: інша країна, замала сума або нещодавно не спрацювали."
    },
    "facts.totalMissing": "Суму замовлення на сторінці не знайдено",

    "run.pause": "Пауза",
    "run.resume": "Продовжити",
    "run.stop": "Зупинити",
    "run.showOnPage": "Показати на сторінці",
    "run.round": "Раунд {n}",
    "run.of": "{a} з {b}",

    "mode.again": "Шукати ще раз",
    "mode.full.name": "Перевірити всі коди",
    "mode.full.run": "Перевіряю всі коди",
    "mode.full.desc": {
      one: "Пробує {n} код і залишає найменшу суму.",
      few: "Пробує всі {n} коди і залишає найменшу суму.",
      many: "Пробує всі {n} кодів і залишає найменшу суму."
    },
    "mode.quick.name": "Швидкий пошук",
    "mode.quick.run": "Швидкий пошук",
    "mode.quick.desc": "Зупиняється на першому робочому коді, починаючи з найбільшої знижки.",
    "mode.hunt.name": "Чекати коди, що закінчилися",
    "mode.hunt.run": "Чекаю коди, що закінчилися",
    "mode.hunt.desc": "Повторює коди, що закінчилися, раундами, доки вони не спрацюють.",

    "ticket.aria": "Найкращий код",
    "ticket.saved": "заощаджено",
    "ticket.off": "знижка",
    "ticket.total": "сума",
    "ticket.newTotal": "Нова сума {v}",
    "ticket.appliedToOrder": "Застосовано до замовлення",
    "ticket.bestFound": "Найкращий код",
    "ticket.appliedNote": "Застосовано. Перевірте суму й оформіть замовлення.",
    "ticket.copyCode": "Копіювати код",
    "ticket.apply": "Застосувати {code}",

    "offer.one": "<b>{code}</b>{off} закінчився.",
    "offer.offPart": " (знижка {v})",
    "offer.many": {
      one: "{n} код закінчився, найбільший — <b>{top}</b>.",
      few: "{n} коди закінчилися, найбільший — <b>{top}</b>.",
      many: "{n} кодів закінчилися, найбільший — <b>{top}</b>."
    },
    "offer.topped": "Ліміти час від часу поповнюються.",
    "offer.wait": "Чекати й повторювати",

    "table.code": "Код",
    "table.off": "Знижка",
    "table.result": "Результат",
    "table.total": "Сума",
    "table.min": "Мін. сума",
    "table.last": "Останній результат",
    "table.notTried": "Ще не перевірявся",
    "table.country": "Країна",
    "table.codes": "Коди",
    "table.until": "До",
    "table.drop": "Більше не чекати {code}",
    "codes.delete": "Видалити {code}",

    "status.ok": "Працює",
    "status.used_up": "Закінчився",
    "status.region": "Інша країна",
    "status.min_order": "Замала сума",
    "status.expired": "Прострочений",
    "status.already": "Вже використаний",
    "status.not_eligible": "Не підходить",
    "status.invalid": "Недійсний",
    "status.unknown": "Немає відповіді",
    "status.rate_limit": "Ліміт спроб",
    "status.skipped": "Пропущено",

    "sw.title": "Регіон магазину",
    "sw.country": "Доставка в",
    "sw.currency": "Валюта",
    "sw.language": "Мова",
    "sw.edit": "Редагувати списки",
    "sw.collapse": "Згорнути",
    "sw.expand": "Розгорнути",
    "sw.apply": "Застосувати й оновити",
    "sw.save": "Зберегти",
    "sw.applying": "Застосовую…",
    "sw.reloadNote": "Сторінка оновиться з новими налаштуваннями.",
    "sw.saveNote": "Наступні сторінки AliExpress відкриються з цими налаштуваннями.",
    "sw.error": "Не вдалося змінити налаштування{e}.",
    "sw.busy": "Зупиніть пошук, щоб змінити це.",
    "sw.stopFirst": "Зупиніть пошук, перш ніж змінювати країну",
    "sw.stopPage": "спершу зупиніть пошук на сторінці",
    "sw.otherSite": "перемикання працює лише на aliexpress.com, а ця вкладка на {host}",
    "sw.codesIn": { one: "{name}: {n} код", few: "{name}: {n} коди", many: "{name}: {n} кодів" },
    "sw.emptyList": "Список порожній. Додайте в Налаштуваннях.",
    "sw.currencyNote": "AliExpress показує це замовлення в {page}; {chosen} для нього недоступна.",
    "sw.addressNote": "Це замовлення доставляється на вашу адресу (країна: {name}), тому пробуються коди саме для неї. Країна вище діє для перегляду товарів; щоб доставити це замовлення в іншу країну, змініть адресу доставки на цій сторінці.",

    "msg.captcha": "AliExpress показує перевірку безпеки. Пройдіть її й натисніть «Продовжити». Після цього коди пробуватимуться повільніше.",
    "msg.captchaTitle": "Потрібна перевірка безпеки",
    "msg.captchaNotify": "Пройдіть перевірку безпеки AliExpress і натисніть «Продовжити» в панелі «Купони».",
    "msg.confirmDialog": "Підтвердьте заміну купона у вікні AliExpress.",
    "msg.noField": "Не вдалося знайти поле промокоду. Відкрийте розділ Promo codes на сторінці, щоб поле було видно, і почніть знову. Якщо не допоможе, скористайтеся «Копіювати діагностику» внизу панелі.",
    "msg.fieldRetry": "Поле промокоду не видно. Повтор через {s} с.",
    "msg.starting": "Починаю",
    "msg.noCodes": "Немає кодів для перевірки. Додайте коди для цієї країни або перевірте мінімальну суму.",
    "msg.trying": "Пробую {code}",
    "msg.rateLimit": "AliExpress обмежує спроби. Зачекайте 10–30 хвилин і почніть знову; результати збережено.",
    "msg.rateLimitWait": "AliExpress обмежує спроби. Продовжу через {m} хв.",
    "msg.stopped": "Зупинено",
    "msg.stoppedWaiting": "Очікування зупинено",
    "msg.bestCode": "Найкращий код: {code}",
    "msg.noneLowered": "Жоден код не зменшив суму.",
    "msg.waiting": "Чекаю коди, що закінчилися",
    "msg.restoring": "Повертаю {code} на замовлення",
    "msg.roundTrying": "Раунд {r}: пробую {code} ({k} з {n})",
    "msg.collectedTitle": "{code} зібрано",
    "msg.collectedMore": {
      one: "Ще {n} закінчився. Очікування триває.",
      few: "Ще {n} закінчилися. Очікування триває.",
      many: "Ще {n} закінчилися. Очікування триває."
    },
    "msg.collectedAll": "Усі коди зібрано.",
    "msg.appliedTitle": "{code} застосовано",
    "msg.appliedNotify": "{off}Перевірте суму й оформіть замовлення.",
    "msg.offPrefix": "Знижка {v}. ",
    "msg.collectStatus": "Зібрано {c} з {n}",
    "msg.onOrderPart": "; на замовленні {code}",
    "msg.waitingFor": "Чекаю {names}.",
    "msg.onlyBigger": "{code} застосовано; перевершити його можуть лише більші коди. Чекаю {names}.",
    "msg.oneSoldOut": "{code} закінчився.",
    "msg.allSoldOut": { one: "{n} код закінчився.", few: "Усі {n} коди закінчилися.", many: "Усі {n} кодів закінчилися." },
    "msg.nextRound": "Наступний раунд через {s} с.",
    "msg.namesSold": { one: "{n} код, що закінчився", few: "{n} коди, що закінчилися", many: "{n} кодів, що закінчилися" },
    "msg.namesBigger": { one: "{n} більший код", few: "{n} більші коди", many: "{n} більших кодів" },
    "msg.onOrder": " На замовленні {code}.",
    "msg.allCollected": { one: "Зібрано {n} код.", few: "Зібрано всі {n} коди.", many: "Зібрано всі {n} кодів." },
    "msg.timeCollected": "Час вичерпано. Зібрано {c} з {n}.",
    "msg.collectedRest": "Зібрано {c}; решта недійсні або не підходять для цього замовлення.",
    "msg.timeStays": "Час вичерпано. {code} лишається застосованим; більший код так і не звільнився.",
    "msg.appliedDot": "{code} застосовано.",
    "msg.appliedNoBigger": "{code} застосовано. Більших кодів чекати немає.",
    "msg.timeNone": "Час вичерпано. Жоден код не звільнився.",
    "msg.nothingLeft": "Більше нічого чекати. Решта кодів недійсні або не підходять для цього замовлення.",
    "msg.reapplying": "Повторно застосовую {code}",
    "msg.enterManually": "Введіть {code} вручну: поле промокоду не знайдено.",
    "msg.applied": "{code} застосовано",
    "msg.applyFailed": "Не вдалося застосувати {code}. Введіть його вручну.",
    "msg.theCode": "код",
    "msg.paused": "Пауза",
    "msg.resuming": "Продовжую",
    "msg.reloaded": "Сторінку оновлено. Продовжую чекати коди, що закінчилися.",
    "msg.refreshing": "Оновлюю сторінку, щоб звільнити пам’ять. Очікування продовжиться після цього.",
    "msg.pickTotal": "Клацніть суму замовлення на сторінці. Esc — скасувати.",
    "msg.pickNoPrice": "У цьому елементі немає ціни. Клацніть суму замовлення.",
    "msg.totalSet": "Суму замовлення встановлено: {v}",
    "msg.cancelled": "Скасовано",

    "tab.search": "Пошук",
    "tab.codes": "Коди",
    "tab.settings": "Налаштування",
    "tab.history": "Історія",

    "pop.notCheckoutTitle": "Відкрийте оформлення замовлення",
    "pop.notCheckoutText": "Додайте товари в кошик і натисніть <b>Checkout</b>. Пошук працює на тій сторінці, а в її куті з’явиться кнопка «Купони».",
    "pop.loadingTitle": "Підключення до сторінки",
    "pop.loadingText": "Якщо за кілька секунд нічого не зміниться, оновіть сторінку оформлення.",

    "codes.paste": "Вставити пост",
    "codes.editText": "Редагувати текстом",
    "codes.importLabel": "Вставте пост із кодами",
    "codes.importPh": "Скопіюйте весь пост із Telegram і вставте сюди.",
    "codes.importNote": "Коди розподіляються за країнами за заголовками поста. Знижка, мінімальна сума й дата закінчення читаються з кожного рядка.",
    "codes.addExisting": "Додати до наявних",
    "codes.replace": "Замінити",
    "codes.asText": "Коди текстом",
    "codes.editPh": "Один код на рядок, наприклад:\nDEPRD60 60 min 475\nDEPRD45 45 min 355\nIFPXXXXX",
    "codes.done": "Готово",
    "codes.hintAll": "Пробуються в будь-якій країні.",
    "codes.hintCountry": "Пробуються, лише коли країна доставки — {name}.",
    "codes.forAll": "Коди для всіх країн",
    "codes.forCountry": "Коди: {name}",
    "codes.here": " (поточна країна доставки)",
    "codes.emptyAll": "Немає кодів для всіх країн",
    "codes.empty": "Немає кодів: {name}",
    "codes.emptyText": "Вставте пост із Telegram або додайте коди текстом.",
    "codes.count": { one: "{n} код", few: "{n} коди", many: "{n} кодів" },
    "codes.validUntil": ", дійсні до {d}",
    "codes.saved": "Збережено. ",
    "codes.none": "Кодів ще немає.",
    "codes.badLines": { one: "{n} рядок не схожий на код.", few: "{n} рядки не схожі на код.", many: "{n} рядків не схожі на код." },
    "codes.format": "Формат: <code>CODE 60 min 475</code>; знижка й мінімум необов’язкові.",
    "codes.notFound": "Кодів не знайдено. Код — це 4–32 літери й цифри, наприклад DEPRD60.",
    "codes.imported": { one: "Імпортовано {n} код. ", few: "Імпортовано {n} коди. ", many: "Імпортовано {n} кодів. " },
    "codes.added": { one: "Додано {n} код. ", few: "Додано {n} коди. ", many: "Додано {n} кодів. " },
    "codes.summaryRange": "знижка {lo}–{hi}",
    "codes.summaryUntil": "до {d}",

    "set.ui": "Інтерфейс",
    "set.uiLang": "Мова інтерфейсу",
    "set.uiLangNote": "Мова самого розширення. «Як на AliExpress» іде за мовою, вибраною в блоці «Регіон магазину»: українська, коли AliExpress українською, інакше англійська.",
    "set.uiAuto": "Як на AliExpress",
    "set.qs": "Швидке перемикання",
    "set.qsNote": "Країни, валюти й мови, між якими ви перемикаєтеся. Вони з’являються кнопками на вкладці «Пошук» і на сторінці оформлення, а кожна країна має власний список кодів.",
    "set.countries": "Країни",
    "set.currencies": "Валюти",
    "set.languages": "Мови",
    "set.addCountry": "Додати країну",
    "set.addCurrency": "Додати валюту",
    "set.addLanguage": "Додати мову",
    "set.remove": "Видалити {x}",
    "set.favEmpty": "Порожньо. Додайте хоча б один пункт.",
    "set.noMatches": "Нічого не знайдено",
    "set.search": "Пошук",
    "set.autoConfirm": "Автоматично підтверджувати заміну купона",
    "set.autoConfirmNote": "Коли AliExpress питає, чи замінити поточний купон, погоджуватися, щоб можна було порівняти суми.",
    "set.skipDead": "Пропускати коди, що нещодавно не спрацювали",
    "set.skipDeadNote": "Недійсні коди пропускаються 3 дні, прострочені й для іншої країни — 7, уже використані — 30. Коди, що закінчилися, пробуються завжди.",
    "set.betweenCodes": "Затримка між кодами",
    "set.hunt": "Очікування кодів, що закінчилися",
    "set.collect": "Збирати всі коди",
    "set.collectNote": "Застосовувати кожен код, щойно він звільниться, зокрема менші, щоб він закріпився за акаунтом. Після кожного раунду на замовлення повертається найбільший. Якщо вимкнено, очікуються лише коди, більші за застосований.",
    "set.huntGapNote": "Випадкова пауза перед кожним наступним кодом у раунді. Що довша, то менше шансів на перевірку безпеки AliExpress.",
    "set.huntPause": "Пауза між раундами",
    "set.huntPauseNote": "Скільки чекати після перевірки всіх кодів перед наступним раундом.",
    "set.huntMinutes": "Зупинити через",
    "set.trouble": "Усунення проблем",
    "set.totalDetect": "Визначення суми замовлення",
    "set.totalDetectNote": "Якщо ви вказали суму вручну і тепер вона визначається неправильно.",
    "set.reset": "Скинути",
    "set.diag": "Діагностика",
    "set.diagNote": "Копіює розділ промокодів зі сторінки оформлення, без вашого імені й адреси.",
    "set.failed": "Коди, що не спрацювали",
    "set.failedNote": "Забути, які коди не спрацювали, щоб спробувати їх знову.",
    "set.failedCount": {
      one: "{n} код позначено як невдалий. Забудьте, щоб спробувати знову.",
      few: "{n} коди позначено як невдалі. Забудьте, щоб спробувати знову.",
      many: "{n} кодів позначено як невдалі. Забудьте, щоб спробувати знову."
    },
    "set.failedNone": "Невдалих кодів немає.",
    "set.forget": "Забути",
    "set.shared": "Спільний список кодів",
    "set.optional": "Необов’язково",
    "set.sharedNote": "Зберігайте коди в одному файлі на GitHub, і всі, хто користується розширенням, отримуватимуть нові коди автоматично кожні 6 годин. Якщо додаєте коди самі, це не потрібно.",
    "set.sharedAria": "Посилання на спільний список",
    "set.update": "Оновити",
    "set.totalReset": "Визначення суми скинуто.",
    "set.openCheckout": "Спершу відкрийте сторінку оформлення AliExpress.",
    "set.noResponse": "Сторінка не відповідає. Оновіть її й спробуйте ще раз.",
    "set.diagCopied": "Діагностику скопійовано. Вставте її у своє повідомлення.",
    "set.forgotten": "Невдалі коди забуто.",
    "set.remoteCount": { one: "{n} код, оновлено {d}.", few: "{n} коди, оновлено {d}.", many: "{n} кодів, оновлено {d}." },
    "set.remoteNotYet": "Ще не завантажено. Натисніть «Оновити».",
    "set.updating": "Оновлення…",
    "set.updateFailed": "Не вдалося оновити: {e}",
    "set.unknownError": "невідома помилка",

    "time.sec": { one: "{n} секунда", few: "{n} секунди", many: "{n} секунд" },
    "time.secRange": "{a}–{b} секунди",
    "time.min": { one: "{n} хвилина", few: "{n} хвилини", many: "{n} хвилин" },
    "time.hour": { one: "{n} година", few: "{n} години", many: "{n} годин" },
    "time.never": "Ніколи",

    "hist.emptyTitle": "Ще немає застосованих кодів",
    "hist.emptyText": "Тут з’являються коди, що зменшили суму, щоб ними можна було скористатися знову.",
    "hist.copy": "Копіювати {code}"
  };

  const DICT = { en, uk };
  const LOCALE = { en: "en-GB", uk: "uk-UA" };
  let lang = "en";

  ACF.UI_LANGS = { en: "English", uk: "Українська" };
  ACF.I18N_DICT = DICT; // for tests

  // Default before the user picks one: Ukrainian if the browser is in Ukrainian
  ACF.defaultUiLang = () => {
    let l = "";
    try { l = (globalThis.chrome && chrome.i18n && chrome.i18n.getUILanguage()) || ""; } catch (e) {}
    if (!l && globalThis.navigator) l = navigator.language || "";
    return /^uk/i.test(l) ? "uk" : "en";
  };
  ACF.setLang = (l) => { lang = DICT[l] ? l : "en"; };
  ACF.getLang = () => lang;
  ACF.locale = () => LOCALE[lang];
  /*
   * Interface language: the one picked in Settings, or by default ("auto") the same as AliExpress's language
   * (Ukrainian when AliExpress is in Ukrainian, English for any other); the browser's when that isn't known.
   */
  ACF.uiLangFrom = (settings, aliLocale) => {
    if (settings && DICT[settings.uiLang]) return settings.uiLang;
    if (aliLocale) return /^uk/i.test(aliLocale) ? "uk" : "en";
    return ACF.defaultUiLang();
  };

  const rules = {};
  const pluralOf = (n) => (rules[lang] || (rules[lang] = new Intl.PluralRules(LOCALE[lang]))).select(Number(n) || 0);

  ACF.t = (key, vars) => {
    let s = DICT[lang][key] ?? en[key] ?? key;
    if (s && typeof s === "object") {
      const n = vars ? vars.n : 0;
      s = s[pluralOf(n)] ?? s.other ?? s.many;
    }
    return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] != null ? vars[k] : ""));
  };

  ACF.statusLabel = (s) => (DICT.en["status." + s] ? ACF.t("status." + s) : s);

  // Country names in the interface language (AliExpress uses a few non-ISO ids)
  const ISO = { UK: "GB", SRB: "RS", MNE: "ME", KS: "XK", ZR: "CD" };
  ACF.ISO_OF = ISO;
  let names = null, namesLang = null;
  ACF.countryName = (id) => {
    if (!id) return ACF.t("common.unknown");
    const english = (ACF.STORE && ACF.STORE.countries[id]) || id;
    if (lang === "en") return english;
    try {
      if (namesLang !== lang) { names = new Intl.DisplayNames([LOCALE[lang]], { type: "region", fallback: "none" }); namesLang = lang; }
      const iso = ISO[id] || id;
      const n = /^[A-Z]{2}$/.test(iso) && names.of(iso);
      if (n) return n;
    } catch (e) {}
    return english;
  };

  // Static markup: fills every element marked with data-t* in root
  ACF.applyI18n = (root) => {
    root.querySelectorAll("[data-t]").forEach((el) => { el.textContent = ACF.t(el.dataset.t); });
    root.querySelectorAll("[data-t-html]").forEach((el) => { el.innerHTML = ACF.t(el.dataset.tHtml); });
    root.querySelectorAll("[data-t-ph]").forEach((el) => { el.placeholder = ACF.t(el.dataset.tPh); });
    root.querySelectorAll("[data-t-title]").forEach((el) => { el.title = ACF.t(el.dataset.tTitle); });
    root.querySelectorAll("[data-t-aria]").forEach((el) => { el.setAttribute("aria-label", ACF.t(el.dataset.tAria)); });
  };
})();
