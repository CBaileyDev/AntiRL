import {chromium} from '../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'});
try {
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();
 await page.goto('http://127.0.0.1:1445/review/harness/index.html?state=heavy');
 await page.getByText('40 local matches',{exact:false}).waitFor();
 await page.locator('.side-nav').getByRole('button',{name:'Replay Studio'}).click();
 const slider=page.getByRole('slider',{name:'Replay scrub bar'});
 await slider.focus();await slider.press('End');
 const visibleTime=Number(await slider.inputValue());
 await page.locator('summary').filter({hasText:'Counterfactual · trained-policy simulation'}).click();
 const simulationStart=Number(await page.getByRole('spinbutton',{name:'Counterfactual start time',exact:true}).inputValue());
 await page.screenshot({path:'review/screenshots/validation/stale-lab-playhead.png'});
 const result={name:'Lab uses stale time after scrub',visibleTime,simulationStart,confirmed:visibleTime>0&&simulationStart===0};
 await fs.writeFile('review/PLAYHEAD_VALIDATION.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
 if(!result.confirmed)throw new Error('Expected stale start time not reproduced');
}finally{await browser.close();}
