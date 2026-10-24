---
name: marzpay-gas-firestore
description: Build a complete MarzPay mobile-money payment system whose server side runs on Google Apps Script (GAS) and records per-user payments, credits, bonuses or access in Firestore — with NO Firebase service-account key. Covers the GAS backend (Code.gs), the Firestore data model and security rules, the payment-modal UX (phone entry with/without country code, waiting-for-PIN, cancel, timeout, toasts, double-click protection), env files (.env.local at project root, Script Properties), logging, every error, and a cashless test ladder using the developer's own phone number. Use this whenever the user mentions MarzPay together with Apps Script/GAS, Firestore, top-up credits, wallet balance, pay modal, "buy credits", per-user payment records, service-account key creation blocked, or wants a no-login "pay and unlock" flow. For plain MarzPay API questions with no GAS/Firestore, use marzpay-integration instead; use this skill for anything that writes payments or balances to Firestore from GAS.
---

# MarzPay + Google Apps Script + Firestore

Collections only (customer pays → app is credited). Mobile money in UG/KE and other MarzPay countries. Server = one GAS web app. Database = Firestore. Browser never sees a MarzPay secret.

```
Browser (payModal.js) ──text/plain JSON──► GAS web app (Code.gs) ──► MarzPay  (collect-money, status)
        ▲   onSnapshot(users/{uid})                  └──► Firestore REST (OAuth token of the deploying Google account)
        └── balance, ledger, payments (read-only by rules)
```

## Read order
1. This file (rules, intake, workflow). 2. `references/01-setup-ownership.md` **before any code**. 3. Others as needed:
`02-gas-backend.md` (every function/action) · `03-paymodal-ux-spec.md` (every state/button) · `04-firestore-data-and-rules.md` (collections, exact console clicks, types) ·
`05-errors-and-logging.md` (every UX + console error) · `06-testing-and-dev-number.md` (test ladder, local env, dev-number protocol) · `07-marzpay-facts.md` (verified vs unverified, country conflict).
Assets: `assets/Code.gs` · `appsscript.json` · `payModal.js` · `payModal.css` · `firestore.rules` · `.env.local.template` · `tests/` (harnesses: `node assets/tests/gas-harness.js`; UI test needs `npm i jsdom`).

