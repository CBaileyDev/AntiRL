# AntiRL Discord coaching integration

This standalone signed HTTP interactions server implements `/coach` with a replay attachment and an explicit replay player ID. It replies privately with deterministic evidence, one review candidate, a six-second schematic WebM of recorded positions, and available stat deltas. It never guesses the recorder's identity, estimates rank, assigns bot confidence, or calls an LLM.

## Setup

1. Build the replay worker from the repo root: `cargo build --release -p replay-core --bin antirl-replay`.
2. Install the frontend dependencies with `pnpm --dir app install`, then Chromium with `pnpm --dir app exec playwright install chromium`. The renderer uses the repository's pinned Playwright dependency.
3. In this folder copy `.env.example` to `.env`. Configure your Discord application ID and public key, guild allowlist, worker executable, and a private data folder. Keep the bot token only for command registration. No credentials are bundled or discovered automatically.
4. Run `node --env-file=.env register.mjs` to register `/coach` in your allowed guilds. It posts this single command; it does not replace unrelated commands.
5. Run `node --env-file=.env server.mjs`, then expose localhost port 49201 through your trusted HTTPS reverse proxy. Set the application's Interactions Endpoint URL to `https://your-host/interactions`. Only POST requests with valid Ed25519 signatures, a matching application ID and fresh timestamp are accepted. Do not expose the desktop WebView debug endpoint.
6. Install your Discord application in an allowed guild with command permissions. No privileged message-content intent is needed. Submit `/coach` with a `.replay` and the exact platform ID shown in AntiRL's perspective/library data (for example `steam:765…`). The response is private. This is an attachment slash command, not automatic monitoring of every channel message.

The server starts only when its required configuration is present. Only command registration needs a bot token; the runtime uses signed interaction webhooks. Live registration/delivery has not been tested because no application credentials or public endpoint were supplied.

## Bounds and privacy

- Guild allowlist, one active job at a time, duplicate-interaction protection, a 256 KiB signed-body limit and 64 MiB replay limit. Downloads accept Discord attachment hosts only, reject redirects, enforce declared byte length, and time out.
- The native decoder runs in a separate process with a 45-second timeout and bounded JSON output. Do not treat this as an OS memory sandbox; add deployment resource isolation for an untrusted public service.
- No original filenames become filesystem paths. Jobs use newly allocated directories under the configured data root; cleanup checks the resolved directory is inside that root before removing it.
- Raw replay job folders are removed after success/failure. An abrupt server/OS termination can leave a job folder; an operator can remove abandoned `job-*` directories after stopping the server. Do not run multiple instances against the same data folder.
- Only compact metrics, replay hashes/IDs, mode and timestamp persist after a job, keyed by a SHA-256 of guild, Discord user, player and mode. Comparison needs identical metric versions and a different replay hash. Missing metrics/deltas stay Unknown. History is retained for seven days and purged on startup/hourly checks.
- Replays were already uploaded to Discord by the requester; output clips/cards also go to Discord under its retention policy. There is no third-party detector or LLM upload. Names cannot trigger mentions because `allowed_mentions` is empty.
- A marker is a review candidate, not established blame. Clips are labelled schematic reconstructions, not game capture. Deltas compare the previous submission, not a before/after training experiment.

## Validation

`node --test test.mjs` covers signature tampering/staleness, allowlisted guilds/hosts/file sizes, bounded downloads, exact identity, missing metrics and mode/version-isolated deltas. A local synthetic signed HTTP ping plus invalid-signature/guild checks and a real replay clip are validated separately. No Discord messages were sent during local QA.

Sources: [Discord command attachment options](https://docs.discord.com/developers/docs/interactions/slash-commands), [HTTP interactions](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx), [security requirements](https://github.com/discord/discord-api-docs/blob/main/developers/interactions/receiving-and-responding.mdx).
