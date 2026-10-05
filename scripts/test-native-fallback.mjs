// Isolated QA store and synthetic evidence only; preserves its provider settings.
import {chromium,expect} from '../app/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.connectOverCDP('http://127.0.0.1:9236');const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(60000);
const settings=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('get_settings'));
try{
 await page.evaluate(s=>window.__TAURI_INTERNALS__.invoke('save_settings',{settings:{...s,provider:'neotoken',chat_model:'glm-5.3-flash',cloud_consent:true}}),settings);
 const chat=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('create_conversation',{mode:'2v2',preset:'Balanced'}));
 await page.reload();await page.getByRole('button',{name:'Coach Chat',exact:true}).click();await page.getByLabel('Conversation',{exact:true}).selectOption(chat.id);
 await page.getByLabel('Message the coach').fill('Summarize only my synthetic observed evidence without invented claims.');await page.getByLabel('Send message').click();
 await expect(page.getByText('Local fallback · cloud request failed',{exact:true})).toBeVisible({timeout:60000});await expect(page.getByText('Offline evidence summary',{exact:false}).first()).toBeVisible();
 const messages=await page.evaluate(id=>window.__TAURI_INTERNALS__.invoke('get_messages',{conversation_id:id}),chat.id);
 expect(messages.at(-1).body.status).toBe('offline_fallback');expect(messages.at(-1).body.source).toBe('offline');expect(messages.at(-1).body.error).toContain('504');
 await page.reload();await page.getByRole('button',{name:'Coach Chat',exact:true}).click();await page.getByLabel('Conversation',{exact:true}).selectOption(chat.id);await expect(page.getByText('Local fallback · cloud request failed',{exact:true})).toBeVisible();
 await page.screenshot({path:'docs/validation/native-fallback.png'});
 await writeFile('docs/validation/native-fallback.json',JSON.stringify({status:'PASS',fixture:'synthetic',provider:'neotoken',model:'glm-5.3-flash',observed_provider_failure:'HTTP 504',checks:['actual provider failure gives local evidence summary','fallback explicitly labelled and persisted','reload preserves fallback status','provider selection unchanged']},null,2));
}finally{await page.evaluate(settings=>window.__TAURI_INTERNALS__.invoke('save_settings',{settings}),settings);await browser.close();}
