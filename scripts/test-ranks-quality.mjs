import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import ts from "../app/node_modules/typescript/lib/typescript.js";

async function moduleFrom(path) {
  const source=await readFile(new URL(path,import.meta.url),"utf8");
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const {rankAssetIndex,highestCompetitiveRank}=await moduleFrom('../app/src/rankMath.ts');
const tiers=['Bronze','Silver','Gold','Platinum','Diamond','Champion','Grand Champion'];
for (const [t,tier] of tiers.entries()) for(let n=1;n<=3;n++) {
  assert.equal(rankAssetIndex(`${tier} ${n}`),t*3+n);
  assert.equal(rankAssetIndex(`${tier} ${['I','II','III'][n-1]}`),t*3+n);
}
assert.equal(rankAssetIndex('Supersonic Legend'),22);
for(const value of [null,undefined,'','Unranked','unknown']) assert.equal(rankAssetIndex(value),0);
assert.equal(highestCompetitiveRank(['Gold 3','Silver 2','Platinum I']),'Platinum I');
assert.equal(highestCompetitiveRank(['Grand Champion 1','Champion 3','Diamond 3']),'Grand Champion 1');
assert.equal(highestCompetitiveRank(['Bronze 1','Bronze 3','Bronze 2']),'Bronze 3');
assert.equal(highestCompetitiveRank([null,'',undefined]),'Unranked');
const manifest=JSON.parse(await readFile(new URL('../app/public/ranks/sources.json',import.meta.url),'utf8'));
assert.equal(manifest.assets.length,23);
for(let i=0;i<23;i++) {
  const asset=manifest.assets.find(a=>a.index===i);
  assert.ok(asset,`Missing artwork ${i}`);
  const bytes=await readFile(new URL(`../app/public/ranks/${asset.path}`,import.meta.url));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
}
const {renderScale,playbackFps,measuredRefresh}=await moduleFrom('../app/src/viewerQuality.ts');
for(const dpr of [1,1.25,1.5,2,3]) assert.equal(1/renderScale(dpr),Math.min(1.5,dpr));
for(const hz of [30,60,75,90,100,120,144,165,180,200,240,360]) {
  const fps=playbackFps(hz);
  assert.ok(fps<=90);
  assert.equal(hz/fps,Math.ceil(hz/90));
  const jittered=Array.from({length:48},(_,i)=>1000/hz+(i%3-1)*.05);
  assert.equal(measuredRefresh(jittered),hz);
}
console.log('PASS: all 23 artwork checksums, Arabic/Roman rank mapping, highest playlist rank, high-DPI resolution and refresh-rate budgets.');
