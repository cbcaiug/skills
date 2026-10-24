# 03 — Pay modal UX spec (payment screens ONLY)

Template: `assets/payModal.js` + `assets/payModal.css`. UI tests: `assets/tests/paymodal-ui.test.mjs` (needs `npm i jsdom`).
Split of the spec: **NON-NEGOTIABLE** (behaviour — never change without the user's explicit say-so) vs **THEMEABLE** (colours, wording, spacing — match the host app).

## NON-NEGOTIABLE behaviour
1. **No double submits.** First line of the click handler sets a `busy` flag *synchronously*; the button is also disabled and shows a spinner. (Tested: 3 rapid clicks → 1 request.)
2. **While a request is in flight (`submitting`, `waiting`) everything is locked EXCEPT Cancel**: plan, country, phone, Pay button, ✕/overlay/Esc. The form is wrapped in a `<fieldset disabled>` and dimmed.
3. **Cancel is instant and total.** Generation counter `S.gen++` invalidates every in-flight poll/request; timers cleared; UI unlocks *immediately* (no waiting for the network); late responses are ignored. Telecom may still re-prompt the phone — that's outside our control, and the UI must not stay frozen because of it.
4. **Cancel is honest.** Message: *"If you did not approve it on your phone, nothing was charged. If you already approved it, your credits will still be added automatically."* (True because of `payment_reconcile`.)
5. **Every state has visible feedback** — a panel in the modal AND a toast. No silent transitions.
6. **Stay-on-page warning** while waiting, in plain words: keep the page open; don't close the tab/app; stay online — otherwise the payment can't be confirmed. Plus `beforeunload` prompt.
7. **A failed/slow poll never fails the payment.** After 3 consecutive poll failures show a banner "Connection problem — still trying…" and keep trying until the wait limit.
8. **Offline handling:** banner + auto-resume on `online`; poll immediately when the tab becomes visible again.
9. **A timeout is not a failure.** Message says "we stopped waiting; credits will be added automatically if you approved". Offer *Check again* / *Start a new payment*.
10. **PENDING_EXISTS resumes** the existing waiting screen instead of showing an error or charging twice.
11. **Never display raw errors.** Map `error_code` → friendly text; show `(ref <rid>)` so support can find the log line.
12. **Never log tokens/full phone numbers** (see 05).

## State machine
| phase | meaning | Pay button | Cancel/Close button | Form | Panel | Toast |
|---|---|---|---|---|---|---|
| `form` | idle | "Pay now" enabled | "Close" | enabled | – | – |
| `submitting` | request to GAS in flight (1–5 s) | spinner "Sending request…" disabled | **"Cancel" enabled** | disabled+dim | spinner "Contacting the payment service…" | – |
| `waiting` | push sent, user must enter PIN | spinner "Waiting for approval…" disabled | **"Cancel payment" enabled** | disabled+dim | instruction + masked number + ⚠ stay-on-page + elapsed/remaining timer + progress bar | – |
| `success` | completed | hidden | "Done" | – | green ✓ "N credits added" | green |
| `failed` | declined/insufficient funds/expired/MarzPay failure | "Try again" | "Close" | – | red ✕ + reason, "No credits were added" | red |
| `cancelled` | user cancelled | "Start again" | "Close" | – | amber ! "You cancelled this payment" + honest note | amber |
| `timeout` | waitMax reached | "Check again" | "Close" | – | amber ! + link "Start a new payment" | amber |
Transitions: form→submitting→waiting→{success|failed|timeout|cancelled}; submitting→cancelled; cancelled/failed→form (Try again); timeout→(Check again)→success|failed|timeout.
A create request that returns *after* the user cancelled → the modal stays cancelled and the late payment is cancelled server-side.

## Phone entry — "with or without the country code?" (decision)
MarzPay supports up to 12 countries (07-marzpay-facts.md), so the UI has a **Country dropdown** (disabled/greyed when only one country is enabled) and a **number field with the dial code shown as a fixed prefix chip** (`+256`).
- **Tell users the rule in words, always visible under the field:** *"Enter the number without the country code — we add +256 for you. Example: 0712 345 678."* (Examples only for countries whose format is verified: UG, KE. Others get a generic hint.)
- **Be forgiving in what you accept:** `0712…`, `712…`, `+256712…`, `256712…`, `00256712…` all normalise to `+256712…` (client + server use the same algorithm).
- **Live preview** (green) once valid: *"We will send the payment request to +256 712 345 678"* — lets the user catch typos before paying.
- **Wrong-country paste** (e.g. `+254…` while Uganda selected): error "That number belongs to a different country" + one-tap **"Switch to Kenya"**.
- Validate on blur and on submit (not while typing). Block the request client-side; the server re-validates.
- Only enable countries the user is actually subscribed to (server `ALLOWED_COUNTRIES`; check `GET /collect-money/services` via `selfTestMarzReadOnly`). Mixed currencies: plans carry a `currency`; the server rejects mismatches.
- Network names: don't guess a network from the prefix (porting makes it unreliable). Say "mobile money number (MTN, Airtel, …)" unless the user supplies a verified list.

## Toasts (themeable)
Use the host app's existing toast (`showToast(msg, kind)`): **green** success, **amber** warning (cancel, timeout, offline, pending-exists), **red** error (failed, backend errors), neutral info. If none exists, add a minimal one with the same 3 accents. Keep ≤ 1 line; the modal panel carries the detail.

## Button feedback rules (themeable look, fixed behaviour)
Only buttons that trigger a server call get loading states: **Pay now** (spinner + "Sending request…"), **Check again** (spinner + "Checking…"). Others use pressed-state (`:active` scale) only. Disabled = 50 % opacity + `not-allowed`. Cancel never looks disabled.

## Accessibility
`role="dialog" aria-modal`, `aria-live="polite"` on status/preview, `aria-busy` on loading buttons, `role="alert"` on errors, `inputmode="tel"`, visible focus ring, reduced-motion respected, 44 px touch targets on mobile (buttons are 11 px padding + 14 px text — enlarge on small screens if needed).

## Frontend function catalog (payModal.js)
Exports: `initPayModal(opts)` wires config + global guards · `openPayModal()` builds DOM, loads `pay_config`, fills form · `closePayModal(force)` (blocked mid-payment unless forced) · `reconcileOnLoad()` call after sign-in · `normalizePhoneClient(raw, cc, countries)` same algorithm as server, returns `{ok, e164, national, pretty}` or `{ok:false, code, switchTo?}`.
Internal: `log/redact/maskPhone` dev logging · `buildDom` · `fillForm` · `onCountry` (dial chip, placeholder, help text) · `updatePreview` · `showPhoneError` · `setPhase` (the ONLY place that enables/disables things) · `panel`/`setBtn` render helpers · `onPrimary`/`onSecondary`/`onKey` event routing with guards · `submit` · `schedulePoll`/`pollOnce` (3 s for 45 s, then 5 s; stale responses dropped by generation) · `finish` · `cancelPayment` · `onTimeout` · `checkOnce` · `startTick`/`stopTimers` countdown · `banner`/`onNet`/`onVisible`/`onBeforeUnload` guards · `call` backend bridge (token refresh + one retry on `AUTH_EXPIRED`; maps transport failures to `NETWORK`/`BACKEND_HTML`/`BACKEND_URL_MISSING`) · `friendly`/`mkErr`.

## Wiring it into the host app (checklist for the AI)
1. Copy `payModal.js`, `payModal.css` into the project (e.g. `src/payments/`); import the CSS.
2. `initPayModal({ callBackend, getIdToken: f => auth.currentUser.getIdToken(f), getPlans: () => plansFromFirestore, showToast, onSuccess, mode })`.
3. Balance display: Firestore `onSnapshot(doc(db,'users/'+uid))` (rules allow own-doc read) — updates the chip automatically; `onSuccess` only needs toasts/analytics.
4. After sign-in: `reconcileOnLoad()`.
5. Replace the old buy modal's open call with `openPayModal`. Don't edit unrelated files; follow the user's Find/Replace protocol for existing files.
6. Theme: set the 9 `--pm-*` variables (or rely on the fallbacks that read the app's `--amber/--panel/--border…`).
