---
name: firestore-cost-optimizer
description: Audits and reduces Cloud Firestore document reads, writes, and deletes in any application — web (JS/TS SDK), mobile (Flutter/Dart, Android/Kotlin, iOS/Swift), or backend (Admin SDK/Node/Python/Go). Use this whenever the user is hitting Firestore/Firebase Spark (free-tier) quota limits, asks how to cut Firestore costs or billing on Blaze, reports "too many reads/writes," wants a codebase audit for wasted Firestore operations, is designing a Firestore data model, caching, or listener strategy, or is debugging a sudden spike in Firestore usage. Triggers on mentions of onSnapshot, getDocs, quota exceeded, Firestore pricing, Spark plan limits, listener/cache design, or "why is my Firestore bill/usage so high" — regardless of the framework or platform involved.
---

# Firestore Read/Write Cost Optimizer

## Core principle

Firestore should be the app's **persistent source of truth**, not its **live state manager**. Every document read/write that happens because a UI re-rendered, a component remounted, or a loop re-ran — rather than because a user did something that genuinely needs to be persisted or fetched — is waste. This principle holds identically whether the client is React, Flutter, Android, iOS, or a server calling the Admin SDK; only the syntax for listeners/caching changes per platform.

Two billing facts drive almost every optimization in this skill:
- **A read is billed per document actually returned/examined**, not per API call. A query returning 100 docs = ~100 reads. A query returning 0 docs still costs a minimum of 1 read.
- **A write is billed per document write**, and batching/transactions do **not** reduce that count — they only add atomicity and fewer round trips. Batching 4 writes together is still 4 billed writes.

Because of this, don't conflate "fewer network calls" or "looks more efficient" with "fewer billed operations" — they're often unrelated:

| Change | Fewer app/API calls? | Lower billed reads/writes? |
|---|---|---|
| Batch 10 writes | Yes | No — still 10 billed writes |
| Add an index | Sometimes | Not inherently (helps latency/scale, not quota) |
| Use a transaction instead of a plain write | Not necessarily | Not inherently — retries can add reads |
| Add `limit()` / replace `offset()` with a cursor | Usually | Yes — fewer documents actually examined |
| Reuse already-fetched state/cache | Yes | Yes, when it prevents a backend read |
| Move the same read from client to server | Maybe | No by itself — the read is still billed |

Everything else — caching, listener discipline, denormalization, pagination, atomic increments — exists to reduce how many documents get examined or written in the first place, not to make the code merely look cleaner.

## When the user is on Spark (free tier)

Current daily quota (resets ~midnight Pacific Time, **project-wide — not per user**, so one bad component can lock out every user for the day):

| Resource | Free quota | Resets |
|---|---|---|
| Document reads | 50,000/day | ~Midnight Pacific Time |
| Document writes | 20,000/day | ~Midnight Pacific Time |
| Document deletes | 20,000/day | ~Midnight Pacific Time |
| Stored data | 1 GiB total | — |
| Outbound network egress | 10 GiB/month | Monthly |

Verify current numbers with a web search before quoting them to the user if the conversation suggests they might have changed — Google does revise quotas. Source: https://firebase.google.com/docs/firestore/quotas and https://firebase.google.com/docs/firestore/pricing

If the app is on Blaze (pay-as-you-go), the same fixes apply — they just show up as a smaller bill instead of a hard stop.

**If this is an active incident** (quota exhausted right now, a runaway listener/poll loop, or a feature suddenly consuming thousands of ops) — contain before you redesign:
1. Find what's still firing and stop it (kill the loop/listener/timer) before proposing any architectural change.
2. Don't assume organic growth — do the math (`docs/query × queries/session × sessions/day`) and compare it to the exhausted quota; multiplication bugs, not real traffic, cause almost all quota incidents.
3. **Never treat a failed/blocked read as "the stored value is zero."** If quota exhaustion blocks a read of a balance, entitlement, or subscription state, preserve the existing value rather than falling back to an empty/default state that could overwrite something real once quota resets.
4. Only after the leak is stopped and normal reads are restored, move on to the broader audit workflow below.

## Audit workflow

Follow this sequence rather than jumping straight to advice — the highest-leverage fixes are almost always architectural, not line-level tweaks.

