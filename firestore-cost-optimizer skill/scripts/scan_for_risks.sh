#!/usr/bin/env bash
# Scans a codebase for Firestore call sites and common risk patterns across
# JS/TS (web), Dart (Flutter), Kotlin (Android), Swift (iOS), and Python (Admin SDK).
#
# Usage: ./scan_for_risks.sh <path-to-repo>
#
# This is a discovery aid, not a linter or proof of billed usage — it finds
# candidate lines to inspect manually against the audit questions in SKILL.md
# (and, for a formal audit, log into references/audit-methodology.md). It does
# not understand control flow, so it will surface false positives; that's expected.

set -euo pipefail

TARGET="${1:-.}"

if [ ! -d "$TARGET" ]; then
  echo "Error: '$TARGET' is not a directory." >&2
  exit 1
fi

EXCLUDE_DIRS='node_modules|\.git|build|dist|\.next|\.dart_tool|Pods|DerivedData|__pycache__|\.venv|coverage|vendor'
CODE_INCLUDES='--include=*.js --include=*.jsx --include=*.ts --include=*.tsx --include=*.dart --include=*.kt --include=*.swift --include=*.py'

run_search() {
  local label="$1"
  local include_args="$2"
  local pattern="$3"
  echo
  echo "== $label =="
  # shellcheck disable=SC2086
  grep -RnE $include_args -E "$pattern" "$TARGET" 2>/dev/null \
    | grep -vE "$EXCLUDE_DIRS" \
    || echo "(none found)"
}

echo "Firestore Risk Scanner"
echo "Target: $TARGET"
echo "Note: matches are candidates for manual audit; they are not proof of billed operations."

run_search \
  "Firestore reads/listeners/transactions/writes" \
  "$CODE_INCLUDES" \
  '(getDoc|getDocs|getCountFromServer|getAggregateFromServer|onSnapshot|addSnapshotListener|\.snapshots\(|runTransaction|writeBatch|WriteBatch|setDoc|addDoc|updateDoc|deleteDoc|FieldValue\.increment|increment\(|arrayUnion|arrayRemove|count\(|sum\(|average\()'

run_search \
  "Polling/timers" \
  "--include=*.js --include=*.jsx --include=*.ts --include=*.tsx --include=*.dart --include=*.kt --include=*.swift" \
  '(setInterval\(|setTimeout\(|Timer\.periodic\(|Timer\()'

echo
echo "== React effects/hooks with Firestore calls inside (inspect dependency arrays) =="
grep -RnE --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' \
  -B2 -A2 -E '(getDoc|getDocs|onSnapshot)\(' "$TARGET" 2>/dev/null \
  | grep -E 'useEffect|useMemo|useCallback|getDoc|getDocs|onSnapshot|--' \
  | grep -vE "$EXCLUDE_DIRS" || echo "(none found)"

run_search \
  "Offset pagination (prefer cursors)" \
  "--include=*.js --include=*.jsx --include=*.ts --include=*.tsx --include=*.dart --include=*.kt --include=*.swift" \
  '(\.offset\(|offset\()'

run_search \
  "Security Rules cross-document lookups (each get()/exists()/getAfter() is a billed read)" \
  "--include=*.rules" \
  '(get\(|exists\(|getAfter\()'

echo
echo "== Broad collection reads with no visible where()/limit() on the same or nearby line =="
grep -RnE --include='*.js' --include='*.jsx' --include='*.ts' --include='*.tsx' --include='*.dart' \
  -E 'collection\([^)]*\)\s*\)' "$TARGET" 2>/dev/null | grep -vE "$EXCLUDE_DIRS" || echo "(none found)"

echo
echo "Next step: for each hit above, answer the audit questions in SKILL.md — what triggers"
echo "this call, how often can it fire, and would shared/local state or a cache already satisfy it?"
echo "For a formal audit, assign stable IDs (FS-001, FS-002, ...) and log findings using the"
echo "inventory template in references/audit-methodology.md."
