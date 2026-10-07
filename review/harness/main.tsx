import React from 'react';
import { createRoot } from 'react-dom/client';
import { mockIPC, mockWindows } from '../../app/node_modules/@tauri-apps/api/mocks.js';
import { emit } from '../../app/node_modules/@tauri-apps/api/event.js';
import App from '../../app/src/App';
import '../../app/src/styles.css';
import '../../app/node_modules/@fontsource/inter/400.css';
import '../../app/node_modules/@fontsource/inter/500.css';
import '../../app/node_modules/@fontsource/inter/600.css';
import '../../app/node_modules/@fontsource/inter/700.css';

const params=new URLSearchParams(location.search), state=params.get('state')||'heavy';
const empty=['new','empty'].includes(state), modes=['1v1','2v2','3v3'];
let settings:any={replay_folder:'C:\\ReviewFixtures',player_id:empty?null:'review:you',player_name:empty?null:'Nova',modes,focus:['boost','defense'],provider:'none',chat_model:'review-stub',analysis_model:'review-stub',auto_import:false,cloud_consent:false,rank_1v1:'Platinum I',rank_2v2:'Diamond II',rank_3v3:'Diamond II',primary_mode:'1v1',onboarding_status:state==='new'?null:'completed',mode_profiles:{'1v1':{current_rank:'Platinum I',target_rank:'Champion I',practice_hours:3}}};
const all=Array.from({length:40},(_,i)=>{
 const mode=modes[i%3],count=(i%3+1)*2;
 const players=Array.from({length:count},(_,p)=>({id:p===0?'review:you':`review:p${p}`,name:p===0?'Nova':['','Orbit','Kite','Atlas','Aster','Flux'][p],team:p<count/2?0:1,platform:'Steam',is_bot:false,camera:null}));
 return {id:`review-match-${i}`,file_hash:'f'.repeat(64),content_hash:'a'.repeat(64),file_name:`ranked-${i}.replay`,replay_name:`Ranked ${mode} · ${i===0?'Overtime finish':'Evening session'}`,played_at:new Date(Date.UTC(2026,9,6,23,30)-i*900000).toISOString(),mode,duration_seconds:317+(i%5)*13,blue_score:i%3===0?2:3,orange_score:i%3===0?3:1,players,status:'ready',error:null,source_path:'review-owned fixture',match_type:'ranked',playlist_id:[10,11,13][i%3],recorder_name:'Nova',recorder_player_id:'review:you',map_name:i%2?'Mannfield':'DFH Stadium'};
});
let replays=empty?[]:all;
const full=(id:string)=>{
 const summary=all.find(x=>x.id===id)||all[0];
 const frames=Array.from({length:4801},(_,f)=>{const t=f/15;return {time:t,ball:{position:[Math.sin(t*.8)*2200,Math.cos(t*.45)*3200,120+Math.abs(Math.sin(t*.5))*460],rotation:[0,0,0,1],velocity:[900,200,0],angular_velocity:[0,0,.4]},cars:summary.players.map((p,i)=>({player_id:p.id,position:[Math.sin(t*.4+i)*2600,Math.cos(t*.35+i)*3500,17],rotation:[0,0,Math.sin(t*.1),Math.cos(t*.1)],velocity:[1200,300,0],angular_velocity:[0,0,.2],boost:40+(i*10+f/15)%55,boost_active:f%30<4,steer:128,throttle:255,handbrake:false,discontinuity:false})),match_clock_seconds:Math.max(0,300-t),live_play:true,discontinuity:false,overtime:t>300}});
 const metrics=summary.players.flatMap((p,i)=>[['avg_boost','Average boost',42.6+i*3,'%'],['avg_speed','Average speed',1480+i*70,'uu/s'],['low_boost_pct','Low boost',24.6+i*2,'%'],['defensive_half_pct','Defensive half',54.2-i*3,'%'],['boost_active_at_supersonic_speed_s','Boost active at speed',12.4+i,'s'],['time_at_supersonic_speed_s','Time at speed',27.4+i,'s']].map(([key,label,value,unit])=>({player_id:p.id,key,label,value,unit,sample_count:4500,confidence:'high',description:'Synthetic measured fixture for review.',numerator:Number(value)*300,denominator:300,metric_version:'metrics-2'})));
 const events=[{id:'review:e1',player_id:'review:you',team:0,time:84.6,end_time:87.2,category:'boost',title:'Low boost before challenge',description:'Boost under 20 during the approach. Review nearby small pads.',severity:'review',confidence:'high',metric_keys:['low_boost_pct']},{id:'review:e2',player_id:'review:you',team:0,time:183.4,end_time:186.7,category:'goal',title:'Goal conceded',description:'Opponent finishes after a midfield turnover.',severity:'critical',confidence:'high',metric_keys:[]},{id:'review:e3',player_id:'review:you',team:0,time:249.1,end_time:251.5,category:'boost',title:'Boost active at speed',description:'Boost active above threshold. Context needed.',severity:'review',confidence:'medium',metric_keys:['boost_active_at_supersonic_speed_s']},{id:'review:e4',player_id:'review:you',team:0,time:272,end_time:274,category:'goal',title:'Goal scored',description:'Recorded goal for Nova.',severity:'strength',confidence:'high',metric_keys:[]}];
 return {summary,players:summary.players,frames,metrics,events,coverage:{metadata:true,positions:true,boost:true,goals:true,touches:true,decoded_frames:19200,render_frames:frames.length,live_play_seconds:286,notes:[]},analysis_version:'analysis-3',pad_events:[],shots:[]};
};
const conversations=empty?[]:[{id:'review-conv-1',title:'My next focus in 1s',mode:'1v1',preset:'Balanced',prompt_version:'coach-3',updated_at:'2026-10-06T23:00:00Z'},{id:'review-conv-2',title:'Defending midfield turnovers',mode:'2v2',preset:'Balanced',prompt_version:'coach-3',updated_at:'2026-10-05T23:00:00Z'},{id:'review-conv-3',title:'Practice check-in',mode:'3v3',preset:'Balanced',prompt_version:'coach-3',updated_at:'2026-10-04T23:00:00Z'}];
const manifest={modes:Object.fromEntries(modes.map((m,i)=>[m,{recent_count:13,lifetime_count:14-i,unknown_date_count:0}])),excluded:{player_absent:0},player_id:'review:you',confidence:'measured'};
let cancelled=false;
(window as any).review={state,calls:[],full,settings,delayReplay:{},refresh:()=>emit('import-progress',{current:1,total:1,file:'review-fixture',status:'done',new:1})};
mockWindows('main');
mockIPC(async(cmd,args:any)=>{
 (window as any).review.calls.push({cmd,args});
 if(state==='loading'&&cmd==='get_settings')await new Promise(r=>setTimeout(r,60000));
 if(state==='error'&&cmd==='get_library')throw {code:'storage',message:'Synthetic malformed stored replay row'};
 if(cmd.startsWith('plugin:window|'))return false;
 if(cmd==='get_settings')return settings;
 if(cmd==='save_settings'){settings={...settings,...args.settings};return settings;}
 if(cmd==='get_library')return {count:replays.length,replays,identity_candidates:empty?[]:[{player_id:'review:you',name:'Nova',matches:40,platform:'Steam'}]};
 if(cmd==='resolve_identity')return {player_id:settings.player_id,player_name:settings.player_name,auto:false};
 if(cmd==='get_progress')return {player_id:settings.player_id,player_name:settings.player_name,matches_analyzed:replays.length,modes:empty?{}:Object.fromEntries(modes.map((m,i)=>[m,{matches:14-i,wins:8-i,win_rate:57-i,avg_boost:42.6,avg_speed:1480,defensive_half_pct:54.2,low_boost_pct:24.6,boost_active_at_supersonic_speed_s:12.4}])),recurring_strengths:['Strong goal-side positioning'],recurring_priorities:['Review midfield boost routes'],goals:[]};
 if(cmd==='get_teammates')return empty?[]:[{player_id:'review:p1',name:'Orbit',platform:'Steam',shared_matches:17,wins:10,losses:7,win_rate:58.8,last_played:'2026-10-06T23:15:00Z'},{player_id:'review:p2',name:'Kite',platform:'Steam',shared_matches:8,wins:3,losses:5,win_rate:37.5,last_played:'2026-10-05T21:00:00Z'}];
 if(cmd==='get_memory')return empty?[]:[{name:'weekly-focus',content:'Pick up two small pads on the way back to defence.',updated_at:'2026-10-06T20:00:00Z',legacy_warning:null}];
 if(cmd==='get_ai_status')return {current_provider:'none',cloud_consent:false,chat_model:'review-stub',analysis_model:'review-stub',providers:{none:{configured:false,status:'offline'},openai:{configured:false},neotoken:{configured:false},chatgpt:{supported:false,status:'disabled',reason:'disabled pending live verification'}}};
 if(cmd==='get_import_status')return empty?[]:[{path:'review-owned/broken.replay',file_name:'broken.replay',size:140,mtime_ns:'1',file_hash:null,status:'failed',error:'Synthetic truncated replay',updated_at:'2026-10-06T22:00:00Z'}];
 if(cmd==='get_conversations')return conversations;
 if(cmd==='get_messages')return [{id:'review-msg-u',conversation_id:args.conversationId,body:{role:'user',content:'What should I work on next in 1s?',timestamp:'2026-10-06T23:00:00Z',status:'complete',mode:'1v1'}},{id:'review-msg-a',conversation_id:args.conversationId,body:{role:'assistant',content:'Your next focus is keeping enough boost for the first defensive challenge. At [1:24](#review:e1), you approach on low boost. Review the small-pad route before deciding whether a full-pad detour helps.\n\nTry **10 minutes of small-pad recoveries**, then look for one chance to use the route in your next three matches.',timestamp:'2026-10-06T23:00:01Z',status:'complete',replay_id:all[0].id,evidence_ids:['review:e1'],context_manifest:manifest}}];
 if(cmd==='get_replay'||cmd==='get_coach_replay'){const delay=(window as any).review.delayReplay[args.id];if(delay)await new Promise(r=>setTimeout(r,delay));const r=full(args.id);if(cmd==='get_coach_replay')r.frames=[];return r;}
 if(cmd==='get_context_manifest')return manifest;
 if(cmd==='camera_profile')return {profile:{fov:110,distance:270,height:100,angle:-4,stiffness:.5},source:'default'};
 if(cmd==='get_practice')return {plans:empty?[]:[{id:'review-plan',mode:args.mode,created_at:'2026-10-05T20:00:00Z',body:{title:'Small-pad recovery route',drill:'Recover to defence using a line of small pads.',success_criterion:'Keep momentum through five clean routes.',next_match_cue:'Two small pads before the challenge.',intended_minutes:10,pack_id:null,provenance:'self_report',prompt_version:'coach-3'}}],sessions:empty?[]:[{plan_id:'review-plan',logged_at:'2026-10-06T19:00:00Z',completed_at:'2026-10-06T19:00:00Z',completion_source:'self_report',body:{completed_minutes:12,difficulty:'right',notes:'Four clean routes.'}}],source:'self_report',forecast:'unavailable',reassessment:'Review after 10 matches.',transfer:{cycles:[],metric_options:[],match_options:[],computed_at:'2026-10-06T23:00:00Z',privacy:'Self-checks stay local.',window_policy:'Compare eligible matches.'}};
 if(cmd==='evidence_tool')return args.tool==='get_mistake_fingerprints'?{clusters:[],matches_searched:40,method:'Evidence grouping',trend_policy:'No calibrated grade'}:args.tool==='get_opponent_index'?{opponents:[]}:{rows:[],total:0,next_cursor:null,matches_searched:40};
 if(cmd==='bot_likeness')return {players:[],method:'experimental',warnings:['Insufficient cadence resolution']};
 if(cmd==='detector_reports'||cmd==='bot_labels')return [];
 if(cmd==='bot_calibration_report')return {status:'insufficient_labels'};
 if(cmd==='xg_model_status')return {available:false,status:'insufficient_data',reason:'150 eligible shots required',shots:40};
 if(cmd==='xg_replay_shots')return {shots:[],status:'insufficient_data'};
 if(cmd==='xg_player_summary')return {available:false,reason:'150 eligible shots required',shots:40};
 if(cmd==='sim_status')return {available:false,reason:'Simulation engine not configured',checkpoint_available:false};
 if(cmd==='get_cloud_preview')return {provider:'none',endpoint:null,model:'review-stub',characters:12400,upper_bound_characters:24000,approx_tokens:3100,estimated:true,cost_label:'Offline',categories:['Replay metrics','Profile'],estimate_note:'Synthetic preview'};
 if(cmd==='cancel_ai'){cancelled=true;return true;}
 if(cmd==='chat'){
  cancelled=false;let text='';const words='Focus on your recovery route. At review:e1 you reach the challenge with low boost. Watch the approach, then practise a small-pad route for ten minutes. '.repeat(4).split(' ');
  for(let i=0;i<words.length;i++){if(cancelled)break;await new Promise(r=>setTimeout(r,110));const delta=words[i]+' ';text+=delta;const chan=args.onDelta||args.updates||args.onUpdate;if(chan)(window as any).__TAURI_INTERNALS__.runCallback(chan.id,{message:delta,index:i});}
  return {conversation_id:args.conversationId||'review-conv-1',response:text,status:cancelled?'cancelled':'complete',error:null,evidence_ids:['review:e1'],replay_id:all[0].id,context_chars:12400,context_manifest:manifest};
 }
 if(cmd==='delete_replay'){replays=replays.filter(r=>r.id!==args.id);return true;}
 if(cmd==='create_conversation')return {id:'review-new',title:'New conversation',mode:args.mode,preset:args.preset,prompt_version:'coach-3',updated_at:'2026-10-06T23:00:00Z'};
 if(cmd==='list_models')return {provider:args.provider,models:[{id:'review-stub'}]};
 if(cmd==='plugin:dialog|open')return null;
 return null;
},{shouldMockEvents:true});
createRoot(document.getElementById('root')!).render(<App/>);
