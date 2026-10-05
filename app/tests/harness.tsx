// Synthetic interaction fixture; never loads user files or calls an AI provider.
import React,{useState} from "react";
import {createRoot} from "react-dom/client";
import {mockIPC} from "@tauri-apps/api/mocks";
import Coach,{type ChatMsg} from "../src/pages/Coach";
import BoostRing from "../src/components/BoostRing";
import Onboarding from "../src/components/OnboardingModal";
import "../src/styles.css";
const table="| Measure | Value |\n| --- | --- |\n| boost active | 6 seconds |\n\n[Source](https://www.rocketleague.com) [unsafe](javascript:alert(1)) <script>alert(1)</script>";
let sequence=0;
let conversations=[{id:"qa",title:"Synthetic reading fixture",mode:"2v2",preset:"Balanced",prompt_version:"coach-2",updated_at:"2026-01-01"}];
mockIPC((cmd,args:any)=>{
 if(cmd==="get_context_manifest")return {modes:{"2v2":{recent_count:12,lifetime_count:48,unknown_date_count:1}},excluded:{player_absent:4}};
 if(cmd==="create_conversation"){const c={id:`qa-${++sequence}`,title:"New chat",mode:args.mode,preset:args.preset,prompt_version:"coach-2",updated_at:"2026-01-01"};conversations.push(c);return c;}
 if(cmd==="get_messages")return [{id:"restored",body:{role:"assistant",content:`Saved ${args.conversation_id}`,timestamp:"2026-01-01"}}];
 if(cmd==="export_conversation"){(window as any).exported=args;return true;}
 return [];
});
const settings:any={player_id:"synthetic:p",player_name:"Synthetic player",provider:"neotoken",chat_model:"synthetic",cloud_consent:false,focus:[],modes:["1v1","2v2","3v3"]};
function Harness(){
 const [messages,setMessages]=useState<ChatMsg[]>(Array.from({length:50},(_,i)=>({id:`old-${i}`,role:i%2?"user":"assistant",content:`Reading anchor ${i}. This is synthetic preserved text.\n\n${table}`})));
 const [id,setId]=useState<string|null>("qa");const [loading,setLoading]=useState(false);const [convs,setConvs]=useState(conversations.slice());const [onboard,setOnboard]=useState(false);
 const [boost,setBoost]=useState<number|null>(50);
 return <><div style={{display:"flex",gap:8}}>{[0,25,50,75,100,null].map(v=><button key={String(v)} onClick={()=>setBoost(v)}>{v==null?"Unknown":v}</button>)}<BoostRing value={boost}/><button onClick={()=>setOnboard(true)}>Onboarding</button></div>
 <Coach messages={messages} setMessages={setMessages} selectedConvId={id} setSelectedConvId={setId} loading={loading} setLoading={setLoading} settings={settings} replays={[]} conversations={convs} onRefreshConversations={()=>setConvs(conversations.slice())} onSelectReplayStudio={()=>{}} onCancelAi={async()=>{(window as any).cancelled=true;}} onSendMessage={async(message,replay,conv,onUpdate)=>{
 (window as any).cancelled=false;let text="";for(let i=0;i<120;i++){await new Promise(r=>setTimeout(r,30));text+=`\nStreamed synthetic line ${i}. `;onUpdate?.(text);if((window as any).cancelled)return {response:text,conversation_id:conv!,status:"cancelled"};}return {response:text,conversation_id:conv!,status:"complete"};}}/>
 {onboard&&<Onboarding initialSettings={settings} onClose={()=>setOnboard(false)} onSave={async(profile)=>{(window as any).savedProfile=profile;}}/>}</>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
