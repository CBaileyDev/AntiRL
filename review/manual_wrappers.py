from pathlib import Path
from auditlib import ROOT, REVIEW
dest=REVIEW/'manual';dest.mkdir(exist_ok=True)
for name in ['test-coaching-ui.mjs','test-frontend-security.mjs','test-discord-local.mjs']:
    text=(ROOT/'scripts'/name).read_text(encoding='utf-8')
    text=text.replace('"../app/','"../../app/').replace('"../integrations/','"../../integrations/')
    text=text.replace('docs/validation','review/manual-output').replace('.local/discord','review/manual-data/discord')
    # Server receives generated test keys only; real environment provider/bot keys are not inherited.
    if name=='test-discord-local.mjs':
        text=text.replace('...process.env,','PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,')
    (dest/name).write_text(text,encoding='utf-8')
print('Review-owned wrappers created: output paths only, relative module paths, sanitized Discord child environment.')
