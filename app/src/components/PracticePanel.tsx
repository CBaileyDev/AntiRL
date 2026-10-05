import React,{useEffect,useState} from "react";
import {invoke} from "@tauri-apps/api/core";

export default function PracticePanel({mode,playerId}:{mode:string;playerId?:string|null}) {
 const [data,setData]=useState<any>({plans:[],sessions:[]});const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);
 const [body,setBody]=useState({title:"",drill:"",success_criterion:"",next_match_cue:"",intended_minutes:""});
 const [minutes,setMinutes]=useState<Record<string,string>>({});const [difficulty,setDifficulty]=useState<Record<string,string>>({});
 const load=async()=>{if(playerId)setData(await invoke("get_practice",{mode}));};
 useEffect(()=>{let alive=true;setData({plans:[],sessions:[]});setNotice("");if(playerId)invoke("get_practice",{mode}).then(d=>{if(alive)setData(d)}).catch(e=>{if(alive)setNotice(String(e))});return()=>{alive=false};},[mode,playerId]);
 const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);try{await fn();await load();setNotice("Saved locally");}catch(e){setNotice(String(e));}finally{setBusy(false)}};
 return <section className="card practice-panel"><h3>Practice & reassessment · {mode}</h3>
  <p>Save one drill and a cue to review in later matches. Completion and difficulty are self-reported; they do not predict a promotion date.</p>
  {!playerId?<p>Confirm your account in Settings to keep a personal practice history.</p>:<>
   <details><summary>Add a practice plan</summary><form onSubmit={e=>{e.preventDefault();run(async()=>{await invoke("save_practice_plan",{mode,body:{...body,intended_minutes:body.intended_minutes===""?null:Number(body.intended_minutes)}});setBody({title:"",drill:"",success_criterion:"",next_match_cue:"",intended_minutes:""});});}}>
    {([['title','Practice priority'],['drill','Drill setup'],['success_criterion','Success criterion'],['next_match_cue','Next-match cue']] as const).map(([key,label])=><label key={key}>{label}<textarea aria-label={label} required maxLength={2000} value={body[key]} onChange={e=>setBody({...body,[key]:e.target.value})}/></label>)}
    <label>Planned minutes (optional)<input aria-label="Planned minutes" type="number" min="1" max="240" value={body.intended_minutes} onChange={e=>setBody({...body,intended_minutes:e.target.value})}/></label><button className="btn primary" disabled={busy}>Save practice plan</button>
   </form></details>
   {!data.plans.length&&<p>No saved plans yet. Choose a priority from a coaching response or add your own.</p>}
   {data.plans.map((p:any)=><article key={p.id} className="practice-plan"><h4>{p.body.title}</h4><p>{p.body.drill}</p><p><b>Success:</b> {p.body.success_criterion}</p><p><b>In your next match:</b> {p.body.next_match_cue}</p><small>{p.body.intended_minutes!=null?`${p.body.intended_minutes} planned minutes · `:""}User-authored plan</small>
    <form onSubmit={e=>{e.preventDefault();run(()=>invoke("record_training",{mode,plan_id:p.id,minutes:Number(minutes[p.id]),difficulty:difficulty[p.id]||"appropriate",notes:""}));}}>
     <label>Completed minutes<input aria-label={`Completed minutes for ${p.body.title}`} required type="number" min="1" max="240" value={minutes[p.id]||""} onChange={e=>setMinutes({...minutes,[p.id]:e.target.value})}/></label>
     <label>Difficulty<select aria-label={`Difficulty for ${p.body.title}`} value={difficulty[p.id]||"appropriate"} onChange={e=>setDifficulty({...difficulty,[p.id]:e.target.value})}><option value="easy">Easy</option><option value="appropriate">Appropriate</option><option value="hard">Hard</option></select></label>
     <button className="btn secondary" disabled={busy}>Record practice</button><button type="button" className="btn secondary" disabled={busy} onClick={()=>run(()=>invoke("archive_practice",{mode,id:p.id}))}>Archive plan</button>
    </form>
   </article>)}
   {data.sessions.length>0&&<details><summary>Recent practice · {data.sessions.length} recorded sessions</summary><ul>{data.sessions.map((s:any,i:number)=><li key={i}>{new Date(s.completed_at).toLocaleDateString()} · {s.body.completed_minutes} minutes · {s.body.difficulty} · self-reported</li>)}</ul></details>}
  </>}
  {notice&&<p role="status">{notice}</p>}
 </section>;
}
