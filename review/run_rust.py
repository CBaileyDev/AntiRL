from auditlib import run
commands = [
 ('rust-fmt','cargo fmt --all -- --check'),
 ('rust-replay-core','cargo test -p replay-core --locked'),
 ('rust-coach-services','cargo test -p coach-services --locked'),
 ('rust-coach-all-original','cargo test -p coach-services --all-features --locked'),
 ('rust-workspace-original','cargo test --workspace --all-features --locked'),
 ('rust-clippy-original','cargo clippy --workspace --all-targets --all-features --locked -- -D warnings'),
 ('cargo-duplicates','cargo tree -d'),
]
for name, command in commands:
    run(command,name,timeout=1800)
