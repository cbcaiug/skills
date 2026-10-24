# 07 — MarzPay facts used by this skill (with provenance) and open conflicts

Legend: **[V-doc]** official MarzPay docs/search snippet seen this session · **[V-skill]** the installed `marzpay-integration` skill · **[UNVERIFIED]** not confirmed — don't present as fact; verify with a test run or the dashboard.

## Countries — CONFLICT (flag to the user)
- Official Getting Started page lists **12 country codes**: UG, KE, RW, CD, ZM, CM, BJ, CI, GA, CG, SN, SL **[V-doc]** (the snippet's table showed 11 rows; SL appears in the text — [UNVERIFIED] its provider/currency).
- The marketing homepage says live in **Uganda, Kenya, Rwanda, DRC** **[V-doc]**; the installed skill says **UG & KE** live **[V-skill]**.
- **Resolution:** the account's real coverage = what `GET /collect-money/services` returns and what the user has **subscribed to** (per-country, per-provider). Enable only those in `ALLOWED_COUNTRIES`. Run `selfTestMarzReadOnly` and read the log.

## Phone format (international, with `+`)
`phone_number` is sent as E.164 (e.g. `+256712345678`, `+254710000000`) **[V-doc][V-skill]**. UG/KE examples are documented; other countries' national lengths are in `COUNTRIES` of Code.gs — UG/KE/RW/CD/ZM/CM/CG/SN set to 9 digits from general knowledge **[UNVERIFIED vs MarzPay]**, BJ/CI/GA/SL deliberately loose. MarzPay's own rejection (`INVALID_PHONE_NUMBER`/`VALIDATION_ERROR`) is the final authority.
Network (MTN/Airtel…) is auto-detected by MarzPay for UG **[V-skill]** — don't make users pick.

## Collections API (what the template uses)
- `POST {base}/collect-money` Basic auth `key:secret`; body: `amount, phone_number, reference (UUID v4, unique), country, description, callback_url?, metadata?` **[V-skill]**. Base `https://wallet.wearemarz.com/api/v1`.
- `GET /collect-money/{uuid}` status; `GET /collect-money/services`; `GET /services` **[V-skill]**.
- Amount UG: **500 – 10,000,000 UGX**; other countries: check collection limits **[V-skill]** (KE limits [UNVERIFIED]).
- Status words: `processing`/`pending` → `completed` | `failed` | `cancelled` (+ `expired` mentioned in third-party docs) **[V-skill][V-doc secondary]**. `mapStatus_` also tolerates synonyms and logs unknown ones.
- Response field paths (`data.collection.uuid`, `data.collection.status`, `provider`) come from the user's own test scripts; **exact shape [UNVERIFIED]** → `extractMarz_` is defensive and `selfTestCollect` prints the real shape.
- Webhook event types: `success`, `failure`, `collection.completed|failed|cancelled`; same `reference` may be delivered more than once → idempotent **[V-skill]**; payload carries `transaction.reference` **[V-skill example]** (shape [UNVERIFIED], logged).
- Error codes: `VALIDATION_ERROR, DUPLICATE_REFERENCE, INVALID_PHONE_NUMBER, SERVICE_NOT_SUBSCRIBED, SERVICE_NOT_AVAILABLE, ACCOUNT_FROZEN, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, SERVER_ERROR` **[V-skill]**.
- **IP whitelist:** NOT required for collections; REQUIRED for send-money, bank transfer, bill payment POST, airtime/data POST, balance, account **[V-skill]** → not usable from GAS.
- Sandbox: business accounts in sandbox mode return simulated responses, no real money **[V-skill]**; how to get sandbox test numbers [UNVERIFIED].
- Card payments exist (`POST /collect-money` with `method: card`, UG primary) **[V-skill]** — not covered by this skill's modal.
- Cancel endpoint / refund API: none verified **[UNVERIFIED]** → "cancel" in the UI = stop waiting + mark locally; telecom may still prompt.

## Telecom behaviour to design around (observed by the user)
The telecom can re-send the PIN prompt up to ~3 times; the user can approve late. Hence: UI never freezes on cancel; server keeps `activeRef` and credits late approvals via reconcile.

## Where to re-verify
MarzPay dashboard → API docs / Getting Started (country table) · `GET /collect-money/services` · a T6/T7 test run (06). The docs site blocks automated fetching — if the AI can't read it, ask the user to paste the relevant section.
