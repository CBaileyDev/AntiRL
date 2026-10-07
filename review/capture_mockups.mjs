import {chromium} from '../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
await fs.mkdir('review/screenshots/mockups',{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),records=[];
for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]){
 const context=await browser.newContext({viewport:{width,height}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();page.on('pageerror',e=>records.push({error:e.message}));
 for(const name of ['match-report','today','replay-studio','coach','progress','onboarding']){
  await page.goto('http://127.0.0.1:1445/review/mockups/'+name+'.html');await page.evaluate(()=>document.fonts.ready);
  const file=`review/screenshots/mockups/${name}-${width}x${height}.png`;await page.screenshot({path:file});
  const measurements=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,mainBounds:document.querySelector('main').getBoundingClientRect().toJSON(),buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width).map(b=>({text:b.textContent.trim(),bounds:b.getBoundingClientRect().toJSON()})),overflowed:[...document.querySelectorAll('h1,h2,h3,p,button')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({text:e.textContent.slice(0,70),overflow:e.scrollWidth-e.clientWidth}))}));
  records.push({name,width,height,file,...measurements});console.log(file);
 }
 await context.close();
}
await browser.close();await fs.writeFile('review/screenshots/mockups/manifest.json',JSON.stringify(records,null,2));console.log(JSON.stringify({screenshots:records.filter(r=>r.file).length,errors:records.filter(r=>r.error),horizontalOverflow:records.filter(r=>r.scrollWidth>r.width),textOverflow:records.filter(r=>r.overflowed.length).map(r=>({name:r.name,width:r.width,overflowed:r.overflowed}))}));