1. **Scan the codebase for risky call sites.** Run `scripts/scan_for_risks.sh <path>` (or do the equivalent search manually if it's not a shell-accessible repo) to find every Firestore read/write/listener call and the patterns known to cause silent multiplication (effects with unstable dependencies, polling, per-render calls, repeated same-document reads across components). For a full formal audit, assign each candidate call site a stable ID (`FS-001`, `FS-002`, ...) — see `references/audit-methodology.md` for the inventory template.
2. **Classify each call site**, both by what triggers it and by what kind of cost it represents:
   - What actually triggers this call, and how often can that trigger fire?
   - What stops it from firing twice for the same need, or on every re-render/rebuild/navigation?
   - Would in-memory or local-disk state already satisfy this instead of hitting the server?
   - Does this genuinely need to be live (`onSnapshot`/listener), or is a one-time fetch enough?
   - Then bucket it: **Necessary** (required for correctness/authorization/freshness) · **Reducible** (legitimate, but frequency/size can shrink) · **Avoidable** (cache/local state/static data could satisfy it instead) · **Multiplying** (one logical need is generating repeated ops via remounts/listeners/effects/polling/retries) · **Dangerous to touch** (the obvious fix would weaken correctness, auth, or durability — see the safety boundary below).
3. **Fix in priority order** (highest leverage first — see `references/anti-patterns-checklist.md` for the full phased plan):
   - **Phase A — stop accidental consumption**: kill render/effect loops, unsubscribe orphaned listeners, stop polling, deduplicate repeated reads of the same document across components/screens.
   - **Phase B — reduce legitimate reads**: add `limit()`/cursors, replace offsets with `startAfter()`, enable local persistence/cache, denormalize small hot documents, use `count()`/`sum()`/`average()` instead of downloading to count.
   - **Phase C — reduce legitimate writes**: persist only durable state, debounce autosave/high-frequency writes, use `increment()`/`arrayUnion()` instead of read-modify-write, avoid writing every transient UI/AI-generation state change.
   - **Phase D — security & scale**: audit Security Rules for `get()`/`exists()` calls (each one is a billed read, even on denial), avoid hotspotting on one document/sequential IDs, keep documents small.
   - **Phase E — measure**: instrument or at least manually trace reads/writes per session/user/feature so the fix is verifiable, not just "looks cleaner."
4. **Re-measure** against the Firebase Console Usage tab (or the app's own instrumentation) to confirm the change actually reduced billed operations — some things that look like optimizations (batching, adding indexes, transactions) do NOT reduce billed op counts; see the "not an optimization" list in `references/anti-patterns-checklist.md` so you don't credit a change with savings it doesn't produce. When you can't directly measure the before/after, say so plainly (e.g. mark a claimed saving `[Inference]` or `[UNVERIFIED]`) rather than presenting an estimated or assumed percentage as a confirmed result.

## Key decision tables

**Counter/numeric update:**

| Requirement | Use |
|---|---|
| Add/subtract with no conditional check | `increment()` (atomic, no read needed) |
| Several documents updated atomically, no reads needed | Batched write |
| Must read current value, validate a condition, then update atomically | Transaction |
| Very high-frequency shared counter (many concurrent writers) | Distributed/sharded counter |

**Listener vs. one-time fetch:**

| Situation | Use |
|---|---|
| Another user/admin can change this data and the UI must reflect it immediately | `onSnapshot()` / real-time listener |
| Data is read once at load and rarely changes (settings, static config, historical record) | One-time `get()`/`getDoc()` |
| The only writer is this same client/session | Update local state directly after your own write; don't re-listen for your own change |
| Screen is left within seconds | One-time fetch, not a listener |

**Data source:**

| Technique | Hits server? | Use for |
|---|---|---|
| Normal `get()`/`getDoc()` | Depends on SDK cache config | General retrieval |
| Explicit cache-only read | No | Data you know is already cached and freshness isn't critical |
| Explicit server-forced read | Always | Freshness is mandatory (e.g. right before a privileged action) |
| Persistent local cache (SDK-level) | Reduces repeat reads across sessions | Stable/slow-changing data |
| App-level in-memory/shared state | Never, once fetched | Session-lifetime data used by multiple screens/components |

## Data modeling leverage (biggest single lever)

- **Denormalize small, frequently-read summaries.** A screen needing 4 related values scattered across 4 documents costs 4 reads; a purpose-built summary document (e.g. one account doc with plan/quota/expiry/display fields) costs 1. This is consistently the highest-value fix across every source reviewed for this skill.
- **Don't put growing histories in the same document you read constantly.** Keep a small "current state" document separate from `subcollection` history/audit logs (payments, usage events) — read the small doc for current truth, query the subcollection only when history is actually needed.
- **Don't over-split either.** Spreading current state itself across many small documents/subcollections just to "avoid one read" usually makes things worse, because now getting the current answer requires a query plus client-side aggregation instead of one document read.
- **Static, public, rarely-changing data (reference lists, syllabus/catalog JSON, app config) often doesn't belong in Firestore at all** — serving it as a static file/CDN asset with normal HTTP caching removes it from the read quota entirely.
- **Avoid one "hot" document** many users write to concurrently — Firestore soft-limits sustained writes to roughly 1/second per document before contention. Use sharded/distributed counters for high-concurrency counts, with a periodically-updated rollup for fast reads.

## Security Rules are a hidden read cost

`get()`, `exists()`, and `getAfter()` inside Security Rules each cost a real billed document read — **even when the rule denies the request**, and even on a query that returns nothing. Prefer checking `resource.data`/`request.resource.data` fields already on the document being accessed (e.g. an `ownerUid` or `memberIds` field on the doc itself) over looking up a separate membership/role document. When a cross-document check is unavoidable, repeated `get()` calls to the *same* path within a single rule evaluation are only billed once, so consolidate rather than calling the same path from multiple rule branches. Never weaken required security to save a read — move complex multi-document authorization into server-side Cloud Functions/Admin SDK code instead, which bypasses rules entirely for that logic. Also remember Security Rules are not filters: a broad `getDocs()` against a whole collection is not narrowed for free by rules, the query itself must be constrained with `where()`.

## Safety and correctness boundary

Cost reduction is never worth trading away: authorization, transactional integrity, data durability, required freshness, error handling, or the correctness of quota/balance/entitlement/subscription state. If a codebase handles payments, subscriptions, credits, or other sensitive counters, prefer the conservative fix over the more aggressive read/write reduction — and flag the trade-off to the user explicitly rather than silently picking the cheaper option. When proposing a change, note what kind of win it actually is (quota reduction, cost reduction, latency, or just correctness/scalability) so a non-cost change never gets presented as a quota saving.

## Platform-specific code patterns

Read `references/patterns.md` for concrete before/after code in whichever platform the user is using (Web JS/TS SDK, Flutter/Dart, Android/Kotlin, iOS/Swift, Admin SDK/backend). The underlying principles above are identical across all of them — only the API syntax for listeners, caching, and increments differs.

## Reference material

- `references/quota-and-billing.md` — exactly how reads/writes/deletes get counted (aggregation queries, transactions vs batches, offline cache rules, listener reconnect penalties), with citations.
- `references/patterns.md` — before/after code examples per platform (web, Flutter, Android, iOS, Admin SDK/backend), plus rate-limiting patterns for abuse/quota-enforcement systems.
- `references/anti-patterns-checklist.md` — full grep-able anti-pattern table, the phased remediation plan (A–E), and a per-call-site audit table template to fill in when doing a full codebase pass.
- `references/audit-methodology.md` — the call-site inventory schema (FS-IDs), a multiplication-severity score, the necessity classification in more depth, and a baseline/after measurement template for a formal audit.
- `scripts/scan_for_risks.sh` — greps a codebase for Firestore call sites and known-risky surrounding patterns (effects/hooks, polling, offset pagination, Security Rules lookups) across JS/TS, Dart, Kotlin, Swift, and Python.

## Output format when doing a full audit

When asked to audit a real codebase (not just answer a question), present findings as a table: `ID | File | Call | Trigger | Frequency | Classification | Risk | Recommended fix`, grouped by phase (A/B/C/D), so the highest-leverage fixes are visible first. Don't just dump a wall of generic advice — tie each recommendation to an actual call site found in the scan. If no codebase is available (the user is asking conceptually), use the decision tables and checklist above directly instead of inventing file paths.
