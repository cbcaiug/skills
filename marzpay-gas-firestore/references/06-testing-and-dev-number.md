# 06 — Testing, local env, and the developer-number protocol

## What the AI can and cannot do (be honest with the user)
- **In claude.ai chat** the AI's sandbox cannot reach MarzPay/Google APIs (limited network allow-list) and cannot press "Run" in Apps Script. It therefore **writes the test functions/scripts, tells the user exactly what to run, and reads the pasted logs** to diagnose and fix. Tight loop: *run → paste Executions/console lines → AI fixes (as Find/Replace) → redeploy → rerun.*
- **In Claude Code / an agent with network + a shell** the AI can run Node test scripts itself using the dev's number (below).
- The AI can always run `assets/tests/*` locally in its sandbox (mock Firestore/MarzPay) to prove logic before the user touches production.

## Developer-number protocol
1. When the developer gives a number (once), the AI stores it **only** as Script Property `DEV_TEST_PHONE` (+ `DEV_TEST_COUNTRY`, `DEV_TEST_AMOUNT`) — never hard-coded in source, never in committed files, never echoed back in full (mask it).
2. "Cashless" test = a **real push request with no PIN entered**: the phone gets the prompt, nothing is debited. Use the minimum amount (UG: 500) anyway.
3. Whenever the user says "test it / connection broken / why isn't X working", the AI may ask them to run `selfTestCollect` (or runs the Node equivalent if it has network) and then reads the logs. Don't ask for permission each time once the developer has opted in; DO tell them before any run that can actually move money (when PIN is entered).
4. Test amounts are real money if the PIN is entered — say so.

## Test ladder (stop at the first failure; each step proves one layer)
| # | Run | Proves | Money |
|---|---|---|---|
| T0 | open `/exec` URL in browser | deployment live, access=Anyone | none |
| T1 | `selfTestConfig` | required Script Properties present | none |
| T2 | `authorizeOnce` then `selfTestFirestore` | ownership, API enabled, scopes, project linked (01 §1–5) | none |
| T3 | `seedFirestore` | collections/plan exist with correct types | none |
| T4 | `selfTestCredit` | credit-once idempotency + ledger on real Firestore | none |
| T5 | `selfTestMarzReadOnly` | MarzPay key/secret, subscribed services/countries | none |
| T6 | `selfTestCollect` — **don't enter PIN**, let it expire/cancel | push arrives; status words; timeout/cancel paths; fixes `extractMarz_` shape | none |
| T7 | `selfTestCollect` — **enter PIN** | completed path | test amount |
| T8 | in the app: sign in → balance chip → Pay (cancel in modal) → Pay (approve) | whole UX + Firestore snapshot updates + ledger/payments docs | test amount |
| T9 | cancel in modal, then approve on phone late → reload app | `reconcileOnLoad` credits late money once | test amount |
| T10 | click Pay 5× fast; drop wifi mid-wait; switch tab/app and return | double-submit guard, offline banner, resume | none/test |
Record real MarzPay status strings/shape/failure messages seen in T6–T9 and update `mapStatus_`, `extractMarz_`, `07-marzpay-facts.md`.

## Local env file (ROOT — not in any folder)
1. Create `.env.local` in the project root (same folder as `package.json` and `vite.config.js`) from `assets/.env.local.template`. Vite ignores env files in `src/` or elsewhere (the earlier hard lesson).
2. The AI creates the file with all variable **names**, then asks the user to fill each, giving the click-path from the comments (Firebase config page, Deploy → Manage deployments URL, Authentication → Users for UID).
3. Only `VITE_*` are available to the browser (public!). Secrets (MarzPay, WEBHOOK_TOKEN…) go to **Script Properties**, not here.
4. Restart `npm run dev` after every change. On Vercel add the same `VITE_*` and redeploy.
5. **Check `.gitignore` contains `.env` / `.env.*`** (a project reviewed for this skill ignored only `*.local` — `.env.local` was covered, plain `.env` was not — and also had API secrets inside committed-looking `scratch/*.mjs` test files and a `.env`). If any real secret was ever committed/pasted: **rotate it** in MarzPay dashboard.
6. Never create a service-account JSON; there is none in this architecture.

## Cleaning up after tests
Delete test docs (`payments/*` created by `selfTestCollect` aren't created — it talks to MarzPay only; `selfTestCredit` cleans itself). Remove `DEBUG=1`. Keep `DEV_TEST_PHONE` only while developing.
