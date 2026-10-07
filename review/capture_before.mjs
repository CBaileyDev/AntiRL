import { chromium } from '../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const folder='review/screenshots/before';await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const records=[];
const sizes=[[1280,720],[1440,900],[1920,1080]];
const pages=['Overview','Replay Library','Replay Studio','Coach Chat','Progress & Goals','Teammates','Settings'];
for(const [width,height] of sizes){
 const context=await browser.newContext({viewport:{width,height}});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>records.push({type:'pageerror',size:`${width}x${height}`,message:e.message}));
 async function shot(name){const file=`${folder}/${name}-${width}x${height}.png`;await page.screenshot({path:file,fullPage:false});records.push({type:'screenshot',file,url:page.url(),scrollWidth:await page.evaluate(()=>document.documentElement.scrollWidth)});await fs.writeFile(`${folder}/manifest.json`,JSON.stringify(records,null,2));console.log(file);}
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=heavy');await page.waitForTimeout(1000);
 for(const label of pages){await page.locator('.side-nav').getByRole('button',{name:label,exact:false}).click();await page.waitForTimeout(label==='Replay Studio'?5000:700);await shot(label.toLowerCase().replaceAll(/[^a-z]+/g,'-'));}
 await page.locator('.side-nav').getByRole('button',{name:'Replay Library'}).click();
 const del=page.getByRole('button',{name:/Delete replay|Delete .*replay/}).first();
 if(await del.count()){await del.click();await shot('delete-dialog');await page.getByRole('button',{name:'Cancel',exact:true}).click();}
 await page.locator('.side-nav').getByRole('button',{name:'Coach Chat'}).click();await page.getByRole('textbox',{name:'Message the coach'}).fill('What should I fix next?');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.waitForTimeout(700);await shot('coach-streaming');
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=empty');await page.waitForTimeout(600);
 for(const label of pages){await page.locator('.side-nav').getByRole('button',{name:label,exact:false}).click();await page.waitForTimeout(300);await shot('empty-'+label.toLowerCase().replaceAll(/[^a-z]+/g,'-'));}
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=new');await page.waitForTimeout(500);
 for(let step=1;step<=4;step++){await shot('onboarding-step-'+step);if(step<4)await page.getByRole('button',{name:'Next Step'}).click();}
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=loading');await page.waitForTimeout(300);await shot('startup-loading');
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=error');await page.waitForTimeout(600);await shot('startup-error');
 await context.close();
}
await browser.close();await fs.writeFile('review/screenshots/before/manifest.json',JSON.stringify(records,null,2));console.log(JSON.stringify({screenshots:records.filter(x=>x.type==='screenshot').length,errors:records.filter(x=>x.type==='pageerror')}));
