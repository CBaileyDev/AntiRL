from auditlib import run
run('cargo build --release -p replay-core --bin antirl-replay --locked','replay-cli-release-build')
run('node review/manual/test-discord-local.mjs review/fixtures/sample-1.replay','discord-local-real-clip',timeout=240)