## Non-negotiable rules
1. **Ownership:** the Google account that deploys the GAS project must be **Owner or Editor of the Firebase/GCP project**; the GAS project must be **linked to that GCP project** (Project number), **Firestore API enabled**, manifest scopes present, `authorizeOnce` run. Most failures are here. Ask which accounts are involved *first* (01 §1).
2. **No service-account key, ever.** Do not suggest creating one. GAS uses `ScriptApp.getOAuthToken()`.
3. **Secrets:** MarzPay key/secret, webhook token, receipt secret live in **Script Properties** (or Code.gs if the user insists — warn once). Never in the browser, never `VITE_`-prefixed, never in logs, never in chat history echoes.
4. **Server is the authority:** price, credits, currency come from Firestore/Script Properties; the client sends only `planId`, `country`, `phone`. Credits are granted in exactly one place (`finalize_`), atomically and idempotently.
5. **Polling is primary, webhook is a nudge** (GAS can't verify webhook headers). Never trust a webhook body; re-fetch status from MarzPay.
6. **Pay-modal behaviour is fixed** (03 "NON-NEGOTIABLE"): lock everything but Cancel while in flight, instant total cancel, visible feedback for every state, stay-on-page warning, no frozen UI. Colours/wording are themeable.
7. **Detailed logs, zero secrets** (05): structured `rid`-correlated logs on both sides; tokens, keys, full phone numbers never logged.
8. **Redeploy discipline:** GAS code changes need *Manage deployments → New version*. Remind every time you hand over a Code.gs change.
9. **Field types:** never say "type number" — say "number if shown, otherwise int64"; timestamps are `timestamp`, never null/`Date.now()` in an int (04).
10. **Honesty:** label anything unverified `[UNVERIFIED: why]`; if sources conflict (e.g. supported countries) say so. Don't invent MarzPay behaviour — capture it from `selfTestCollect` logs.
11. **No scope creep:** payments only. Send-money/balance/bank/bills/airtime need a whitelisted fixed IP and cannot run from GAS — say so, don't fake it.
12. **Existing user files:** only new files get full contents; edits to existing files are exact Find/Replace pairs (verbatim, unique, with a one-line "Why"), and list the files first when touching more than one. Deliver new files as downloadable artifacts.

## Intake — ask ONCE, in a single batch (use the tool's multiple-choice UI if available)
If the user says "you decide", use the **default** in brackets.
1. **Mode:** (A) accounts + per-user records in Firestore **[default]**, or (B) no login, "pay and unlock" (guest mode; weaker, see 02).
2. **What is granted:** credits / messages / bonus / time access? Unit name, free signup amount **[credits, 0 free]**, deduct per what? **[1 credit per unit]**
3. **Plans:** name, amount granted, price, currency **[one plan 200 credits = 2500 UGX]**.
4. **Countries** (must be subscribed in MarzPay) **[UG only]**.
5. **Login method** **[Google via Firebase Auth]**; extra fields to record (username, phone…) **[email, display name]**.
6. **What "duration" means** — payment time taken, or access validity days **[record `durationSec`; no expiry unless asked]**.
7. **Environment:** Firebase project ID & whether Firestore exists; **which Google account owns Firebase vs which will deploy GAS**; frontend stack (Vite? framework?) and where the existing buy/modal code lives **[ask for files]**.
8. Developer's own phone for cashless tests (later is fine) — optional now.
Then restate the choices in 5 lines and proceed. Don't re-ask what the project files already answer (read them first).

## Workflow
**Phase 0 — Discover.** Read the user's project files (package.json, firebase config, existing credits/modal code, `.gitignore`). Note conflicts with this skill (e.g. `.env` not git-ignored, secrets in `scratch/` files → tell them to rotate).
**Phase 1 — Ownership & setup (01).** Walk the user through §1–§7 step by step with exact clicks; wait for confirmation of each blocking step (link project, enable API, scopes, authorize). Offer the screenshot-free check: `selfTestFirestore`.
**Phase 2 — Env files.** Create **`.env.local` in the project ROOT** from `.env.local.template` (names filled, values blank), tell the user where each value is found, list the Script Properties to add, remind: restart dev server; same `VITE_` vars on the host + redeploy.
**Phase 3 — Firestore (04).** Choose Standard edition; run `seedFirestore` (preferred) or give manual clicks with real type names; give rules (`firestore.rules`) and the Publish click-path.
**Phase 4 — GAS.** Provide `Code.gs` + `appsscript.json` adapted to the intake (plan fields, extra user fields, `creditsPerUnit` naming). Re-run `node assets/tests/gas-harness.js` after any edit and fix until green. Hand over with the redeploy reminder and the `/exec` URL placement (browser env + `WEBAPP_EXEC_URL`).
**Phase 5 — Frontend.** Add `payModal.js/.css`; wire per 03 checklist; theme to the app; keep existing balance chip via Firestore snapshot; call `reconcileOnLoad()` after sign-in. Run the UI test if the environment allows.
**Phase 6 — Test ladder (06).** T0→T10, one rung at a time; user pastes logs; fix; redeploy; repeat. Use the developer number protocol.
**Phase 7 — Handoff.** Summarise: what exists, Script Properties set, deployed version, how to read logs (Executions / `[PayModal]`), what is [UNVERIFIED], remaining risks (below), and next options (webhooks on, more countries, receipts by email via gas-email-service skill).

## Dialogue is part of the skill
This skill is a guided playbook, not a code dump. Keep each turn short: one blocking step at a time with exact click-paths and "paste me what you see". Prefer defaults over questions. When the user is stuck, ask for the **GAS Executions log line** (contains `rid`, `status`, `hint`) — it usually names the fix. Where a Google/Firebase/MarzPay UI label may have moved, say "labels shift — tell me what you see".

## Things users commonly forget (raise them proactively)
- Webhook URL is a GAS `/exec` URL with a secret query token; many senders dislike redirects → rely on polling. (02)
- **Late approvals / telecom retries** → reconcile on load (built in). Refunds are manual (no verified refund API).
- Pending-payment cap (one at a time; stale ones expire) and **idempotency** of every credit/spend (`requestId`).
- Currency per country; minimum amounts (UG 500 UGX); plan prices live in Firestore, not the client.
- GAS quotas/latency (≈1–3 s per call; poll ≥3 s); what GAS can't do (fixed-IP products).
- Web API key referrer-restriction breaks token verification from GAS (05).
- `.gitignore` for `.env*`; rotate any secret that touched a repo/chat; Script Property edit access = secret access.
- Personal data: payment docs hold phone numbers — keep only what's needed; rules restrict reads to the owner.
- Receipts/emails to users, admin payment list, support reference (`rid`), terms/price display, test vs live (sandbox) switch, monitoring (Executions filter by `ev:"credit.applied"`, alert on `ev:"unhandled_exception"`).
- Embedded/in-app browsers (Facebook/Instagram) can block popups/redirects — pair with the browser-guard skill if the app is shared on social.
- Re-run `authorizeOnce` after scope changes; re-deploy after code changes; restart Vite after env changes.

## Definition of done
T0–T9 pass · `selfTestCredit` shows exactly-once · cancel in the modal unlocks instantly and the late-approval test credits once · logs contain no secrets · user knows where every secret lives and which account owns the GAS project · open items listed with `[UNVERIFIED]` tags.
