import { createPublicKey, verify, createHash } from "node:crypto";
export const MAX_REPLAY = 64 * 1024 * 1024;
export function verifyRequest(
  key,
  signature,
  timestamp,
  body,
  now = Date.now(),
) {
  if (
    !/^[a-f0-9]{64}$/i.test(key ?? "") ||
    !/^[a-f0-9]{128}$/i.test(signature ?? "") ||
    !/^\d{10}$/.test(timestamp ?? "") ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    return verify(
      null,
      Buffer.concat([Buffer.from(timestamp), body]),
      createPublicKey({
        key: Buffer.concat([
          Buffer.from("302a300506032b6570032100", "hex"),
          Buffer.from(key, "hex"),
        ]),
        format: "der",
        type: "spki",
      }),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}
export function attachmentFor(interaction, allowed) {
  if (!allowed.has(interaction.guild_id))
    throw new Error("This server is not enabled for AntiRL.");
  if (interaction.type !== 2 || interaction.data?.name !== "coach")
    throw new Error("Unsupported command.");
  const options = Object.fromEntries(
    (interaction.data.options ?? []).map((o) => [o.name, o.value]),
  );
  const attachment = interaction.data.resolved?.attachments?.[options.replay];
  if (
    !attachment ||
    typeof attachment.filename !== "string" ||
    !attachment.filename.toLowerCase().endsWith(".replay") ||
    !Number.isSafeInteger(attachment.size) ||
    attachment.size < 1 ||
    attachment.size > MAX_REPLAY
  )
    throw new Error("Attach one .replay file up to 64 MiB.");
  const url = new URL(attachment.url);
  if (
    url.protocol !== "https:" ||
    !["cdn.discordapp.com", "media.discordapp.net"].includes(url.hostname) ||
    !url.pathname.startsWith("/attachments/") ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error("Only Discord-hosted replay attachments are accepted.");
  const player = options.player;
  if (
    typeof player !== "string" ||
    player.length > 200 ||
    !/^(steam|epic|psn|xbox|switch|psynet|qq|local):[^\s]+$/i.test(player)
  )
    throw new Error(
      "Choose an exact replay player ID, e.g. steam:765… or epic:…; AntiRL never guesses who you are.",
    );
  return { attachment, player };
}
export async function boundedDownload(url, expected, fetcher = fetch) {
  const r = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok || !r.body) throw new Error("Replay download failed.");
  const chunks = [];
  let size = 0;
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > MAX_REPLAY || size > expected) {
      await r.body.cancel().catch(() => {});
      throw new Error("Replay exceeds declared size.");
    }
    chunks.push(Buffer.from(chunk));
  }
  if (size !== expected) throw new Error("Replay download was truncated.");
  return Buffer.concat(chunks);
}
export function historyKey(guild, user, player, mode) {
  return createHash("sha256")
    .update(JSON.stringify([guild, user, player, mode]))
    .digest("hex");
}
export function makeCard(a, playerId, previous) {
  const player = a.players.find((p) => p.id === playerId);
  if (!player)
    throw new Error(
      "That exact player ID is not in the replay. Open its participants in AntiRL first.",
    );
  const metrics = a.metrics.filter(
    (m) =>
      m.player_id === playerId &&
      [
        "avg_boost",
        "low_boost_pct",
        "avg_speed",
        "boost_active_at_supersonic_speed_s",
      ].includes(m.key),
  );
  const same =
    previous?.summary?.mode === a.summary.mode &&
    previous.player_id === playerId &&
    previous.summary.file_hash !== a.summary.file_hash;
  const fields = metrics.map((m) => {
    const old = same
      ? previous.metrics.find((x) => x.key === m.key)
      : undefined;
    const current = Number.isFinite(m.value) ? m.value : null;
    const valid =
      current !== null &&
      Number.isFinite(old?.value) &&
      m.metric_version &&
      m.metric_version === old.metric_version;
    return {
      name: m.label,
      value:
        current === null
          ? "Unknown"
          : `${current.toFixed(1)} ${m.unit}${valid ? ` · Δ ${(current - old.value).toFixed(1)} vs previous submission` : " · Δ Unknown"}`,
      inline: true,
    };
  });
  const events = a.events
    .filter(
      (e) =>
        (e.player_id === playerId &&
          ["critical", "review"].includes(e.severity)) ||
        (e.category === "goal" &&
          Number.isInteger(e.team) &&
          e.team !== player.team),
    )
    .sort((x, y) => x.time - y.time);
  const event = events[0];
  if (event)
    fields.push({
      name: "Review candidate",
      value: `${String(event.title).slice(0, 200)} at ${event.time.toFixed(1)}s · ${event.id}\nWatch the lead-in and check cover/recovery options. This marker does not establish blame.`,
      inline: false,
    });
  const snapshot = {
    player_id: playerId,
    summary: {
      id: a.summary.id,
      file_hash: a.summary.file_hash,
      mode: a.summary.mode,
    },
    metrics: metrics.map((m) => ({
      key: m.key,
      value: m.value,
      metric_version: m.metric_version,
    })),
    saved_at: new Date().toISOString(),
  };
  return {
    embed: {
      title: `${player.name} · ${a.summary.mode}`.slice(0, 200),
      description:
        "Recorded replay evidence. Deltas compare your last /coach submission for this exact player and mode, not population benchmarks or practice causation.",
      fields,
      footer: {
        text: "AntiRL · reconstructed replay clip · no rank prediction or bot-confidence estimate",
      },
    },
    event,
    snapshot,
  };
}
