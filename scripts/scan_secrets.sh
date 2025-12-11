#!/usr/bin/env bash
# Enkel secrets-sökare (kör från repo-roten)
# Usage:
#   ./scripts/scan_secrets.sh            # scan working tree
#   ./scripts/scan_secrets.sh --help     # show this help
# Examples:
#   npm run scan-secrets
#   docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:latest detect --source /repo --report-path /repo/gitleaks-report.json

set -u

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

# Exkludera tunga kataloger
EXCLUDE_DIRS=(.git node_modules dist build .venv .cache)
EXCLUDE_ARGS=()
for d in "${EXCLUDE_DIRS[@]}"; do
  EXCLUDE_ARGS+=(--exclude-dir="$d")
done

# Mönster att söka efter (lägg till efter behov)
PATTERNS=(
  "BEGIN PRIVATE KEY"
  "BEGIN RSA PRIVATE KEY"
  "PRIVATE KEY"
  "private_key"
  "PRIVATE_KEY"
  "RESEND_API_KEY"
  "RESEND_API"
  "TOKEN_ENCRYPTION_KEY"
  "CLIENT_SECRET"
  "MICROSOFT_CLIENT_SECRET"
  "AWS_SECRET_ACCESS_KEY"
  "AWS_ACCESS_KEY_ID"
  "AKIA[0-9A-Z]{16}"
  "api_key"
  "API_KEY"
  "PASSWORD="
  "SESSION_SECRET"
  "FIREBASE_PRIVATE_KEY"
  "-----BEGIN PRIVATE KEY-----"
)

# Build grep pattern
GREP_PATTERN="$(printf "%s|" "${PATTERNS[@]}" | sed 's/|$//')"

echo "Scanning repo for likely secrets (this searches working tree files)..."
echo "Root: $ROOT_DIR"
echo

# Run grep
grep -RIn --line-number --with-filename -E "$GREP_PATTERN" . "${EXCLUDE_ARGS[@]}" 2>/dev/null || true

echo
echo "Done scanning working tree. Recommended next steps:"
echo "  1) Install and run gitleaks to scan commit history: https://github.com/gitleaks/gitleaks"
echo "     Example: gitleaks detect --source . --report-path gitleaks-report.json"
echo "  2) Or run truffleHog / trufflehog3 for deeper scan of history"
echo "  3) If you find secrets: rotate/revoke them immediately, remove files, purge git history (git filter-repo / BFG)."
echo
exit 0

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo "Usage: $0 [--help]"
  echo
  echo "Scans working tree for likely secrets (does NOT scan git history)."
  echo
  echo "Examples:"
  echo "  npm run scan-secrets"
  echo "  bash scripts/scan_secrets.sh"
  echo
  echo "To scan git history use gitleaks (Docker):"
  echo "  docker run --rm -v \"\$(pwd)\":/repo zricethezav/gitleaks:latest detect --source /repo --report-path /repo/gitleaks-report.json"
  exit 0
fi
