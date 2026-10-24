# 05 — Every error (UX + console) and the logging rules

## Logging rules (developer sees everything useful; attacker sees nothing useful)
**Always log (GAS + browser):** request id (`rid`), action, state transitions (`phase from→to`), timings (ms), HTTP status codes, MarzPay `error_code`/`status` words, Firestore error `status` + a **developer HINT**, which payment (`reference` first 8 chars), amounts/plan ids, masked phone.
**Never log:** Firebase ID tokens · OAuth bearer · MarzPay key/secret/Basic header · `WEBHOOK_TOKEN` · `RECEIPT_SECRET` · Script Property values · full phone numbers (mask: `+256*****234`) · request URLs containing API keys · other users' data · full upstream response bodies (log `shape` = key names, and ≤300-char previews only in the editor-run `selfTest*` functions).
Implementation: `redact_`/`redact()` drop any key matching `secret|token|password|authorization|api[_-]?key|receipt`, mask `phone|msisdn`, truncate long strings. The harness asserts none of these ever appear in logs.
**Where to read:** GAS → Apps Script → **Executions** (each run, its log lines) — filter by `rid`. Browser → DevTools Console, filter `[PayModal]`. `DEBUG=1` Script Property / `VITE_PM_DEBUG=1` adds verbose lines; turn off for production.
**Correlation:** the failing toast shows `(ref abcd1234)`; search that in Executions.
**Log line shape (GAS):** `{"lvl":"error","rid":"a1b2c3d4","ev":"fs.commit.fail","ctx":{"http":403,"status":"PERMISSION_DENIED","hint":"…"}}`. The `hint` tells the developer (or AI) the likely fix.
**Debug loop for the AI:** ask the user to paste the Executions lines for the failing `rid` + the `[PayModal]` console lines. Do not ask for Script Property values.

## A. Client-side validation (browser, before any request)
| code | trigger | UX text | console |
|---|---|---|---|
| PLAN_MISSING | no plan | "Choose a plan first." | – |
| PHONE_EMPTY | blank | "Enter the mobile money number to charge." | – |
| PHONE_BAD_LENGTH / PHONE_BAD_FORMAT | wrong digits | "That number has the wrong length / does not look right…" | – |
| COUNTRY_MISMATCH | `+254…` while UG selected | "That number belongs to a different country." + Switch link | – |
| offline | `!navigator.onLine` | amber toast "Network problem…" | `warn net.offline` |

## B. Backend error codes → what the user sees (all return `{ok:false, error_code, error, rid}`)
| error_code | cause | user sees | dev log / fix |
|---|---|---|---|
| AUTH_MISSING / AUTH_EXPIRED / AUTH_FAILED | no/expired/invalid Firebase token | sign-in prompts (auto-retry once with refreshed token) | `auth.failed` w/ http + hint (API key referrer restriction → 403) |
| PENDING_EXISTS | already waiting (+`reference`) | UI resumes waiting screen + amber toast | – |
| PLAN_NOT_FOUND / PLAN_BAD_PRICE | plan inactive/deleted/price 0 | "That plan is no longer available." | check `plans/{id}` |
| PLAN_CURRENCY_MISMATCH | plan currency ≠ country currency | "This plan cannot be paid from the selected country." | add per-currency plans or restrict `ALLOWED_COUNTRIES` |
| COUNTRY_NOT_SUPPORTED | country not in `ALLOWED_COUNTRIES` | "Payments from this country are not available." | add code to property |
| MARZ_NOT_SUBSCRIBED / MARZ_UNAVAILABLE / MARZ_FROZEN / MARZ_AUTH / MARZ_FORBIDDEN | MarzPay account/service problem | "Payments are temporarily unavailable. Please contact support." (no internals) | `marz.collect.fail` with MarzPay `error_code` → subscribe to the collection service for that country, check key/secret |
| MARZ_VALIDATION / MARZ_BAD_PHONE | MarzPay rejected number/amount | "The payment details were rejected…" | `errorFields` lists which fields; amount below minimum (UG 500) |
| MARZ_DUPLICATE | reference reused | "Please try again." | should be impossible (UUID); investigate |
| MARZ_SERVER | MarzPay 5xx | "The payment provider had a problem. Try again in a moment." | retry later; status page |
| MARZ_ERROR | unmapped | "The payment could not be started…" | read `message` in log; add mapping |
| UPSTREAM_NETWORK | UrlFetch failed | "Could not reach the service…" | GAS quota / outage |
| DB_PERMISSION_DENIED (DB_<status>) | Firestore refused | "We could not save your data right now." | **hint says which setup step** (01 §1–§5) |
| DB_FAILED_PRECONDITION / DB_ABORTED | concurrent write | retried internally (credits_spend ×3) | `credits.retry` |
| DB_ALREADY_EXISTS | ledger row exists | handled as "already applied" | `credit.already_applied` (normal on duplicates) |
| INSUFFICIENT_CREDITS | balance < cost | app shows its "Not enough credits" modal using `required/balance/shortfall` | – |
| BUSY | 3 precondition retries failed | "Busy right now. Please try again." | heavy contention |
| CONFIG_MISSING | Script Property absent | "Payments are temporarily unavailable." | log `missing: NAME` → run `selfTestConfig` |
| UNKNOWN_ACTION / BAD_REQUEST | frontend/backend version drift | generic | redeploy (01 §7) |
| SERVER_ERROR | unhandled exception | "Something went wrong on our side." | `unhandled_exception` with message+stack |
| FORBIDDEN | non-admin on admin action | "Not allowed." | – |

