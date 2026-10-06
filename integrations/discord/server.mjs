import { createServer } from "node:http";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  rename,
  readdir,
} from "node:fs/promises";
import { resolve, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  verifyRequest,
  attachmentFor,
  boundedDownload,
  historyKey,
  makeCard,
} from "./core.mjs";
import { renderClip } from "./render.mjs";
const app = process.env.DISCORD_APPLICATION_ID,
  key = process.env.DISCORD_PUBLIC_KEY,
  allowed = new Set(
    (process.env.DISCORD_ALLOWED_GUILDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
const exe = process.env.ANTIRL_REPLAY_EXE,
  data = resolve(
    process.env.ANTIRL_DISCORD_DATA ?? join(tmpdir(), "antirl-discord"),
  );
if (
  !/^\d+$/.test(app ?? "") ||
  !/^[a-f0-9]{64}$/i.test(key ?? "") ||
  !allowed.size ||
  !exe ||
  !isAbsolute(exe) ||
  (await stat(exe)).isFile() !== true
)
  throw new Error(
    "Configure application ID, public key, allowed guilds, and absolute replay worker executable in .env.",
  );
await mkdir(data, { recursive: true });
// Purge only known history files in this exact data folder, never arbitrary trees.
async function purgeHistory() {
  for (const name of await readdir(data)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const file = join(data, name);
    if (Date.now() - (await stat(file)).mtimeMs > 7 * 86400000)
      await rm(file, { force: true });
  }
}
await purgeHistory();
const purgeTimer = setInterval(
  () =>
    void purgeHistory().catch(() => console.error("History cleanup failed.")),
  3600000,
);
purgeTimer.unref();
let active = false;
const seen = new Map();
const json = (res, value, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
};
const send = async (i, payload, clip) => {
  const form = new FormData();
  if (clip) {
    form.append(
      "files[0]",
      new Blob([await readFile(clip)], { type: "video/webm" }),
      "reconstructed-replay.webm",
    );
    payload.attachments = [
      {
        id: 0,
        filename: "reconstructed-replay.webm",
        description:
          "Schematic reconstruction of recorded positions; not game capture",
      },
    ];
  }
  form.append(
    "payload_json",
    JSON.stringify({ ...payload, allowed_mentions: { parse: [] } }),
  );
  const r = await fetch(
    `https://discord.com/api/v10/webhooks/${app}/${i.token}/messages/@original`,
    { method: "PATCH", body: form, signal: AbortSignal.timeout(20000) },
  );
  if (!r.ok) throw new Error(`Discord response failed (${r.status}).`);
};
async function coach(i, request) {
  let dir;
  try {
    dir = await mkdtemp(join(data, "job-"));
    const bytes = await boundedDownload(
      request.attachment.url,
      request.attachment.size,
    );
    const input = join(dir, "input.replay");
    await writeFile(input, bytes);
    const { stdout } = await promisify(execFile)(exe, ["parse", input], {
      timeout: 45000,
      maxBuffer: 128 * 1024 * 1024,
      windowsHide: true,
    });
    const a = JSON.parse(stdout);
    const user = i.member?.user?.id ?? i.user?.id;
    const file = join(
      data,
      historyKey(i.guild_id, user, request.player, a.summary.mode) + ".json",
    );
    let previous;
    try {
      const p = JSON.parse(await readFile(file, "utf8"));
      if (Date.now() - Date.parse(p.saved_at) < 7 * 86400000) previous = p;
    } catch {}
    const card = makeCard(a, request.player, previous);
    const clip = await renderClip(a, card.event, dir, request.player);
    await send(
      i,
      {
        embeds: [card.embed],
        content: clip
          ? "Schematic clip of recorded positions."
          : "Clip unavailable: insufficient recorded positions.",
      },
      clip,
    );
    await writeFile(`${file}.tmp`, JSON.stringify(card.snapshot));
    await rename(`${file}.tmp`, file);
  } catch (e) {
    const message = e.killed
      ? "Replay decoding exceeded the time budget."
      : e.code
        ? "Replay processing failed. Check the worker, browser install, and replay format."
        : String(e.message).slice(0, 300);
    try {
      await send(i, { content: message });
    } catch {
      console.error("Unable to deliver the coaching result.");
    }
  } finally {
    if (
      dir &&
      (resolve(dir).startsWith(data + "\\") ||
        resolve(dir).startsWith(data + "/"))
    )
      await rm(dir, { recursive: true, force: true }).catch(() =>
        console.error("Temporary replay cleanup failed."),
      );
    active = false;
  }
}
async function handle(req, res) {
  if (req.method !== "POST" || req.url !== "/interactions") {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 256 * 1024) {
      res.writeHead(413);
      res.end();
      return;
    }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  if (
    !verifyRequest(
      key,
      req.headers["x-signature-ed25519"],
      req.headers["x-signature-timestamp"],
      body,
    )
  ) {
    res.writeHead(401);
    res.end();
    return;
  }
  let i;
  try {
    i = JSON.parse(body);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (i.application_id !== app) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (i.type === 1) {
    json(res, { type: 1 });
    return;
  }
  try {
    const request = attachmentFor(i, allowed);
    const now = Date.now();
    for (const [id, at] of seen) if (now - at > 300000) seen.delete(id);
    if (seen.has(i.id))
      throw new Error("This interaction was already handled.");
    if (active)
      throw new Error("AntiRL is reviewing another replay. Try again shortly.");
    seen.set(i.id, now);
    active = true;
    json(res, { type: 5, data: { flags: 64 } });
    void coach(i, request);
  } catch (e) {
    json(res, {
      type: 4,
      data: { content: e.message, flags: 64, allowed_mentions: { parse: [] } },
    });
  }
}
const server = createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(400);
      res.end();
    }
  });
});
server.requestTimeout = 10000;
server.listen(Number(process.env.PORT ?? 49201), "127.0.0.1", () =>
  console.log(
    "AntiRL signed interactions listening on localhost. No replay data goes to an LLM.",
  ),
);
