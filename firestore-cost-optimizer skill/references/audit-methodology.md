# Firestore Audit Methodology

Use this reference to turn a repository scan into a traceable Firestore usage audit.

## 1. Call-site inventory

Assign a stable ID to every relevant Firestore call site:

| ID | File | Function/component | Operation | Target | Trigger | Frequency | Result size | Listener? | Cache? | Classification | Risk | Action | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FS-001 | | | | | | | | | | | | | |

Do not delete an ID after a refactor. Mark it replaced/removed and record the replacement ID when useful.

## 2. Trigger analysis

For each call site document the real trigger, not merely the nearest code construct.

Examples:

- initial route mount
- React effect dependency change
- Flutter widget rebuild
- Android lifecycle event
- iOS view lifecycle
- explicit user action
- timer/polling loop
- listener reconnect
- retry
- Cloud Function invocation
- webhook/payment event

Then estimate:

`operations per trigger × triggers per session × sessions per day`

Use measured data whenever available. Label estimates as `[Inference]` when they are logical calculations based on observed code but not directly measured in production.

## 3. Multiplication score

Use this qualitative score:

| Score | Meaning |
|---|---|
| 0 | No evident multiplication |
| 1 | Occasional duplicate work |
| 2 | Repeatable duplication across navigation/components |
| 3 | High-frequency repetition, polling, or remount loop |
| 4 | Unbounded/runaway or project-wide quota risk |

Prioritize high-score call sites first.

## 4. Necessity classification

### Necessary

The operation is required for correctness, authorization, required persistence, or explicit freshness requirements.

### Reducible

The operation is legitimate but can use fewer documents, less frequent refreshes, a smaller summary document, a cursor, a cache, or another access pattern.

### Avoidable

The requested value is already available locally, is static, or can be represented without a Firestore operation.

### Multiplying

The logical requirement is legitimate, but implementation causes repeated operations for the same logical need.

### Dangerous optimization

A proposal would reduce usage by weakening a correctness, authorization, durability, or freshness requirement.

## 5. Baseline test

Before changing the code, define one reproducible scenario.

Record:

- app/build version
- SDK version
- test date/time
- user/session state
- navigation sequence
- Firestore operations observed
- listener count
- result sizes where measurable
- total elapsed time

Repeat the exact same scenario after the change.

## 6. Spark quota incident calculation

When a project reports daily quota exhaustion:

1. Verify the current quota from official Firebase documentation.
2. Record the project-level usage observed.
3. Determine which resource was exhausted: reads, writes, deletes, or another resource.
4. Identify whether usage continued or stopped after the error.
5. Estimate whether normal user activity could plausibly consume the observed amount.
6. Search for high-multiplication patterns before assuming organic growth.

Example calculation:

`20 documents/query × 50 queries/session × 50 sessions/day = 50,000 document reads/day`

This calculation is an estimate unless directly measured, so label it `[Inference]`.

## 7. Containment before redesign

For an active incident:

1. Disable or gate a clearly runaway optional feature if doing so is safe.
2. Stop duplicate listeners/polling.
3. Prevent retry storms.
4. Preserve authoritative state.
5. Restore required flows with the smallest safe data access pattern.
6. Only after containment, perform broad optimization.

Never silently convert a failed authoritative read into zero, empty state, or a fresh entitlement when doing so could overwrite valid existing data.

## 8. Acceptance criteria for an optimization

A Firestore cost/quota optimization is accepted only when:

- the intended behavior still works,
- authorization is not weakened,
- required freshness is retained,
- the call site no longer has the identified waste pattern,
- verification shows a lower workload or a clearly justified change in another metric,
- no new error/retry loop has been introduced.

If verification was not possible, mark the result `[UNVERIFIED: ...]`.
