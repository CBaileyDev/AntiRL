from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parent.parent
def read(name):return (R/f'crates/coach-services/src/{name}.rs').read_text(encoding='utf-8')
d,x,s=map(read,['detector','xg','sim'])
def part(src,a,b):return src[src.index(a):src.index(b)]
body='''// Review-only verbatim production model helper characterization.
#![allow(dead_code,unused_imports)]
use serde_json::{json,Value};
use std::{collections::{BTreeSet,HashMap},path::Path,time::{Duration,Instant},ffi::OsString,io::Read,process::{Command,Stdio},sync::{Arc,Mutex as StdMutex}};
type ServiceResult<T> = Result<T,String>;
mod detector {use super::*;
'''+part(d,'pub const DETECTOR_VERSION','fn auc')+'}\nmod xg {use super::*;\n'+part(x,'pub const XG_VERSION','impl CoachService {')+'}\nmod sim {use super::*;\n'+part(s,'fn f(v:', 'pub fn mode_team_size')+'''
 const CONTACT_UU:f64=300.;const MAX_WINDOW_S:f64=2.;const MIN_WINDOW_S:f64=0.75;
'''+part(s,'fn free_frame','// -------------------------------------------------------------- engine runner')+part(s,'pub struct EngineRun','// ------------------------------------------------------------------- service')+'}\n'
# Child tests see private production definitions in their enclosing module.
body=body.replace('}\nmod xg {',r'''
 #[test] fn review_fifteen_hz_keyboard_scores_maximum_without_cadence(){
  let a=json!({"frames":(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"keyboard","throttle":255,"steer":([0,128,255][i%3]),"jump_active":false,"dodge_active":false}]})).collect::<Vec<_>>()});
  let r=analyze_player(&a,"keyboard");assert_eq!(r["status"],"ok");assert_eq!(r["index"],100.);
  assert_eq!(r["timing"]["cadence_resolvable"],false);assert_eq!(r["basis"],"discreteness only");
  println!("REVIEW_KEYBOARD_DETECTOR {}",r);
 }
 #[test] fn review_validation_analog_controls_score_lower_at_same_rate(){
  let a=json!({"frames":(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"analog","throttle":i%256,"steer":(i*7)%256,"jump_active":false,"dodge_active":false}]})).collect::<Vec<_>>()});
  let r=analyze_player(&a,"analog");assert_eq!(r["status"],"ok");assert_eq!(r["timing"]["cadence_resolvable"],false);assert!(r["index"].as_f64().unwrap()<10.);
  println!("REVIEW_ANALOG_CONTROL_INDEX {}",r["index"]);
 }
}
mod xg {''',1)
body=body.replace('}\nmod sim {',r'''
 fn sample()->Value{json!({"summary":{"id":"m"},"players":[{"id":"p","team":0},{"id":"other","team":1}],"shots":[{"kind":"shot","time":1.,"player_id":"p","team":0,"shot":{"ball_position":[0,4120,100],"ball_speed":2000}}],"frames":[{"time":1.,"cars":[{"player_id":"other","position":[0,4800,17]}]}],"events":[]})}
 #[test] fn review_xg_metres_are_off_by_ten(){
  let e=extract(&sample());let f=e.rows[0].feats.unwrap();
  assert_eq!(FEATURES[0],"distance_to_goal_m");assert_eq!(f[0],1.); //1000uu is10m.
  assert_eq!(FEATURES[3],"ball_height_m");assert_eq!(f[3],0.1); //100uu is1m.
 }
 #[test] fn review_goal_after_opponent_touch_still_labels_old_shot_goal(){
  let mut a=sample();a["events"]=json!([{"category":"touch","player_id":"other","team":1,"time":4.},{"category":"goal","team":0,"player_id":"p","time":8.}]);
  assert!(extract(&a).rows[0].goal);
 }
 #[test] fn review_missing_one_defender_treated_as_complete_feature(){
  let mut a=sample();a["players"].as_array_mut().unwrap().push(json!({"id":"missing","team":1}));
  assert_eq!(defenders(&a,1.,0,[0.,4120.,100.]),Some(1.));
 }
}
mod sim {''',1)
body+=r'''
#[test] fn review_ball_validation_accepts_eight_duplicate_start_samples(){
 let frames:Vec<Value>=(0..30).map(|i|json!({"time":i as f64/15.,"ball":{"position":[i as f64*100.,0.,500.]}})).collect();
 let duplicates=vec![(0.,[0.,0.,500.]);8];let (max,mean,n)=sim::compare_ball_path(&duplicates,&frames,0,29).unwrap();
 assert_eq!((max,mean,n),(0.,0.,8));
}
#[test] fn review_validation_ball_normal_path_passes_and_bad_path_fails(){
 let frames:Vec<Value>=(0..30).map(|i|json!({"time":i as f64/15.,"ball":{"position":[i as f64*100.,0.,500.]}})).collect();
 let good:Vec<_>=(0..30).map(|i|(i as f64/15.,[i as f64*100.,0.,500.])).collect();
 let bad:Vec<_>=(0..30).map(|i|(i as f64/15.,[i as f64*100.+200.,0.,500.])).collect();
 let (max,mean,n)=sim::compare_ball_path(&good,&frames,0,29).unwrap();assert_eq!((max,mean,n),(0.,0.,30));
 let (max,mean,n)=sim::compare_ball_path(&bad,&frames,0,29).unwrap();assert_eq!((max,mean,n),(200.,200.,30));
}
#[test] #[ignore="Internal review subprocess helper"] fn review_pipe_inherited_holder(){std::thread::sleep(Duration::from_millis(900));}
#[test] #[ignore="Internal review subprocess helper"] #[allow(clippy::zombie_processes)] fn review_pipe_holder_child(){
 Command::new(std::env::current_exe().unwrap()).args(["--exact","review_pipe_inherited_holder","--ignored","--nocapture"]).spawn().unwrap();
}
#[test] fn review_engine_timeout_does_not_cover_readers_after_parent_exit(){
 let started=Instant::now();let exe=std::env::current_exe().unwrap();
 let out=sim::run_engine(&exe,exe.parent().unwrap(),&["--exact".into(),"review_pipe_holder_child".into(),"--ignored".into(),"--nocapture".into()],Duration::from_millis(100),100_000).unwrap();
 assert_eq!(out.code,Some(0));assert!(started.elapsed()>Duration::from_millis(800));
 println!("REVIEW_ENGINE100MS_TIMEOUT_ACTUAL_MS {}",started.elapsed().as_millis());
}
#[test] fn review_xg_status_pools_modes_and_nonpersonal_matches(){
 let tmp=tempfile::tempdir().unwrap();let service=coach_services::CoachService::open(tmp.path()).unwrap();
 service.save_settings(json!({"provider":"none","player_id":"me","replay_folder":"","auto_import":false})).unwrap();
 for (i,mode) in ["1v1","3v3"].iter().enumerate(){let a=json!({"summary":{"id":format!("other-{i}"),"mode":mode},"analysis_version":replay_core::ANALYSIS_VERSION,"players":[{"id":"other-person","team":0},{"id":"opponent","team":1}],"shots":[{"kind":"shot","time":1,"player_id":"other-person","team":0,"shot":{"ball_position":[0,4120,100],"ball_speed":2000}}],"frames":[{"time":1,"cars":[{"player_id":"opponent","position":[0,4800,17]}]}],"events":[]});service.save_replay(&a).unwrap();}
 let out=service.xg_model_status().unwrap();assert_eq!(out["n_shots"],2);assert_eq!(out["n_matches"],2);
 println!("REVIEW_XG_NONPERSONAL_MODE_POOLED {}",out);
}
#[test] fn review_engine_envelope_accepts_missing_decision_geometry(){
 let run=sim::EngineRun{stdout:b"{\"type\":\"rollout_start\"}\n{\"type\":\"decision\",\"step\":-1,\"ball\":null,\"cars\":[]}\n{\"type\":\"rollout_end\"}\n".to_vec(),stderr:String::new(),code:Some(0)};
 assert!(matches!(sim::parse_engine_output(&run).unwrap(),sim::EngineOutcome::Ok(_)));
}
#[test] fn review_validation_saved_human_label_keeps_high_bot_badge_eligible_index(){
 let tmp=tempfile::tempdir().unwrap();let service=coach_services::CoachService::open(tmp.path()).unwrap();
 let frames:Vec<_>=(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"keyboard","throttle":255,"steer":([0,128,255][i%3]),"jump_active":false,"dodge_active":false}]})).collect();
 let a=json!({"summary":{"id":"keyboard-game","mode":"2v2"},"analysis_version":replay_core::ANALYSIS_VERSION,"players":[{"id":"keyboard","name":"Synthetic keyboard player","team":0,"is_bot":false}],"frames":frames,"events":[],"metrics":[]});
 service.save_replay(&a).unwrap();service.set_bot_label("keyboard-game","keyboard",Some(false)).unwrap();
 let labels=service.bot_labels().unwrap();let l=&labels["labels"][0];assert_eq!(l["confirmed_bot"],false);assert_eq!(l["index"],100.);
 println!("REVIEW_CONFIRMED_HUMAN_BADGE_ELIGIBLE {}",l);
}
'''
t=R/'crates/coach-services/tests/review_experimental.rs';t.write_text(body,encoding='utf-8')
(R/'review/experimental-probes-source.json').write_text(json.dumps({p:hashlib.sha256(v.encode()).hexdigest() for p,v in zip(['detector.rs','xg.rs','sim.rs'],[d,x,s])},indent=2),encoding='utf-8')
print(t)
