import {chromium} from '../app/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:900}}),out=[];
await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
for(const name of ['match-report','today','replay-studio','coach','progress','onboarding']){
 await page.goto('http://127.0.0.1:1445/review/mockups/'+name+'.html');
 const controls=page.locator('button,a.button');const results=[];
 for(let i=0;i<await controls.count();i++){
  const control=controls.nth(i);
  for(const state of ['default','hover','focus']){
   if(state==='hover')await control.hover();if(state==='focus')await control.focus();
   const result=await control.evaluate((el,state)=>{
    function rgba(str){const n=str.match(/[\d.]+/g)?.map(Number)||[0,0,0,0];return [n[0],n[1],n[2],n[3]??1]}
    function composite(a,b){return [0,1,2].map(i=>a[i]*a[3]+b[i]*(1-a[3])).concat(1)}
    function luminance(a){return a.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0)}
    const ancestors=[];let node=el;while(node){ancestors.push(node);node=node.parentElement;}
    let background=[8,10,15,1];for(const n of ancestors.reverse())background=composite(rgba(getComputedStyle(n).backgroundColor),background);
    const c=getComputedStyle(el),fg=composite(rgba(c.color),background),lf=luminance(fg),lb=luminance(background);const ratio=(Math.max(lf,lb)+.05)/(Math.min(lf,lb)+.05);
    const threshold=parseFloat(c.fontSize)>=24||(Number(c.fontWeight)>=700&&parseFloat(c.fontSize)>=18.66)?3:4.5;
    return {state,text:el.textContent.trim(),classes:el.className,color:c.color,background,ratio,threshold,pass:ratio>=threshold,fontSize:c.fontSize,fontWeight:c.fontWeight,focusOutline:state==='focus'?c.outline:null};
   },state);results.push(result);
   await page.mouse.move(1,1);
  }
 }
 const sem=await page.evaluate(()=>({nestedInteractive:document.querySelectorAll('a button,button button').length,inlineStyles:document.querySelectorAll('[style]').length,composerBounds:document.querySelector('textarea')?.getBoundingClientRect().toJSON()}));
 out.push({name,...sem,results});
}
await browser.close();await fs.writeFile('review/MOCKUP_CONTROL_QA.json',JSON.stringify(out,null,2));
const failed=out.flatMap(p=>p.results.filter(r=>!r.pass).map(r=>({page:p.name,...r})));console.log(JSON.stringify({controlStateChecks:out.reduce((n,p)=>n+p.results.length,0),failed,nestedInteractive:out.map(p=>({page:p.name,count:p.nestedInteractive})),notes:'Foreground/background composed from computed colors; opaque control backgrounds and flat ancestors checked. Not a full text/gradient AA audit. Prototype styles are self-contained and not production implementation.'},null,2));if(failed.length)process.exitCode=1;
