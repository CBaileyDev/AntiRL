from auditlib import ROOT, REVIEW, run
import subprocess, io, zipfile
dest=REVIEW/'snapshot'
dest.mkdir(exist_ok=True)
with zipfile.ZipFile(io.BytesIO(subprocess.check_output(['git','archive','--format=zip','HEAD'],cwd=ROOT))) as z:
    z.extractall(dest)
run('pnpm --dir app install --frozen-lockfile','fresh-install-original',cwd=dest)
run('pnpm --dir app install --frozen-lockfile --config.strict-dep-builds=false','fresh-install-workaround',cwd=dest)
run('cargo test -p coach-services --all-features --locked','fresh-all-features-original',cwd=dest,env={'CARGO_TARGET_DIR':str(ROOT/'target')})
