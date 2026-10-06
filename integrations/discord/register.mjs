const app = process.env.DISCORD_APPLICATION_ID,
  token = process.env.DISCORD_BOT_TOKEN,
  guilds = (process.env.DISCORD_ALLOWED_GUILDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
if (
  !/^\d+$/.test(app ?? "") ||
  !token ||
  !guilds.length ||
  guilds.some((g) => !/^\d+$/.test(g))
)
  throw new Error(
    "Configure application ID, bot token, and allowed guild IDs.",
  );
const command = {
  name: "coach",
  description:
    "Review a Rocket League replay with recorded evidence and a schematic clip",
  options: [
    {
      name: "replay",
      description: "A .replay file (up to 64 MiB)",
      type: 11,
      required: true,
    },
    {
      name: "player",
      description:
        "Exact player ID from AntiRL (steam:… / epic:…); no identity guessing",
      type: 3,
      required: true,
    },
  ],
};
for (const guild of guilds) {
  const r = await fetch(
    `https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`,
    {
      method: "POST",
      headers: {
        authorization: `Bot ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!r.ok) throw new Error(`Command registration failed (${r.status}).`);
  console.log(`Registered /coach in guild ${guild}.`);
}
