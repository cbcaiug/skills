# 02 — GAS backend: every function, every action, and why it's built this way

Template: `assets/Code.gs`. Tests: `assets/tests/gas-harness.js` (mock Firestore + MarzPay; re-run after ANY edit: `node assets/tests/gas-harness.js`).

## Request contract
Browser → `POST <exec URL>`, header `Content-Type: text/plain;charset=utf-8` (avoids CORS preflight; GAS cannot answer OPTIONS), body JSON
`{ "action": "...", "idToken": "<Firebase ID token>", ...params }`. The token travels in the body because `doPost` cannot read HTTP headers.
Response always JSON: success `{ok:true, rid, ...}`; failure `{ok:false, error_code, error (safe text), rid, ...extra}`. `rid` = 8-char request id that also appears in the GAS logs.

## Actions (the public API)
| action | auth | params | returns | notes |
|---|---|---|---|---|
| `pay_config` | none | – | `{mode, countries:[{code,dial,name,nsn}]}` | frontend builds the country list from this (server is the truth) |
| `account_init` | token | – | `{credits}` | creates `users/{uid}` (+ free credits from `config/settings`) |
| `payment_create` | token | `planId, country, phone` | `{reference, status:'pending', maskedPhone, amount, currency, credits, planName}` | price/credits come from Firestore plan — **client amounts are ignored** |
| `payment_status` | token | `reference` | `{status: pending\|completed\|failed\|cancelled, creditsAdded, message}` | polls MarzPay (throttled 3 s) and finalizes. Primary confirmation path |
| `payment_cancel` | token | `reference, reason('user'\|'timeout')` | `{status}` | marks `user_cancelled`/`timeout`; keeps `activeRef` so late money is still credited |
| `payment_reconcile` | token | – | `{status, reference?, reconciled?}` | call after sign-in; credits money approved after cancel/timeout/closed tab |
| `credits_spend` | token | `requestId, units` | `{cost, charged, balance}` or `INSUFFICIENT_CREDITS {required,balance,shortfall}` | idempotent per `requestId`; atomic with precondition + retry |
| `admin_adjust` | token + `ADMIN_UIDS` | `targetUid, delta, reason` | `{adjusted}` | ledger-recorded |
| `receipt_verify` | none | `receipt` | `{valid, planId, credits}` | guest mode only |
| webhook | query `?hook=marzpay&t=<WEBHOOK_TOKEN>` | MarzPay body | `{ok:true}` | optional; payload is NEVER trusted — status is re-fetched from MarzPay |
| `doGet` | none | – | health JSON | no config values, ever |

## Function catalog (Code.gs)
**Routing/errors/logging:** `doGet` health · `doPost` router (adds `rid`, timing, catch-all) · `parseBody_` · `json_` ·
`appErr_(code,userMsg,internal,extra)` typed error: `userMsg` is safe for users, `internal` only goes to logs · `errorResponse_` converts any error to the safe response ·
`log_(level,rid,event,ctx)` structured one-line JSON logs (levels info/warn/error/debug; debug only when `DEBUG=1`) ·
`redact_` strips secret-looking keys (`token, secret, apikey, authorization, receipt…`), masks `phone`, truncates strings · `maskPhone_` · `prop_(name, required)` Script Property reader (throws `CONFIG_MISSING`).
**HTTP:** `http_` single choke-point for UrlFetch (mutes exceptions, logs label+status+ms, **never logs URLs** because identitytoolkit URLs carry the API key).
**Firestore REST:** `fsBase_/fsName_/fsHeaders_` · `fsGet_` (null on missing doc) · `fsDelete_` · `fsCommit_` (atomic multi-write) ·
`wUpdate_(path, obj, {exists|updateTime, transforms})` builds ONE write touching only given fields (updateMask) · `incr_` atomic increment ·
`toFsValue_/fromFsValue_/fromDoc_` type codec (ints→`integerValue`, others→`doubleValue`, Date→`timestampValue`) · `fsFail_` maps HTTP status → developer HINT in the log and a safe error for users.
**Auth:** `authenticate_` verifies the Firebase ID token via `identitytoolkit accounts:lookup` (5-min cache keyed by SHA-256 of the token — raw token never cached) · `assertAdmin_`.
**Phone/countries:** `COUNTRIES` table · `allowedCountries_` (`ALLOWED_COUNTRIES` property) · `normalizePhone_` (accepts 0…, 7…, +CC…, CC…, 00CC…) · `PHONE_MSG`.
**MarzPay:** `marz_` authenticated call · `marzFail_` maps `error_code` → friendly text (details only in logs) · `extractMarz_` **defensive** parse of uuid/status/provider (response shape is verified by `selfTestCollect` logs, not assumed) ·
`mapStatus_` raw → `pending|completed|failed|cancelled|unknown` · `isFinal_` · `callbackUrl_`.
**Domain:** `getSettings_` · `getPlan_` · `ensureUser_` (race-safe create) · `payConfig_ accountInit_ paymentCreate_ paymentStatus_ paymentCancel_ paymentReconcile_ creditsSpend_ adminAdjust_ receiptVerify_` ·
`statusView_` (internal → UI status) · `throttledSync_` · `syncPayment_` (ask MarzPay, finalize if final) · **`finalize_`** (the only code that grants credits) · `handleWebhook_` · guest: `guestStatus_ signReceipt_`.
**Editor-run helpers (not endpoints):** `authorizeOnce` · `selfTestConfig` · `selfTestFirestore` · `selfTestCredit` (proves single-credit idempotency with zero money) · `selfTestMarzReadOnly` · `selfTestCollect` (real push to `DEV_TEST_PHONE`) · `seedFirestore`.

