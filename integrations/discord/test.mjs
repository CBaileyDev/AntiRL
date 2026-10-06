import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  verifyRequest,
  attachmentFor,
  boundedDownload,
  makeCard,
  historyKey,
} from "./core.mjs";
test("Discord signatures reject modified, stale and unsigned requests", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const key = publicKey
      .export({ format: "der", type: "spki" })
      .subarray(-32)
      .toString("hex"),
    body = Buffer.from("{}"),
    timestamp = String(Math.floor(Date.now() / 1000)),
    signature = sign(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      privateKey,
    ).toString("hex");
  assert(verifyRequest(key, signature, timestamp, body));
  assert(!verifyRequest(key, signature, timestamp, Buffer.from('{"x":1}')));
  assert(!verifyRequest(key, signature, timestamp, body, Date.now() + 600000));
  assert(!verifyRequest(key, "", timestamp, body));
});
const interaction = {
  type: 2,
  guild_id: "g",
  data: {
    name: "coach",
    options: [
      { name: "replay", value: "a" },
      { name: "player", value: "steam:123" },
    ],
    resolved: {
      attachments: {
        a: {
          filename: "game.replay",
          size: 4,
          url: "https://cdn.discordapp.com/attachments/g/a/game.replay",
        },
      },
    },
  },
};
test("Attachments require enabled guild, bounded replay and Discord host", () => {
  assert.equal(attachmentFor(interaction, new Set(["g"])).player, "steam:123");
  assert.throws(() => attachmentFor(interaction, new Set()));
  const evil = structuredClone(interaction);
  evil.data.resolved.attachments.a.url = "https://evil.example/file.replay";
  assert.throws(() => attachmentFor(evil, new Set(["g"])));
  evil.data.resolved.attachments.a.url =
    "https://cdn.discordapp.com/attachments/g/a/game.replay";
  evil.data.resolved.attachments.a.size = 70 * 1024 * 1024;
  assert.throws(() => attachmentFor(evil, new Set(["g"])));
});
test("Download rejects truncated and oversized bodies", async () => {
  assert.deepEqual(
    await boundedDownload("x", 4, async () => new Response("test")),
    Buffer.from("test"),
  );
  await assert.rejects(
    boundedDownload("x", 5, async () => new Response("test")),
  );
  await assert.rejects(
    boundedDownload("x", 2, async () => new Response("test")),
  );
});
test("Missing metrics are unknown and deltas require exact cohort and metric version", () => {
  const a = {
    players: [{ id: "steam:123", name: "P", team: 0 }],
    summary: { mode: "2v2", file_hash: "a", id: "a" },
    metrics: [
      {
        player_id: "steam:123",
        key: "avg_boost",
        label: "Boost",
        value: null,
        metric_version: "v2",
        unit: "%",
      },
    ],
    events: [],
  };
  assert.equal(makeCard(a, "steam:123").embed.fields[0].value, "Unknown");
  assert.throws(() => makeCard(a, "other"));
  a.metrics[0].value = 0;
  const previous = {
    player_id: "steam:123",
    summary: { mode: "2v2", file_hash: "b" },
    metrics: [{ key: "avg_boost", value: 10, metric_version: "v2" }],
  };
  assert.match(
    makeCard(a, "steam:123", previous).embed.fields[0].value,
    /Δ -10.0/,
  );
  previous.summary.mode = "1v1";
  assert.match(
    makeCard(a, "steam:123", previous).embed.fields[0].value,
    /Δ Unknown/,
  );
  assert.notEqual(
    historyKey("g", "u", "p", "2v2"),
    historyKey("g", "other", "p", "2v2"),
  );
});
