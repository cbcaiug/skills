# Anti-pattern checklist & remediation plan

> Use this after inventorying concrete call sites, not as a substitute for that step. A checklist match is a candidate, not a finding, until its trigger, frequency, and billed impact are actually established.

## Grep targets

When auditing a real codebase, search for these call sites first (see `scripts/scan_for_risks.sh` for an automated pass across JS/TS, Dart, Kotlin, Swift, Python):

```
getDoc( / getDocs(
query(
onSnapshot( / addSnapshotListener( / .snapshots(
runTransaction(
writeBatch( / WriteBatch
setDoc( / addDoc( / add(
updateDoc( / update(
increment( / FieldValue.increment
exists( / getAfter(   (inside Security Rules)
setInterval( / Timer(  (polling)
```

Then inspect the surrounding trigger — this is where the actual risk lives, not in the Firestore call itself:

```
useEffect( / useMemo( / useCallback( / useState(   (React)
initState( / build( / StreamBuilder                (Flutter)
onCreate( / onResume( / addSnapshotListener          (Android)
viewDidLoad( / viewWillAppear(                       (iOS)
context/provider code, dependency-injection scopes
route/page mounting, navigation guards
authentication state change handlers
payment/webhook callbacks
message-send / generate / submit handlers
```

## Risk table

| Code pattern | Risk |
|---|---|
| Firestore call inside a render/build/effect hook without carefully chosen dependencies | Very high |
| Effect/hook depends on state that the effect itself updates (self-triggering loop) | Critical |
| Same document read independently by many components/screens | Very high |
| Listener (`onSnapshot`/`.snapshots()`/`addSnapshotListener`) attached in several places for the same document | Very high |
| Listener recreated whenever unrelated state changes | Critical |
| `getDocs()`/full collection fetch on page/screen load with no `where`/`limit` | Very high |
| Polling with `setInterval`/`Timer` against Firestore | Critical |
| Firestore write on every keystroke/drag/scroll event | Very high |
| Read-then-write where `increment()`/`arrayUnion()`/`arrayRemove()` would suffice | High |
| Transaction used for a simple unconditional counter update | Medium/high |
| Querying an event/history collection just to compute a current balance that could be a stored field | High |
| Static/rarely-changing reference or config data stored in and re-fetched from Firestore | Medium/high |
| Large arrays/maps embedded in a document that's read frequently | High |
| Security Rules with many `get()`/`exists()`/`getAfter()` calls, especially to different paths | Medium/high |
| Multiple browser tabs/app instances each independently opening listeners for the same data | Medium/high |
| Firestore used to hold transient UI state (open modal, current tab, in-progress form text) | High |
| Offset-based pagination (`offset(n)`) instead of cursors | Medium |

## Phased remediation plan

Work top to bottom — earlier phases have the highest ratio of savings to effort, and later phases assume the accidental waste from earlier phases is already gone (otherwise it's hard to tell what's "legitimate" usage).

### Phase A — Stop accidental consumption
1. Eliminate Firestore calls caused by render/effect/rebuild loops.
2. Ensure every listener is unsubscribed/removed in cleanup (unmount, `onDestroy`, `deinit`, route change).
3. Ensure listener dependencies represent data identity (a uid, an id), not unrelated UI state.
4. Remove listeners that don't need to be real-time.
5. Remove polling loops.
6. Stop repeated reads of the same document from multiple components/screens.
7. Centralize shared data (especially the current-user/account document) behind one provider/repository/store.

### Phase B — Reduce legitimate reads
1. Add `limit()` and `where()` to constrain query scope.
2. Replace broad/unfiltered collection queries with targeted ones.
3. Replace offset pagination with cursors (`startAfter`).
4. Enable persistent local cache where the platform doesn't default to it (notably the web SDK).
5. Move static/public/rarely-changing data out of Firestore entirely where practical (static hosting/CDN instead).
6. Denormalize small, frequently-read summary documents to avoid multi-document reads per screen.
7. Use aggregation queries (`count()`/`sum()`/`average()`) or a maintained counter field instead of downloading to compute.

### Phase C — Reduce legitimate writes
1. Persist only durable business state — keep transient UI/generation state local.
2. Debounce/batch high-frequency writes at the application level (autosave, presence, typing indicators).
3. Use `increment()`/`arrayUnion()`/`arrayRemove()` instead of read-modify-write.
4. Reserve transactions for cases that genuinely need conditional atomicity; don't use them for plain counters.
5. Batch logically-related writes when atomicity matters, understanding it doesn't reduce the write count.
6. Avoid logging every fine-grained event (especially AI-generation intermediate states) as a separate Firestore write.

### Phase D — Security and scale
1. Review Security Rules for unnecessary `get()`/`exists()`/`getAfter()` lookups; move data needed for authorization onto the resource itself where feasible.
2. Review indexes — remove unused ones (helps performance/storage/write latency, not billed write count).
3. Check for hotspotting: sustained high write rate to one document, or monotonically increasing/sequential document IDs at high write volume.
4. Keep high-frequency workloads partitioned (sharded counters, per-user/per-event documents) rather than one global document.
5. Verify document sizes stay well under the 1 MiB limit and away from very large field counts/arrays.

### Phase E — Measure
Track, at minimum:
```
reads/day, writes/day, deletes/day
reads/session, writes/session
reads/user/day, writes/user/day
listener count/session
query result sizes
which feature/screen is most expensive
```
The goal of a remediation pass is a measurable reduction in billed operations (Firebase Console → Firestore → Usage tab, or custom instrumentation) — not just code that reads more cleanly. If you can't point to a before/after number, treat the fix as unverified.

## Audit table template

Use this format when presenting a full codebase audit:

| File | Function/component | Operation | Trigger | Frequency | Server read/write? | Cached already? | Actually required? | Risk | Recommended fix |
|---|---|---|---|---|---|---|---|---|---|
| `...` | `...` | `getDoc` | page load | once/session | read | no | yes | medium | move to shared provider |
| `...` | `...` | `onSnapshot` | mount | persistent | reads | no | maybe | high | assess whether live data is needed |
| `...` | `...` | `updateDoc` | every keystroke | per keystroke | write | n/a | yes | high | debounce to 2s |
| `...` | `...` | `getDocs` | dashboard render | every render | many reads | no | yes | critical | fix effect dependency array |

## What NOT to credit as an optimization

Don't tell the user these reduce billed operations — they solve different problems:
- Batching writes (atomicity/round-trips only)
- Adding or removing indexes (performance/storage/write-latency only, under Standard Firestore pricing)
- Wrapping a plain write in a transaction (correctness, not cost — can cost *more* under contention)
- Moving a read from client to a Cloud Function (still billed; changes who's allowed to make it, not the cost of making it)
