#!/usr/bin/env bash
# scrub-check.sh — refuse to publish anything personal.
#
#   scripts/scrub-check.sh            scan the working tree (tracked + untracked, not ignored)
#   scripts/scrub-check.sh --history  also scan every commit's full patch and message
#
# Looks for the banned terms in scripts/scrub-terms.txt (case-insensitive
# substrings) plus email addresses, phone numbers and IPv4 addresses. Allowed:
# *@example.com, 127.0.0.1, 0.0.0.0, localhost. Prints `file:line TERM` (never
# the matching text) and exits 1 on any hit. Binary files are skipped.
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERMS_FILE="$HERE/scrub-terms.txt"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 2

EXCLUDE_RE='^(scripts/scrub-terms\.txt|scripts/scrub-check\.sh)$'
# Bracket forms only (no backslash escapes, no {n} intervals) so the SAME
# expressions work in GNU grep -E and in awk, including mawk.
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z][A-Za-z]+'
IP_RE='[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+'
PHONE_RE='[(]?[2-9][0-9][0-9][)]?[-. ][0-9][0-9][0-9][-. ][0-9][0-9][0-9][0-9]'

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
grep -v '^#' "$TERMS_FILE" | sed '/^[[:space:]]*$/d' | tr 'A-Z' 'a-z' > "$TMP/terms"

hits=0

# Pattern matches that are not on the allowlist.
filter_allowed() {
  grep -v -i -E '@example\.com|127\.0\.0\.1|0\.0\.0\.0|localhost' || true
}

scan_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  # Banned terms: grep -o prints only the matched term, which is all we report
  # (lower-cased so the report is stable whatever the file's casing).
  grep -n -i -I -o -F -f "$TMP/terms" -- "$f" 2>/dev/null \
    | sed -E 's/^([0-9]+):(.*)$/\1 \2/' | tr 'A-Z' 'a-z' \
    | awk -v f="$f" '{ print f ":" $1 " " substr($0, index($0, " ") + 1) }'
  # Patterns: report the KIND, never the matched text.
  grep -n -I -o -E -e "$EMAIL_RE" -e "$IP_RE" -e "$PHONE_RE" -- "$f" 2>/dev/null \
    | filter_allowed \
    | sed -E 's/^([0-9]+):(.*)$/\1 \2/' \
    | awk -v f="$f" '{ m = substr($0, index($0, " ") + 1); kind = "PHONE"; if (m ~ /@/) kind = "EMAIL"; else if (m ~ /^[0-9]+[.][0-9]+[.][0-9]+[.][0-9]+$/) kind = "IPV4"; print f ":" $1 " " kind }'
}

echo "scrub-check: working tree ($ROOT)"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git ls-files --cached --others --exclude-standard -z > "$TMP/files"
else
  find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' -print0 \
    | sed -z 's#^\./##' > "$TMP/files"
fi
while IFS= read -r -d '' f; do
  [[ "$f" =~ $EXCLUDE_RE ]] && continue
  scan_file "$f"
done < "$TMP/files" > "$TMP/tree-hits"
if [ -s "$TMP/tree-hits" ]; then
  sort -u "$TMP/tree-hits"
  hits=$((hits + $(sort -u "$TMP/tree-hits" | wc -l)))
fi

if [ "${1:-}" = "--history" ]; then
  echo "scrub-check: history (every commit, full patch + message)"
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "not a git repository" >&2; exit 2
  fi
  # Stream every commit (message, then patch) through one awk pass that tracks
  # the current commit and file. Only ADDED lines and message lines are checked.
  git log -p --all --no-color --format='%x01commit %H%n%s%n%b%x02' \
    | awk -v terms="$TMP/terms" -v email="$EMAIL_RE" -v ip="$IP_RE" -v phone="$PHONE_RE" -v exclude="$EXCLUDE_RE" '
      BEGIN {
        n = 0; while ((getline t < terms) > 0) { if (t != "") { n++; T[n] = t } }
        commit = "?"; file = "(commit message)"; inmsg = 0
      }
      function report(kind) { print "history " substr(commit, 1, 10) ":" file " " kind; hits++ }
      function check(line,   low, i, s, m) {
        low = tolower(line)
        for (i = 1; i <= n; i++) if (index(low, T[i]) > 0) report(T[i])
        s = line
        while (match(s, email)) { m = substr(s, RSTART, RLENGTH); if (tolower(m) !~ /@example\.com$/) report("EMAIL"); s = substr(s, RSTART + RLENGTH) }
        s = line
        while (match(s, ip)) { m = substr(s, RSTART, RLENGTH); if (m != "127.0.0.1" && m != "0.0.0.0") report("IPV4"); s = substr(s, RSTART + RLENGTH) }
        if (match(line, phone)) report("PHONE")
      }
      /^\001commit [0-9a-f]+$/ { commit = substr($2, 1); file = "(commit message)"; inmsg = 1; next }
      /^\002$/ { inmsg = 0; next }
      inmsg == 1 { check($0); next }
      /^\+\+\+ b\// { file = substr($0, 7); next }
      /^\+\+\+ \/dev\/null/ { file = "(deleted)"; next }
      /^diff --git / { file = "?"; next }
      /^\+/ { if (file !~ exclude) check(substr($0, 2)) }
      END { exit (hits > 0 ? 1 : 0) }
    ' > "$TMP/history-hits"
  if [ -s "$TMP/history-hits" ]; then
    sort -u "$TMP/history-hits"
    hits=$((hits + $(sort -u "$TMP/history-hits" | wc -l)))
  fi
fi

if [ "$hits" -gt 0 ]; then
  echo "scrub-check: FAILED — $hits hit(s)"
  exit 1
fi
echo "scrub-check: clean"
exit 0
