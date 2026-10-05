import {chromium,expect} from '../app/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9236');
const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);
await page.reload({waitUntil:'domcontentloaded'});
await page.waitForTimeout(1000);
if(await page.getByRole('dialog',{name:'Player setup'}).isVisible()){await page.getByRole('button',{name:'Close',exact:true}).click();await page.waitForTimeout(250);await page.reload();await page.waitForTimeout(300);await expect(page.getByRole('dialog',{name:'Player setup'})).toHaveCount(0);}
console.log((await page.getByRole('button').allTextContents()).slice(0,25));
await page.screenshot({path:'docs/validation/native-overview.png'});
const status=await page.evaluate(async()=>({settings:await window.__TAURI_INTERNALS__.invoke('get_settings'),manifest:await window.__TAURI_INTERNALS__.invoke('get_context_manifest',{mode:'2v2'})}));
expect(status.manifest.modes['2v2'].lifetime_count).toBe(1);
await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('rebuild_analytics'));
const rebuilt=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_context_manifest',{mode:'2v2'}));expect(rebuilt.modes['2v2'].lifetime_count).toBe(1);
await page.getByRole('button',{name:/^Replay Library/}).click();
await page.getByRole('button',{name:'Studio',exact:true}).click();
await expect(page.getByLabel('Current boost')).toBeVisible();
await page.waitForTimeout(3000);
await expect(page.getByText('Loading replay stadium…')).toHaveCount(0);
await page.screenshot({path:'docs/validation/native-chase.png'});
console.log('Native Studio ready');
console.log(await page.getByRole('button').allTextContents());
await writeFile('docs/validation/native-results.json',JSON.stringify({status:'PASS',fixture:'synthetic',checks:['packaged assets render','separate QA store','native analytics/rebuild','replay library and Studio'],manifest:rebuilt},null,2));
const samples=[];
const read=()=>page.locator('canvas').evaluate(el=>el.__antirlDiagnostics());
for(const camera of ['Chase','Overhead','Broadcast','Orbit']) {
 await page.getByRole('button',{name:camera,exact:true}).click();await page.waitForTimeout(400);
 const before=await read();await page.waitForTimeout(1600);const after=await read();
 if(camera==='Chase')expect(after.ceilingVisible).toBe(true);if(camera==='Overhead')expect(after.ceilingVisible).toBe(false);
 samples.push({camera,quality:'high',renderedFrames:after.renderedFrames-before.renderedFrames,frameCpuMs:after.frameCpuMs.slice(-(after.renderedFrames-before.renderedFrames)),renderWidth:after.renderWidth,renderHeight:after.renderHeight,targetFps:after.targetFps,ceilingVisible:after.ceilingVisible});
 await page.screenshot({path:`docs/validation/native-${camera.toLowerCase()}.png`});
}
await page.getByRole('button',{name:'Overhead',exact:true}).click();await page.getByRole('checkbox',{name:'Automatic spectator cutaway'}).uncheck();await page.waitForTimeout(200);expect((await read()).ceilingVisible).toBe(true);await page.getByRole('checkbox',{name:'Automatic spectator cutaway'}).check();
for(const quality of ['low','high']){await page.getByLabel('Render quality').selectOption(quality);await page.getByRole('button',{name:'Chase',exact:true}).click();await page.getByRole('button',{name:'Play replay',exact:true}).click();await page.waitForTimeout(400);const before=await read();await page.waitForTimeout(2000);const after=await read();await page.getByRole('button',{name:'Pause replay',exact:true}).click();samples.push({camera:'Chase playback',quality,renderedFrames:after.renderedFrames-before.renderedFrames,frameCpuMs:after.frameCpuMs.slice(-(after.renderedFrames-before.renderedFrames)),frameIntervalsMs:after.frameIntervalsMs.slice(-(after.renderedFrames-before.renderedFrames)),targetFps:after.targetFps,renderWidth:after.renderWidth,renderHeight:after.renderHeight});}
const percentile=(a,p)=>{const s=[...a].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*p))]??null};
await writeFile('docs/validation/native-performance.json',JSON.stringify({fixture:'synthetic two-player six-viewpoint replay',measurement:'render CPU/driver wall time; not GPU timing; throughput over a 2s sample for playback',samples:samples.map(({frameCpuMs,frameIntervalsMs,...s})=>({...s,cpuP50Ms:percentile(frameCpuMs,.5),cpuP95Ms:percentile(frameCpuMs,.95),intervalP95Ms:percentile(frameIntervalsMs||[],.95)}))},null,2));
await page.getByLabel('Perspective Player').selectOption('synthetic:p');
for(const [time,value,name] of [[0,0,'floor'],[10,25,'corner'],[20,50,'goal'],[30,75,'wall'],[40,100,'ceiling'],[50,null,'unknown']]) {
 await page.getByLabel('Replay scrub bar').evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},time);
 await page.waitForTimeout(300);
 const ring=page.getByLabel('Current boost');expect(await ring.getAttribute('aria-valuenow')).toBe(value==null?null:String(value));
 await page.screenshot({path:`docs/validation/native-surface-${name}.png`});
}
await page.getByLabel('Perspective Player').selectOption('synthetic:q');await expect(page.getByLabel('Current boost')).toHaveAttribute('aria-valuenow','80');
await writeFile('docs/validation/native-viewer-state.json',JSON.stringify({status:'PASS',fixture:'synthetic',checks:['exact boost after seeks 0/25/50/75/100/null','player change updates boost to measured 80','floor/corner/goal/wall/ceiling viewpoints captured','camera-aware ceiling toggle','low/high performance samples']},null,2));
await browser.close();
