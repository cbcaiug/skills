# 04 — Firestore: edition, collections, field types, rules, console clicks

## Ask first (AI): what do users receive, and what must be recorded?
Credits? Messages? Bonuses? Time-based access? Login method (Google/email/username/phone)? What does "duration" mean to you — (a) how long the payment took, (b) how long the access lasts (e.g. 30 days)? Defaults if the user says "you decide": credits, Google sign-in, record both (a) `durationSec` and (b) optional `durationDays` → `accessUntil`.

## Edition & field-type labels (why "number" was missing)
Firestore now offers **Standard** and **Enterprise** editions; Enterprise has MongoDB-compatible features and does **not** auto-create single-field indexes.
The console's field-type menu differs by edition/UI version — the user saw **int64** instead of **number** [UNVERIFIED: exact labels per edition not confirmed this session].
**Rule for the AI: never say "pick number". Say:** *"whole numbers → `number` if you see it, otherwise `int64`; decimals → `float64`/number; dates → `timestamp`; text → `string`; true/false → `boolean`."*
**Recommend Standard edition** for new databases (simplest, matches REST docs, auto single-field indexes). If the user already has Enterprise, it works with this skill because the template uses **no queries**; but the app's own queries (e.g. `plans` where active==true orderBy sortOrder) may need a manually created composite index — the console error contains a link; click it.
**Timestamps must be a real `timestamp` — never null and never `Date.now()` in an int field** (the earlier mistake). Best: let GAS write them (below).

## Collections (all created automatically by GAS on first write; collections have no "create" step of their own)
| path | written by | fields (type) |
|---|---|---|
| `config/settings` | `seedFirestore` / admin | `freeCredits` int · `creditsPerUnit` int (rename to match app e.g. creditsPerRow) · `paywallEnabled` boolean |
| `plans/{planId}` | `seedFirestore` / admin | `name` string · `credits` int · `price` int (smallest unit used by MarzPay, UGX whole shillings) · `currency` string ("UGX") · `active` boolean · `sortOrder` int · `updatedAt` timestamp · `updatedBy` string · optional `durationDays` int |
| `users/{uid}` | GAS | `email` string · `displayName` string · `credits` int · `lifetimeCredits` int · `activeRef` string\|null · `createdAt` timestamp · `lastTopupAt` timestamp · optional `accessUntil` timestamp |
| `users/{uid}/ledger/{id}` | GAS | `type` string (signup_bonus\|topup\|spend\|adjust) · `delta` int (+/−) · `reference` string · `at` timestamp · optional `planId, amount, currency, units, reason, by` |
| `payments/{reference}` | GAS | `uid, email, phone (E.164), country, planId, planName` strings · `amount, credits` int · `currency` string · `status` string (initiating\|pending\|completed\|failed\|cancelled\|user_cancelled\|timeout) · `marzUuid, provider, failureReason` string\|null · `createdAt, updatedAt, completedAt` timestamp · `durationSec` int · optional `durationDays` int |
Add fields the user asked for (e.g. username, phone-as-login) in `ensureUser_`/`paymentCreate_` and to this table; keep types explicit.
Ledger ids are deterministic (`topup_<ref>`, `spend_<requestId>`) — that is what makes crediting/spending idempotent.

## Fastest path: let GAS create them
Edit values in `seedFirestore()` (plan name/credits/price) → run it → check Firestore → Data: `config`, `plans` appear. Re-running never overwrites.

## Manual path (only if the user prefers / GAS not ready) — exact clicks
Firebase console → **Build → Firestore Database → Data** tab.
1. **+ Start collection** → Collection ID `config` → Next → Document ID `settings` → add fields: `freeCredits` (int64/number) `0` · `creditsPerUnit` (int64/number) `1` · `paywallEnabled` (boolean) `true` → Save.
2. **+ Start collection** → `plans` → Document ID: type `plan_200` (or click Auto-ID, then tell the AI the id) → fields: `name` string "200 Credits" · `credits` int64 `200` · `price` int64 `2500` · `currency` string `UGX` · `active` boolean `true` · `sortOrder` int64 `1` · `updatedBy` string `seed` · `updatedAt` **timestamp** → pick the date/time with the picker (do NOT leave it null).
3. `users` and `payments` need no manual creation.

## Security rules
`assets/firestore.rules`. Key fact: GAS writes with the deploying account's IAM identity, which **bypasses rules** (the user's own working setup — `allow write: if false` + GAS writes — confirms this). So rules only protect the browser: read own data, write nothing, deny everything else.
Publish: Firestore Database → **Rules** tab → paste → **Publish**. Or `firebase deploy --only firestore:rules`.
Tell the user the 3 properties: (1) browser cannot change credits; (2) a user can read only their own `users/{uid}`, ledger and payments; (3) `config` and `plans` are public-read (no secrets inside).
Test in the Rules tab → **Rules Playground**: simulate `get /users/<other-uid>` as user A → must be denied.

## Reading in the browser
`onSnapshot(doc(db,'users/'+uid))` → live balance. `plans` list: `getDocs(collection(db,'plans'))` then filter `active` client-side (avoids needing a composite index).
