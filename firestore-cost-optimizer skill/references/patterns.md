# Platform-specific patterns

> These are implementation patterns, not current billing documentation. Verify SDK-specific behavior, cache defaults, and current Firestore billing rules against official Firebase docs when the distinction actually affects a recommendation — web, Android, iOS, and Flutter SDKs do not all share identical cache defaults or APIs.

The principles are identical across platforms; only the API surface differs. Use the section matching the user's stack. If their stack isn't listed (e.g. Vue, Angular, server-side Python/Go), translate the JS/TS web examples — the Firestore client library concepts (listener attach/detach, `get()` vs `onSnapshot()`, `increment()`, cursors) map directly.

---

## Web (JavaScript/TypeScript SDK — React, Vue, Angular, vanilla)

### 1. Listener recreated on unrelated state changes

Bad — listener is destroyed and reattached every time `someChangingState` changes, and reattachment after a gap can be billed as a fresh full read of the result set:

```js
useEffect(() => {
  const unsubscribe = onSnapshot(userRef, ...)
  return unsubscribe
}, [someChangingState])
```

Good — listener lifetime tracks actual data identity (e.g. the user's uid), not unrelated UI state:

```js
useEffect(() => {
  if (!uid) return;
  const unsubscribe = onSnapshot(userRef, snapshot => {
    setUser(snapshot.data());
  });
  return unsubscribe;
}, [uid]);
```

### 2. Multiple components independently reading the same document

Bad — five components each call `getDoc(userRef)` independently:

```
Header -> read /users/uid
Dashboard -> read /users/uid
QuotaBadge -> read /users/uid
```

Good — one owner reads once and distributes via context/provider/shared store:

```js
// UserProvider reads once
const [user, setUser] = useState(null);
useEffect(() => {
  if (!uid) return;
  return onSnapshot(userRef, snap => setUser(snap.data()));
}, [uid]);

// Consumers just read from context — zero additional Firestore reads
const { user } = useContext(UserContext);
```

### 3. Effect loop (self-triggering read)

Bad — the effect updates the same state it depends on, causing a re-render → re-run → read → re-render loop:

```js
useEffect(() => {
  getDocs(...).then(setState);
}, [state]); // reads every time state changes, including the change this effect just made
```

Good — depend only on the identity that should trigger a refetch (e.g. a filter or id), not on the data being fetched.

### 4. Broad collection scan / offset pagination

Bad:

```js
getDocs(collection(db, "users")) // returns everything, billed per doc
query(collection(db, "users"), orderBy("createdAt"), offset(100)) // still reads the 100 skipped docs
```

Good:

```js
query(
  collection(db, "users"),
  where("schoolId", "==", schoolId),
  orderBy("createdAt"),
  startAfter(lastVisible),
  limit(20)
)
```

### 5. Read-modify-write counter vs. atomic increment

Bad:

```js
const snap = await getDoc(userRef);
await updateDoc(userRef, { messagesUsed: snap.data().messagesUsed + 1 });
```

Good — server-side atomic op, no read needed, race-condition-safe:

```js
await updateDoc(userRef, { messagesUsed: increment(1) });
```

Use a transaction instead only when you must enforce a condition (e.g. "don't go below zero") based on the current value:

```js
await runTransaction(db, async (tx) => {
  const snap = await tx.get(userRef);
  const remaining = snap.data().remaining;
  if (remaining <= 0) throw new Error("no quota");
  tx.update(userRef, { remaining: increment(-1) });
});
```

### 6. Polling instead of event-driven updates

Bad — a single open tab polling every 5s costs ~17,280 reads/day on its own:

```js
setInterval(() => getDoc(docRef).then(handle), 5000);
```

Good: use a real listener only if genuinely real-time data is needed, or update local state directly right after the write your own client just made — don't re-fetch something you already know the new value of.

### 7. Writing on every keystroke

Bad:

```js
onChange={(e) => updateDoc(noteRef, { text: e.target.value })}
```

Good — keep keystrokes in local state, persist on debounce/blur/interval:

```js
const [text, setText] = useState(initialText);
const debouncedSave = useMemo(() => debounce((val) => {
  updateDoc(noteRef, { text: val });
}, 2000), [noteRef]);

const onChange = (e) => {
  setText(e.target.value);
  debouncedSave(e.target.value);
};
```

### 8. Enabling persistent cache (web only — not default)

```js
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
```

### 9. Counting without downloading

Bad:

```js
const snap = await getDocs(collection(db, "usageEvents"));
const count = snap.size; // downloaded every document just to count them
```

Good:

```js
import { getCountFromServer } from "firebase/firestore";
const snap = await getCountFromServer(query(collection(db, "usageEvents"), where("uid", "==", uid)));
const count = snap.data().count;
```

---

## Flutter / Dart

Same principles; the Dart SDK exposes `.get()`, `.snapshots()`, and cache options analogously.

```dart
// One-time fetch instead of a live stream when data doesn't need to be real-time
final doc = await FirebaseFirestore.instance.collection('users').doc(uid).get();

// Listener scoped to a StreamProvider/Riverpod/BLoC that lives for the auth session,
// not recreated per widget build
final userStream = FirebaseFirestore.instance
    .collection('users')
    .doc(uid)
    .snapshots(); // hold this in a provider keyed by uid, not rebuilt on every widget rebuild

// Cache-preferring read for stable data
final cachedDoc = await docRef.get(const GetOptions(source: Source.cache));

// Atomic increment
await docRef.update({'messagesUsed': FieldValue.increment(1)});

// Cursor pagination instead of offset
final query = FirebaseFirestore.instance
    .collection('items')
    .orderBy('createdAt')
    .startAfterDocument(lastDoc)
    .limit(20);
```

Offline persistence is on by default on Android/iOS (unlike the web SDK) — confirm it hasn't been explicitly disabled, and use a local store (e.g. Drift/SQLite, Hive, Isar) as an app-level cache in front of Firestore for data multiple screens need repeatedly, mirroring the "shared provider" pattern from web.

**Avoid recreating streams inside `build()`** — a `StreamBuilder` fed a stream created fresh on every rebuild reattaches the listener repeatedly. Create the stream once (in `initState`, a provider, or a repository) and pass the same stream instance into the widget tree.

---

## Android (Kotlin) / iOS (Swift)

Same mechanics; the fix pattern is identical to Flutter/web:

```kotlin
// Kotlin — one-time get vs live listener
val doc = userRef.get().await() // one-time

val registration = userRef.addSnapshotListener { snapshot, _ -> ... }
// Store `registration` and call registration.remove() in onDestroy/onCleared —
// an unremoved listener is the mobile equivalent of an orphaned useEffect.

// Atomic increment
userRef.update("messagesUsed", FieldValue.increment(1))
```

```swift
// Swift
let doc = try await userRef.getDocument() // one-time

let listener = userRef.addSnapshotListener { snapshot, error in ... }
// Store `listener` and call listener.remove() in deinit/viewDidDisappear

try await userRef.updateData(["messagesUsed": FieldValue.increment(Int64(1))])
```

The audit questions from SKILL.md apply identically: is the listener's lifecycle tied to a view controller/activity that gets recreated often (e.g. on rotation, on every navigation), and if so, is it being properly removed and not needlessly reattached?

---

## Backend / Admin SDK (Node.js, Python, Go, Java)

The Admin SDK bypasses Security Rules, so rule-lookup read costs (`get()`/`exists()` in rules) don't apply to server-side code — but every read/write is still billed the same way. Server-side patterns to apply:

- **Enforce quota/rate-limiting atomically server-side** rather than trusting a client to read-check-decide-write. A callable Cloud Function or HTTPS endpoint doing a transactional check-and-decrement is both a cost fix (bounded, predictable ops per call) and a security fix (a client can't spoof its own quota check).
- A common community pattern for this is a small atomic "check-and-record" helper against a single tracking document per rate-limited action — roughly 1 read + up to 1 write per checked call, instead of ad hoc reads scattered through business logic. This bounds *frequency* but not *intent* — pair it with real per-user quota fields validated server-side, not just a call-frequency limiter.
- **Batch imports/migrations** should still expect N billed writes for N documents — batching only helps atomicity/throughput, not the bill. Ramp up parallel writes gradually rather than a huge sudden burst to avoid hotspotting sequential or lexicographically close document IDs.
- **Scheduled reconciliation jobs** (e.g. re-checking daily quota resets) should read only the documents that plausibly need reconciling (a `where` filter on a "pending" or "dirty" flag), not the entire collection on every run.

```js
// Node.js Admin SDK — atomic quota check-and-decrement in a transaction
await db.runTransaction(async (tx) => {
  const snap = await tx.get(userRef);
  const remaining = snap.data().remaining ?? 0;
  if (remaining <= 0) throw new Error("quota exhausted");
  tx.update(userRef, { remaining: admin.firestore.FieldValue.increment(-1) });
});
```

---

## Security Rules (applies to every platform's client, since rules run server-side regardless of caller)

Bad — a separate document lookup on every check, billed even on denial:

```
allow write: if get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role == 'admin';
```

Better — put the authorization signal directly on the resource being written, or in custom auth claims, so the rule can evaluate without a lookup:

```
allow write: if request.auth.uid in resource.data.memberIds;
```

If a cross-document check truly can't be avoided, move the authorization logic into a Cloud Function using the Admin SDK (which bypasses rules for its own operations) rather than layering more `get()` calls into the rules themselves.