## Payment lifecycle (account mode)
```
payment_create  → payments/{ref}: initiating → (MarzPay accepts) pending ; users/{uid}.activeRef = ref
poll / webhook / reconcile → syncPayment_ → MarzPay GET → finalize_
   completed → ONE atomic commit: payment=completed + users.credits += n + ledger topup_{ref} (create-only) + activeRef=null
   failed|cancelled → payment closed, activeRef=null
payment_cancel  → user_cancelled | timeout   (activeRef kept ⇒ late approval is still credited by reconcile)
```
Design decisions (all tested in the harness):
- **Polling is primary, webhook optional.** A GAS web app can't read request headers (no signature check), can't return custom status codes, and answers POSTs with a redirect that some webhook senders treat as failure [UNVERIFIED for MarzPay]. So the webhook is only a *nudge*; truth = MarzPay GET.
- **Exactly-once credit:** `finalize_` runs under `LockService.getScriptLock()`, re-reads the payment, no-ops if `completed`, and the ledger row `topup_{ref}` is create-only (`exists:false`) inside the same atomic commit — a second attempt fails with `ALREADY_EXISTS` and is treated as "already applied".
- **No Firestore queries** (no composite-index surprises, works on Standard and Enterprise): single-pending-payment rule uses `users/{uid}.activeRef`.
- **Server decides price/credits**; client sends only `planId`. Currency vs country is validated (`PLAN_CURRENCY_MISMATCH`).
- **Late money:** MarzPay is the source of truth even after our UI gave up → `late_credit` warning logged.
- **Reference** = server-generated UUID v4; also the Firestore doc id and MarzPay `reference`.

## GAS limits to know (and tell the user)
- Each call ≈ 1–3 s (cold start longer). Poll no faster than 3 s.
- `UrlFetchApp` daily quotas and ~30 simultaneous executions; the script lock serialises *finalization only* (short). Fine for hundreds of payments/day; beyond that, move to a real backend.
- Max 6 min per execution (selfTestCollect uses ≈2 min).
- **IP-whitelisted MarzPay endpoints cannot work from GAS** (Google's outbound IPs are not fixed): send-money, bank transfer, balance, bill payments, airtime — per the existing marzpay-integration skill, those need a whitelisted IP. This skill covers **collections** (mobile-money in) which, per that skill, need none. If the user needs payouts, say so plainly and recommend a fixed-IP server.
- No refunds API was verified [UNVERIFIED] → refunds are manual: use `admin_adjust` for credits and MarzPay dashboard for money.

## Guest mode (no accounts, no Firestore) — `AUTH_MODE=guest`
For "just pay and unlock" with no login. The secret still must live server-side, which is why GAS is still needed (browser can't hold MarzPay credentials).
Plans come from `PLANS_JSON`; on completion GAS returns an HMAC-signed `receipt` the browser stores (localStorage) and can re-check via `receipt_verify`.
**Honest limits:** the browser can be tampered with; receipts can be replayed/shared (claims are tracked only in a 6-hour cache). Fine for low-value unlocks; for anything with real value use account mode.
