#!/usr/bin/env bash
# Runs Playwright inside the official Playwright image against the dockerised dev server.
# Usage: scripts/e2e.sh            -> smoke tests
#        scripts/e2e.sh screenshots -> regenerate docs/screenshots
set -euo pipefail
cd "$(dirname "$0")/.."

docker compose up -d app
echo "Waiting for the dev server…"
for _ in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://localhost:5173').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "${1:-}" == "screenshots" ]]; then
  mkdir -p docs/screenshots
  docker compose --profile e2e run --rm -e SCREENSHOTS=1 e2e npx playwright test e2e/screenshots.spec.ts --workers=1
else
  docker compose --profile e2e run --rm e2e npx playwright test e2e/smoke.spec.ts
fi
