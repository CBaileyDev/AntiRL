import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { generateKeyPairSync, sign } from "node:crypto";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderClip } from "../../integrations/discord/render.mjs";
import { makeCard } from "../../integrations/discord/core.mjs";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = publicKey
  .export({ type: "spki", format: "der" })
  .subarray(-32)
  .toString("hex");
const worker = resolve("target/release/antirl-replay.exe");
const child = spawn(process.execPath, ["integrations/discord/server.mjs"], {
  windowsHide: true,
  env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
    DISCORD_APPLICATION_ID: "123456789",
    DISCORD_PUBLIC_KEY: key,
    DISCORD_ALLOWED_GUILDS: "987654321",
    ANTIRL_REPLAY_EXE: worker,
    ANTIRL_DISCORD_DATA: resolve("review/manual-data/discord-http-qa"),
    PORT: "49203",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let error = "";
child.stderr.on("data", (b) => (error += b));
try {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch("http://127.0.0.1:49203/");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const send = async (body, valid = true) => {
    body = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(
      null,
      Buffer.from(timestamp + body),
      privateKey,
    ).toString("hex");
    return fetch("http://127.0.0.1:49203/interactions", {
      method: "POST",
      headers: {
        "x-signature-timestamp": timestamp,
        "x-signature-ed25519": valid ? signature : "0".repeat(128),
      },
      body,
    });
  };
  let r = await send({ application_id: "123456789", type: 1 });
  if (r.status !== 200 || (await r.json()).type !== 1)
    throw new Error("Signed PING failed");
  r = await send({ application_id: "123456789", type: 1 }, false);
  if (r.status !== 401) throw new Error("Bad signature accepted");
  r = await send({ application_id: "wrong", type: 1 });
  if (r.status !== 403) throw new Error("Wrong app accepted");
  r = await send({
    application_id: "123456789",
    type: 2,
    guild_id: "other",
    data: { name: "coach" },
  });
  const response = await r.json();
  if (response.type !== 4 || !response.data.content.includes("not enabled"))
    throw new Error("Guild allowlist failed");
  r = await fetch("http://127.0.0.1:49203/interactions", {
    method: "POST",
    body: "x".repeat(300000),
  });
  if (r.status !== 413) throw new Error("Request body limit failed");
  await writeFile(
    "review/manual-output/discord-http.json",
    JSON.stringify(
      {
        status: "PASS",
        checks: [
          "real localhost signed ping",
          "invalid signatures rejected",
          "application ID enforced",
          "guild allowlist enforced",
          "request body budget enforced",
        ],
        live_messages_sent: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: local signed Discord HTTP boundary; no Discord messages sent",
  );
  if (process.argv[2]) {
    const { stdout } = await promisify(execFile)(
      worker,
      ["parse", resolve(process.argv[2])],
      { maxBuffer: 128 * 1024 * 1024, timeout: 45000 },
    );
    const a = JSON.parse(stdout);
    const p = a.players[0];
    const card = makeCard(a, p.id);
    await mkdir("review/manual-data/discord-clip-qa", { recursive: true });
    const clip = await renderClip(
      a,
      card.event,
      "review/manual-data/discord-clip-qa",
      p.id,
    );
    if (!clip) throw new Error("No clip frames available");
    const bytes = await readFile(clip);
    if (bytes.subarray(0, 4).toString("hex") !== "1a45dfa3")
      throw new Error("Clip is not WebM");
    await writeFile(
      "review/manual-output/discord-clip.json",
      JSON.stringify(
        {
          status: "PASS",
          source: "one real local replay; no upload",
          clip_bytes: bytes.length,
          recorded_frames: a.frames.length,
          player_count: a.players.length,
          card_fields: card.embed.fields.length,
          artifact:
            "schematic WebM from recorded positions; selected player highlighted; not game capture",
          live_delivery: "NOT RUN",
        },
        null,
        2,
      ),
    );
    console.log(
      "PASS: replay parse, evidence card, and WebM schematic clip",
      bytes.length,
    );
  }
} finally {
  child.kill();
  if (error) console.error(error.slice(0, 200));
}
