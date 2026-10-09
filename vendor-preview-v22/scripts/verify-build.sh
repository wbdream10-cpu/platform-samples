#!/bin/sh
# Deployment checks: isolated static technical-support demo only.
set -eu
for file in public/index.html public/assets/app.js public/assets/style.css public/health.json public/robots.txt; do
  if [ ! -s "$file" ]; then echo "Missing/empty file: $file" >&2; exit 1; fi
done
if ! grep -Fq 'MASTER7' public/index.html; then echo 'Brand missing' >&2; exit 1; fi
if ! grep -Fq 'src="/assets/app.js"' public/index.html; then echo 'App JS link missing' >&2; exit 1; fi
if ! grep -Fq 'href="/assets/style.css"' public/index.html; then echo 'Stylesheet link missing' >&2; exit 1; fi
if grep -Eiq '<style([[:space:]>])|<script([[:space:]]*>|[[:space:]]+type=)|[[:space:]]style[[:space:]]*=' public/index.html; then
  echo 'Unexpected inline script/style found' >&2; exit 1
fi
if grep -Fq 'unsafe-inline' public/index.html || grep -Fq 'unsafe-inline' render.yaml; then
  echo 'Unsafe inline policy found' >&2; exit 1
fi
if ! grep -Fq '"status": "ok"' public/health.json; then echo 'Health marker missing' >&2; exit 1; fi
if ! grep -Fq '"live_ai": false' public/health.json; then echo 'Live AI flag must stay false' >&2; exit 1; fi
if command -v node >/dev/null 2>&1; then node --check public/assets/app.js; fi
printf 'MASTER7 V2.2 static-demo build checks passed\n'
