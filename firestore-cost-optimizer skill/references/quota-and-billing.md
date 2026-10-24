# Firestore quota & billing mechanics

> **Verification rule:** treat quotas, pricing, and SDK defaults below as time-sensitive. When the user's question depends on the current number, verify against official Firebase documentation before presenting it as fact — Google does revise these.
>
> Primary sources: https://firebase.google.com/docs/firestore/pricing · https://firebase.google.com/docs/firestore/quotas · https://firebase.google.com/docs/firestore/manage-data/transactions · https://firebase.google.com/docs/firestore/query-data/aggregation-queries · https://firebase.google.com/docs/firestore/manage-data/enable-offline · https://firebase.google.com/docs/firestore/security/rules-conditions · https://firebase.google.com/docs/firestore/best-practices

These are the underlying rules that explain *why* every recommendation in SKILL.md works. Use this when the user asks "why does this help" or needs to justify a fix, or when they dispute that something is a real optimization.

## How reads are counted

- Each **document returned by a query is billed as one read**. A query returning 10 documents = 10 reads; 100 documents = 100 reads.
- **Every query has a minimum charge of 1 read even if it returns zero documents.** Repeatedly "checking if something exists" via a query is not free just because the answer is no. This matters most for polling-style code (`setInterval` + `getDoc`), which can burn quota purely on negative checks.
- **`onSnapshot()` listeners bill a read for the entire initial result set on attach**, then 1 read per document that subsequently changes (not per snapshot event fired). This makes listeners cheap to *hold open* but expensive to constantly *re-attach*.
- **If a listener has been offline/disconnected for an extended period (documented as roughly 30+ minutes), Firestore cannot diff efficiently and re-charges for the full result set on reconnect** — as if it were a brand-new query. Apps that aggressively detach/reattach listeners (every route change, every tab focus, every unrelated state change in the effect's dependency array) pay full price repeatedly instead of the cheap "1 read per changed doc" path.
- **Local/offline cache reads are free.** Only reads that actually reach the Firestore backend are billed. But the cache only serves documents your app has already read — it isn't pre-populated.
- **Aggregation queries (`count()`, `sum()`, `average()`) are billed per index entries scanned**, roughly 1 read per 1,000 entries scanned, with a minimum of 1 read — dramatically cheaper than downloading documents client-side to count/sum them, for any reasonably sized collection.
- **Security Rule functions `get()`/`exists()`/`getAfter()` each cost a real, billed document read** — charged even when the rule denies the request. Repeated `get()` calls to the *same* document path within one rule evaluation are only billed once (evaluation-scoped caching), so redundant lookups across rule branches waste nothing extra if they hit the identical path — but different paths each cost separately.
- **Reading the same document twice within one transaction is only billed once.**
- **Offsets (`offset(n)`) still incur reads for every skipped document** — the skipped documents are retrieved internally even though they're discarded before reaching the app. Cursor-based pagination (`startAfter(lastDoc)`) avoids this entirely.

Sources: https://firebase.google.com/docs/firestore/pricing · https://firebase.google.com/docs/firestore/understand-reads-writes-scale · https://firebase.google.com/docs/firestore/query-data/aggregation-queries · https://firebase.google.com/docs/firestore/security/rules-conditions · https://firebase.google.com/docs/firestore/query-data/query-cursors

## How writes are counted

- A normal `set()`/`update()`/`add()` is one billed write per document touched.
- **Batched writes (`writeBatch()`) do not reduce the billed write count.** A batch of 4 writes to 4 different documents is still 4 billed writes — batching buys atomicity and fewer network round trips, not a quota discount.
- **Transactions retry automatically** when a document being read is changed by another process mid-transaction. Don't assume a transaction "costs the same as a plain write" — it can cost more under contention, and it adds a read for every document it touches, even ones it doesn't ultimately change.
- **`increment()`, `arrayUnion()`, `arrayRemove()` perform the read-modify-write server-side**, so the client never needs to read the document first to compute the new value. This both saves a read and is race-condition-safe — directly relevant to any quota/counter system where two clients might update concurrently.
- Under current Standard Firestore pricing, **automatic index maintenance is not billed as a separate document write** — the document write itself is still billed once, and index storage contributes to storage cost, not a second write charge. So removing an unused index is a performance/storage/scale optimization, not a way to turn one billed write into zero.
- Firestore soft-limits sustained writes to roughly 1 write/second to the *same document* before contention errors appear. High-concurrency counters need a sharded/distributed-counter pattern with a periodically-updated rollup, not one global document.

Sources: https://firebase.google.com/docs/firestore/manage-data/transactions · https://firebase.google.com/docs/firestore/manage-data/add-data · https://firebase.google.com/docs/firestore/solutions/counters · https://firebase.google.com/docs/firestore/best-practices

## Caching layers, from cheapest to most authoritative

| Layer | Server hit? | Notes |
|---|---|---|
| App-level in-memory/shared state (React context, provider, singleton, view model) | Never, for the session's lifetime | Best for data multiple screens/components need — read once, share everywhere |
| SDK persistent local cache (IndexedDB on web via `persistentLocalCache()`, on-by-default on most mobile SDKs) | Only on cache miss | Survives across sessions/app restarts; not enabled by default on the web SDK |
| Explicit cache-only read (`getDocFromCache()` / `Source.CACHE`) | Never | Use when you know the data is already cached and freshness isn't required right now |
| Explicit server-forced read (`getDocFromServer()` / `Source.SERVER`) | Always | Use only when freshness is mandatory, e.g. immediately before a privileged/financial action |
| Stale-while-revalidate | Shows cache immediately, refreshes in background | Good UX/cost balance for non-critical data; never use a stale cache to make a security-critical authorization decision — that must hit a trusted current source |

Note: on the web SDK, memory cache is the default when no cache config is specified; persistent (IndexedDB) cache must be explicitly enabled. Behavior has changed across SDK versions, so official docs should be trusted over older blog posts/answers when they conflict. https://firebase.google.com/docs/firestore/manage-data/enable-offline

## Free-tier (Spark) daily quota

| Resource | Free quota | Resets |
|---|---|---|
| Document reads | 50,000/day | ~Midnight Pacific Time |
| Document writes | 20,000/day | ~Midnight Pacific Time |
| Document deletes | 20,000/day | ~Midnight Pacific Time |
| Stored data | 1 GiB total | — |
| Outbound network egress | 10 GiB/month | Monthly |

The quota is **project-wide, not per user** — one runaway listener, poll loop, or bug in one client can exhaust the whole day's quota for every user on the project. Only one database per project receives the free quota. Treat "we hit the daily limit" reports as evidence of a systemic leak (a component, effect, or loop), not organic aggregate usage, unless the math actually supports organic usage at the observed user count.

If the person gives a local time zone and asks why the reset happens at an odd local hour, it's because the reset is anchored to Pacific Time, not their zone — convert accordingly rather than assuming the reset time is arbitrary.

Sources: https://firebase.google.com/docs/firestore/quotas · https://firebase.google.com/docs/firestore/pricing

**Verify these numbers with a web search if the conversation timeline suggests they may be stale** — Google revises free-tier quotas periodically, and this reference may not reflect the latest change.

## What is NOT a read/write optimization (don't credit these)

- **Batching writes** — atomicity/round-trip win only, not a quota reduction (see above).
- **Adding or removing indexes** — a performance/storage/write-latency change under Standard Firestore pricing, not a per-write billing change.
- **Using transactions instead of plain writes** — correctness tool, not a cost-saver; can cost *more* under contention.
- **Moving reads from client to Cloud Functions** — the read is still billed; only the *pattern* of who's allowed to make it changes (useful for security, not cost, unless it also reduces redundant client-side reads via server-side aggregation).
