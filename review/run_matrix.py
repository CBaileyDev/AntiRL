from auditlib import run
commands = [
 ('frontend-build','pnpm --dir app build'),
 ('frontend-lint','pnpm --dir app lint'),
 ('frontend-format','pnpm --dir app format:check'),
 ('frontend-unit','pnpm --dir app test:unit'),
 ('playwright-original','pnpm --dir app exec playwright test'),
 ('discord-unit','node --test integrations/discord/test.mjs'),
 ('studio-unit','node scripts/test-replay-studio.mjs'),
 ('frontend-outdated','pnpm --dir app outdated'),
 ('frontend-audit','pnpm --dir app audit'),
 ('ranks-quality','node scripts/test-ranks-quality.mjs'),
 ('studio-meshes','python scripts/test-studio-meshes.py'),
]
for name, command in commands:
    run(command,name,timeout=1800)
