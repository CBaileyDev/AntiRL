import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "../app/node_modules/typescript/lib/typescript.js";
const source = await readFile(
  new URL("../app/src/replayMath.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { frameIndex, chasePose, damping, perspectiveEvents, scoreAt } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
const frames = [{ time: 10 }, { time: 10.1 }, { time: 10.4 }];
assert.equal(frameIndex([], 0), -1);
for (const [time, index] of [
  [0, 0],
  [10, 0],
  [10.099, 0],
  [10.1, 1],
  [10.3, 1],
  [10.4, 2],
  [99, 2],
])
  assert.equal(frameIndex(frames, time), index);
let pose = chasePose({ x: 0, y: 0.17, z: 0 }, { x: 1, y: 0, z: 0 });
assert.equal(pose.eye.x, -2.7);
assert.equal(pose.eye.y, 1.17);
assert.ok(pose.target.y < pose.eye.y, "-3 degrees looks downward");
pose = chasePose(
  { x: 0, y: 0.17, z: 0 },
  { x: 1, y: 0, z: 0 },
  { x: 0, y: 2, z: 10 },
);
assert.equal(pose.eye.z, -2.7);
assert.equal(pose.target.z, 10);
pose = chasePose({ x: 0, y: 8, z: 0 }, { x: 0, y: 1, z: 0 });
assert.equal(
  Math.hypot(pose.eye.x, pose.eye.z),
  2.7,
  "vertical nose does not collapse the camera into the car",
);
assert.equal(
  chasePose({ x: 0, y: 0, z: 57 }, { x: 0, y: 0, z: -1 }).eye.z,
  58.8,
);
assert.equal(
  chasePose({ x: 20, y: 0, z: 51 }, { x: 0, y: 0, z: -1 }).eye.z,
  50.7,
);
const settle = (fps) => {
  let value = 0;
  for (let i = 0; i < fps; i++) value += (1 - value) * damping(12, 1 / fps);
  return value;
};
assert.ok(
  Math.abs(settle(30) - settle(144)) < 1e-12,
  "same response at different frame rates",
);
const events = [
  { id: "own", player_id: "p", category: "boost" },
  { id: "other", player_id: "q", category: "boost" },
  { id: "team", team: 0, category: "rotation" },
  { id: "enemy", team: 1, category: "rotation" },
  { id: "goal", team: 1, player_id: "q", category: "goal", time: 20 },
];
assert.deepEqual(
  perspectiveEvents(events, { id: "p", team: 0 }).map((e) => e.id),
  ["own", "team", "goal"],
);
assert.deepEqual(scoreAt(events, [2, 3], 19), [2, 2]);
assert.deepEqual(scoreAt(events, [2, 3], 20), [2, 3]);
assert.deepEqual(scoreAt(events, [null, 3], 0), [null, 2]);
for (const name of ["ball", "octane", "wheel", "stadium"]) {
  const bytes = await readFile(
    new URL(`../app/public/viewer/${name}.mesh`, import.meta.url),
  );
  const [vertices, indices, uvs] = [0, 4, 8].map((offset) =>
    bytes.readUInt32LE(offset),
  );
  assert.equal(
    bytes.length,
    16 + vertices * 12 + indices * 4 + uvs * 4 + indices / 3,
  );
  for (let i = 0; i < indices; i++)
    assert.ok(bytes.readUInt32LE(16 + vertices * 12 + i * 4) < vertices);
}
console.log(
  "Replay Studio regression checks passed: frame lookup, pro camera scale, ball tracking, goal bounds, damping, perspective evidence, live score, asset integrity.",
);