## C. Payment outcome (MarzPay status → UI)
`pending/processing` keep waiting · `completed` → success · `failed` (declined, wrong PIN, insufficient funds, expired) → red panel "Payment not completed… no credits added" (+ sanitized provider message if any) · `cancelled` (cancelled on phone) → red/amber "declined or cancelled on your phone" · unknown status word → keep waiting + `warn marz.status.unknown {raw}` (add to `mapStatus_`).
Exact provider failure strings are [UNVERIFIED]; capture real ones from `selfTestCollect` runs (decline / wrong PIN / let it expire) and extend messages.

## D. Infrastructure / console errors (browser DevTools)
| What you see | Meaning | Fix |
|---|---|---|
| `[callBackend] VITE_GAS_BACKEND_URL is not configured` | env var missing/typo or dev server not restarted | `.env.local` in ROOT, `VITE_` prefix, restart `npm run dev` |
| `Invalid JSON response from backend` / `[PayModal] backend.transport` | GAS returned an HTML page (login page, error page, stale deployment) | 01 §7: access=Anyone, /exec URL, New version |
| CORS error "No 'Access-Control-Allow-Origin'" | request has `application/json` header or custom headers → preflight; or HTML error page without CORS | send `text/plain;charset=utf-8`, no custom headers |
| `net::ERR_FAILED` on the script URL | Google sign-in redirect (access not Anyone) | redeploy |
| Firestore `permission-denied` in browser | rules deny the read (e.g. user A reads user B) or user not signed in | rules + sign-in state |
| Firestore `failed-precondition: The query requires an index` | composite index missing (e.g. `where active==true orderBy sortOrder`) | click the URL in the error, or query without orderBy and sort client-side |
| `auth/id-token-expired`, `auth/user-token-expired` | stale token | `getIdToken(true)` (modal retries once) |
| `auth/popup-blocked` etc. | sign-in, not payments | see firebase-auth-ui skill |
| `Failed to load resource … /dev` | using the /dev URL | use /exec |
Vite env: values missing in production = not set in the host (Vercel) **and redeployed**.

## E. GAS Executions-log errors
| Message | Cause |
|---|---|
| `Exception: Request failed for https://firestore.googleapis.com… returned code 403` | 01 §1/§4 |
| `Exception: You do not have permission to call UrlFetchApp.fetch` | missing `script.external_request` scope → manifest + `authorizeOnce` |
| `Service invoked too many times for one day: urlfetch` | quota — reduce polling or upgrade architecture |
| `Exception: Lock timeout: Could not obtain lock after 25000 ms` | too many concurrent finalizations |
| `TypeError: Cannot read properties of undefined` in `extractMarz_` users | MarzPay response shape changed → read the `shape` log, adjust |
| `Exception: Unexpected error: …` / "The script completed but did not return anything" | `doPost` returned undefined → ensure every path returns `json_()` |
