import React from '../app/node_modules/react';
import {renderToStaticMarkup} from '../app/node_modules/react-dom/server';
import assert from 'node:assert/strict';
import {TrajectoryPlot} from '../app/src/components/CounterfactualPanel';
import ViewerHud from '../app/src/components/ViewerHud';
import Overview from '../app/src/pages/Overview';
import Progress from '../app/src/pages/Progress';
import ReplayViewer from '../app/src/ReplayViewer';
import {writeFileSync} from 'node:fs';
const base:any={summary:{id:'review',blue_score:1,orange_score:0,mode:'2v2',duration_seconds:301,players:[{id:'other',name:'Other',team:0}],file_name:'review.replay'},players:[{id:'other',name:'Other',team:0}],frames:[{time:301,ball:null,cars:[],match_clock_seconds:1,overtime:true,live_play:true,discontinuity:false}],events:[],metrics:[],coverage:{positions:true,render_frames:1}};
const results:any[]=[];
function check(name:string, fn:()=>unknown){try{fn();results.push({name,status:'confirmed'});console.log('PASS characterization:',name);}catch(error){results.push({name,status:'probe failed',error:String(error)});throw error;}}
check('Null recorded ball crashes successful simulation trajectory plot',()=>{
 const futureGap={...base,frames:[{...base.frames[0],time:301,ball:{position:[0,0,0],velocity:[0,0,0],angular_velocity:[0,0,0]}},{...base.frames[0],time:301.2,ball:null}]};
 // The backend free-flight gate validates the leg ending at t0, not future frames.
 assert.throws(()=>renderToStaticMarkup(<TrajectoryPlot replay={futureGap} result={{status:'ok',from_replay_time:301,decisions:[{time:0,ball:{pos:[0,0,0]},cars:[]},{time:.2,ball:{pos:[0,0,0]},cars:[]}]}} playerId="other"/>),/null.*position|position.*null/);
});
check('Overtime positive countup displayed without overtime label',()=>{
 const html=renderToStaticMarkup(<ViewerHud replay={base} playerId="other" time={301}/>);
 assert(html.includes('0:01'));assert(!html.includes('+0:01'));assert(!html.includes('OVERTIME'));assert(html.includes('MATCH CLOCK'));
});
check('Overview fabricates own victory when selected identity absent',()=>{
 const html=renderToStaticMarkup(<Overview replays={[base.summary]} settings={{player_id:'absent',player_name:'Absent'} as any} progress={null} onSelectReplay={()=>{}} onNavigate={()=>{}} onOpenOnboarding={()=>{}}/>);
 assert(html.includes('100%'));assert(html.includes('VICTORY'));assert(html.includes('DFH Stadium'));assert(html.includes('Zero guessed statistics'));
});
check('Overview unknown scores becomes fabricated 0-0 defeat',()=>{
 const replay={...base.summary,blue_score:null,orange_score:null};
 const html=renderToStaticMarkup(<Overview replays={[replay]} settings={{player_id:'other'} as any} progress={null} onSelectReplay={()=>{}} onNavigate={()=>{}} onOpenOnboarding={()=>{}}/>);
 assert(html.includes('DEFEAT'));assert(html.includes('0 - 0'));
});
check('Progress missing metrics becomes factual zero percentages',()=>{
 const html=renderToStaticMarkup(<Progress settings={{player_id:'other'} as any} progress={null} replays={[]}/>);
 assert(html.includes('Defensive Half Presence'));assert(html.includes('Low Boost Exposure'));assert((html.match(/0%/g)||[]).length>=2);
});
check('Restricted preference storage throws before viewer mounts',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem(){throw new Error('REVIEW SecurityError');}}});
 try {assert.throws(()=>renderToStaticMarkup(<ReplayViewer replay={base} seekTime={301}/>),/REVIEW SecurityError/);}
 finally {if(original)Object.defineProperty(globalThis,'localStorage',original);else delete (globalThis as any).localStorage;}
});
writeFileSync('review/frontend-probe-results.json',JSON.stringify(results,null,2));
