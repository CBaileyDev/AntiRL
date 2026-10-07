from auditlib import run
run('pnpm --dir app exec playwright test tests/coaching.spec.ts --config ../review/playwright.config.ts --repeat-each=5 --workers=2 --timeout=180000 --retries=0','coach-race-five-runs')
run('pnpm --dir app exec playwright test tests/frontend-security.spec.ts --config ../review/playwright.config.ts --workers=1 --timeout=45000 --retries=0','security-software-webgl',env={'REVIEW_SOFTWARE':'1'})
