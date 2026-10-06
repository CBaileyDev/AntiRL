import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../app/node_modules/typescript/lib/typescript.js";

async function moduleFrom(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
}
const { rankAssetIndex, highestCompetitiveRank } = await moduleFrom(
  "../app/src/rankMath.ts",
);
const tiers = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Champion",
  "Grand Champion",
];
for (const [t, tier] of tiers.entries())
  for (let n = 1; n <= 3; n++) {
    assert.equal(rankAssetIndex(`${tier} ${n}`), t * 3 + n);
    assert.equal(
      rankAssetIndex(`${tier} ${["I", "II", "III"][n - 1]}`),
      t * 3 + n,
    );
  }
assert.equal(rankAssetIndex("Supersonic Legend"), 22);
for (const value of [null, undefined, "", "Unranked", "unknown"])
  assert.equal(rankAssetIndex(value), 0);
assert.equal(
  highestCompetitiveRank(["Gold 3", "Silver 2", "Platinum I"]),
  "Platinum I",
);
assert.equal(
  highestCompetitiveRank(["Grand Champion 1", "Champion 3", "Diamond 3"]),
  "Grand Champion 1",
);
assert.equal(
  highestCompetitiveRank(["Bronze 1", "Bronze 3", "Bronze 2"]),
  "Bronze 3",
);
assert.equal(highestCompetitiveRank([null, "", undefined]), "Unranked");
// Artwork is now authored inline SVG; the scraped PNG manifest was removed.
const badge = await readFile(
  new URL("../app/src/components/RankBadge.tsx", import.meta.url),
  "utf8",
);
assert.ok(badge.includes("<svg") && badge.includes('role="img"'));
assert.ok(!badge.includes("/ranks/") && !badge.includes(".png"));
const { renderScale, playbackFps, measuredRefresh } = await moduleFrom(
  "../app/src/viewerQuality.ts",
);
for (const dpr of [1, 1.25, 1.5, 2, 3])
  assert.equal(1 / renderScale(dpr), Math.min(1.5, dpr));
for (const hz of [30, 60, 75, 90, 100, 120, 144, 165, 180, 200, 240, 360]) {
  const fps = playbackFps(hz);
  assert.ok(fps <= 90);
  assert.equal(hz / fps, Math.ceil(hz / 90));
  const jittered = Array.from(
    { length: 48 },
    (_, i) => 1000 / hz + ((i % 3) - 1) * 0.05,
  );
  assert.equal(measuredRefresh(jittered), hz);
}
console.log(
  "PASS: authored SVG artwork, Arabic/Roman rank mapping, highest playlist rank, high-DPI resolution and refresh-rate budgets.",
);
