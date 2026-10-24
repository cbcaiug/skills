#!/usr/bin/env bash
# 1) tokens.json -> CSS variables  2) scope CSS under html[data-theme-pack="soft-paper"]  3) icon sprite (Lucide) -> theme.js
cd "$(dirname "$0")/.."
python3 scripts/build_tokens.py
sed 's|@S|html[data-theme-pack="soft-paper"]|g' assets/theme.src.css > assets/theme.css
echo "built assets/theme.css ($(wc -c < assets/theme.css) bytes)"
python3 scripts/build_icons.py
