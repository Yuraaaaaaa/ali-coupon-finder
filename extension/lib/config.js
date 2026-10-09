/*
 * All page texts, selectors and timings in one place.
 * When AliExpress changes its layout or wording, this is the only file to edit.
 * Texts are compared in lower case with whitespace collapsed.
 */
var ACF = globalThis.ACF || (globalThis.ACF = {});

ACF.CONFIG = {
  // ---- Timings (ms) ----------------------------------------------------
  timing: {
    betweenCodes: 2000,      // delay between codes in normal searches (adjustable in Settings)
    huntGap: [1500, 2500],   // random delay between codes while waiting, min–max (adjustable in Settings)
    captchaBackoff: 2,       // after a security check, delays are multiplied by this (up to captchaBackoffMax)
    captchaBackoffMax: 4,
    openFieldWait: 1500,     // how long to wait for the field after clicking "Enter"
    outcomeTimeout: 9000,    // longest wait for a result after Apply
    afterConfirmWait: 4000,  // wait for the total to change after "Yes, I'm sure"
    settleQuiet: 700,        // how long the page must stay unchanged before a result is final
    poll: 150
  },

  maxOpenFailures: 3,        // stop after this many failed attempts to find the field

  // Languages: EN, UK, RU, DE, PL, CS.
  // ---- Controls that open the promo code field --------------------------
  openTriggers: [
    "enter", "enter code", "add", "add code", "use code", "change", "edit",
    "promo code", "promo codes", "add promo code", "enter promo code",
    "ввести", "додати", "змінити", "ввести код", "промокод", "промокоди",
    "изменить", "добавить", "ввести промокод", "промокоды",
    "eingeben", "hinzufügen", "ändern", "bearbeiten", "gutscheincode", "gutscheincodes",
    "aktionscode", "promo-code", "code eingeben", "gutscheincode eingeben",
    "wprowadź", "wpisz", "dodaj", "zmień", "kod promocyjny", "kody promocyjne", "wpisz kod",
    "zadat", "zadejte", "přidat", "změnit", "promo kód", "promo kódy", "slevový kód", "zadat kód"
  ],
  // Label of the promo code section in the order summary
  promoLabel: /^(promo ?codes?|coupon ?codes?|gutscheincodes?|gutscheine|aktionscodes?|kody? promocyjn\p{L}*|promo ?kódy?|slevov\p{L}* kódy?|промокод\p{L}*|купон\p{L}*)$/iu,
  // A control is only clicked if one of these words is nearby (in its ancestors),
  // so "Change" next to the shipping address is never clicked by mistake.
  promoContext: /promo|coupon|code|gutschein|aktionscode|kod|kód|slev|промокод|купон|код/i,

  // ---- Promo code field ------------------------------------------------
  inputHints: ["promo", "code", "coupon", "gutschein", "aktionscode", "kod", "kód", "slev", "kupon",
    "промокод", "код", "купон"],
  inputExactPlaceholders: ["enter", "eingeben", "wprowadź", "wpisz", "zadejte", "zadat"],
  // Fields that are never the promo field (address, phone, etc.)
  inputExclude: /zip|postal|post ?code|postleitzahl|plz|pocztow|psč|poštovní|phone|telefon|tel\b|e-?mail|name|imię|jméno|street|straße|ulica|ulice|city|stadt|miasto|město|card|karte|karty|cvv|search|such|szukaj|hledat/i,

  // ---- Apply button ------------------------------------------------------
  applyTexts: ["apply", "use", "redeem", "ok",
    "застосувати", "використати", "применить", "использовать",
    "anwenden", "einlösen", "übernehmen", "verwenden",
    "zastosuj", "użyj", "zatwierdź", "realizuj",
    "použít", "uplatnit", "aplikovat"],

  // ---- Confirmation dialog ("replace other coupons?") ---------------------
  confirmTexts: [
    "yes, i'm sure", "yes i'm sure", "yes", "confirm", "ok", "continue",
    "так", "так, я впевнений", "підтвердити", "продовжити",
    "да", "да, я уверен", "подтвердить", "продолжить",
    "ja", "ja, ich bin sicher", "ja, ich bin mir sicher", "bestätigen", "fortfahren", "weiter",
    "tak", "tak, jestem pewien", "tak, jestem pewny", "tak, jestem pewna", "potwierdź", "kontynuuj",
    "ano", "ano, jsem si jistý", "ano, jsem si jistá", "potvrdit", "pokračovat"
  ],
  // These texts are unambiguous: click them even outside a dialog
  confirmExact: ["yes, i'm sure", "yes i'm sure", "так, я впевнений", "да, я уверен",
    "ja, ich bin sicher", "ja, ich bin mir sicher", "tak, jestem pewien", "tak, jestem pewny",
    "tak, jestem pewna", "ano, jsem si jistý", "ano, jsem si jistá"],

  // ---- Order total labels ----------------------------------------------
  // (?![\p{L}]) instead of \b, because \b in JS doesn't handle Cyrillic or ą/ě/ü
  totalLabels: /^(total|order total|grand total|всього|разом|до сплати|итого|всего|к оплате|gesamt|gesamtsumme|gesamtbetrag|summe|zu zahlen|razem|suma|do zapłaty|łącznie|celkem|celková cena|k úhradě|k zaplacení)(?![\p{L}])/iu,
  // The page's own "Saved" line (all discounts on the order), shown as the saving when present
  savedLabels: /^(saved|you saved|you save|savings|total savings|ersparnis|gespart|sie sparen|oszczędzasz|zaoszczędzono|oszczędności|ušetříte|ušetřeno|úspora|економія|заощаджено|ви заощадили|экономия|вы экономите|вы сэкономили)(?![\p{L}])/iu,
  // Candidate selectors (heuristic; can be set manually from the panel)
  totalSelectors: [
    '[class*="order-total"] [class*="price"]',
    '[class*="total-price"]',
    '[class*="totalPrice"]',
    '[class*="summary"] [class*="total"] [class*="price"]'
  ],

  // ---- Classifying messages after Apply ---------------------------------
  // Order matters: the first match wins.
  outcomes: [
    // "You've already applied this code" is NOT an error: the code works and is applied
    { id: "applied_now",
      re: /already applied|already been applied|already in use|вже застосован|вже додан|уже применен|уже добавлен|bereits (angewendet|angewandt|hinzugefügt|aktiv)|już (został )?(zastosowan|dodan)|již (byl )?(uplatněn|přidán)/i },
    { id: "rate_limit", stop: true,
      re: /too many|try again later|frequent|забагато|спробуйте пізніше|слишком много|попробуйте позже|zu viele|später erneut|zbyt wiele|spróbuj (ponownie )?później|příliš mnoho|zkuste to (znovu )?později/i },
    { id: "region",
      re: /country or region|your region|not available in your|регіон|країн|регион|стран|land oder region|ihrem land|ihrer region|kraju lub regionie|twoim kraju|twoim regionie|zemi nebo regionu|vaší zemi|vašem regionu/i },
    { id: "already",
      re: /already (been )?used|already redeemed|вже використ|уже использ|bereits (verwendet|eingelöst|benutzt)|już (został )?(użyty|wykorzystany)|již (byl )?použit/i },
    { id: "used_up",
      re: /used up|run out|sold out|no longer available|вичерпан|закінчил|закончил|израсходован|aufgebraucht|vergriffen|nicht mehr verfügbar|wyczerpan|niedostępny|vyčerpán|již není k dispozici|už není k dispozici/i },
    { id: "min_order",
      re: /minimum|at least|min\. order|мінімальн|щонайменше|минимальн|не менее|mindestbestellwert|mindestens|minimaln|co najmniej|minimální|alespoň/i },
    { id: "expired",
      re: /expired|has ended|термін дії|закінчився|истек|срок действия|abgelaufen|nicht mehr gültig|wygasł|stracił ważność|vypršel|vypršela|platnost skončila/i },
    { id: "not_eligible",
      re: /not eligible|not applicable|doesn't apply|does not apply|не підходить|не застосов|не применим|не подходит|nicht anwendbar|nicht berechtigt|gilt nicht|nie dotyczy|nie można zastosować|nelze použít|nevztahuje/i },
    { id: "invalid",
      re: /invalid|doesn't exist|does not exist|not valid|incorrect|not found|недійсн|не існує|невірн|недействител|не существует|неверн|ungültig|existiert nicht|falsch|nieprawidłow|nieważn|nie istnieje|neplatn|neexistuje|nesprávn/i }
  ],

  // ---- Security check ----------------------------------------------------
  captchaSelectors: [
    'iframe[src*="captcha"]', 'iframe[src*="punish"]', 'iframe[src*="baxia"]', 'iframe[src*="_____tmd_____"]',
    '#baxia-dialog-content', '.baxia-dialog', '[id*="nocaptcha"]', '[class*="captcha"]', '[id^="nc_"]', '.nc-container'
  ],
  // Slider checks are also recognised by their text, inside dialogs and overlays
  captchaContainers: '[role="dialog"], [aria-modal="true"], [class*="dialog"], [class*="modal"], [class*="popup"], [class*="mask"], [class*="baxia"], [id*="baxia"], [class*="verify"], [class*="slide"]',
  captchaText: /slide to verify|drag the slider|slide to complete|verify you are human|security verification|перетягніть повзунок|протягніть, щоб підтвердити|перевірка забезпечує|перетащите ползунок|потяните ползунок|przesuń suwak|weryfikacja bezpieczeństwa|schieberegler|posuňte posuvník|přetáhněte posuvník/i
};

ACF.STATUS_LABELS = {
  ok: "Works",
  used_up: "Sold out",
  region: "Wrong country",
  min_order: "Order too small",
  expired: "Expired",
  already: "Already used",
  not_eligible: "Not eligible",
  invalid: "Invalid",
  unknown: "No response",
  rate_limit: "Rate limited",
  skipped: "Skipped"
};

// Visual tone for each status: good / wait / bad / neutral
ACF.STATUS_TONE = {
  ok: "good", used_up: "wait", unknown: "neutral", rate_limit: "wait",
  region: "bad", min_order: "bad", expired: "bad", already: "bad", not_eligible: "bad", invalid: "bad", skipped: "neutral"
};

// How long failed codes are skipped (hours)
ACF.DEAD_TTL_HOURS = {
  // "used_up" is never stored as failed: limits are topped up, and "Wait for sold-out codes" retries them
  expired: 24 * 7, invalid: 24 * 3, region: 24 * 7, already: 24 * 30
};
