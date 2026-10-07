from pathlib import Path
import re
root=Path.cwd(); original=(root/'crates/replay-core/src/lib.rs').read_text(encoding='utf-8')
# Preserve every implementation byte except paths made absolute for this review-only harness.
wrapped=original.replace('mod types;', '#[path = "'+(root/'crates/replay-core/src/types.rs').as_posix()+'"]\nmod types;').replace('"../../../app/src/data/metrics.json"','"'+(root/'app/src/data/metrics.json').as_posix()+'"')
trait=(Path(r'C:\Users\barke\.cargo\registry\src\index.crates.io-1949cf8c6b5b557f\subtr-actor-1.4.0\src\processor\view.rs').read_text().split('pub trait ProcessorView {',1)[1].split('\nimpl ProcessorView',1)[0])
methods=re.findall(r'(?m)^    fn\s+([A-Za-z_0-9]+)\s*(\([^{}]*?\))\s*->\s*([^{}]+?);(?=\n)',trait)
# Macro-generated uncalled surface uses panics, so any unexpected collector dependency fails visibly.
custom={
'get_replay_meta':'unimplemented!()', 'player_count':'self.ids.len()',
'iter_player_ids_in_order':'Box::new(self.ids.iter())','current_in_game_team_player_counts':'[self.ids.len(),0]',
'get_seconds_remaining':'Ok(300)','get_replicated_state_name':'Ok(54)','get_replicated_game_state_time_remaining':'Ok(0)',
'get_ball_has_been_hit':'Ok(self.hit)','get_ignore_ball_syncing':'Ok(false)','get_team_scores':'Ok((0,0))',
'get_normalized_ball_rigid_body':'Ok(rb([0.,self.ball_y,93.],0.))',
'get_normalized_player_rigid_body':'Ok(rb([0.,-1000.,17.],2250.))','get_player_is_team_0':'Ok(true)',
'get_player_boost_level':'Ok(self.boost*2.55)','get_boost_active':'Ok(1)', 'get_dodge_active':'Ok(0)',
'get_jump_active':'Ok(0)','get_double_jump_active':'Ok(0)','get_powerslide_active':'Ok(false)','get_throttle':'Ok(255)','get_steer':'Ok(128)',
'current_frame_boost_pad_events':'&[]','current_frame_player_stat_events':'&[]','current_frame_goal_events':'&[]'}
impl='\n'.join('fn '+n+a+' -> '+ret.strip()+' { '+custom.get(n,'unimplemented!()')+' }' for n,a,ret in methods)
tests=r'''
#[cfg(test)]
mod review_characterization {
 use super::*;
 use subtr_actor::*;
 #[allow(unused_variables)]
 struct FakeView { ids:Vec<PlayerId>, hit:bool, boost:f32, ball_y:f32 }
 fn rb(pos:[f32;3],v:f32)->boxcars::RigidBody { boxcars::RigidBody { sleeping:false,location:boxcars::Vector3f{x:pos[0],y:pos[1],z:pos[2]}, rotation:boxcars::Quaternion{x:0.,y:0.,z:0.,w:1.}, linear_velocity:Some(boxcars::Vector3f{x:v,y:0.,z:0.}), angular_velocity:None } }
 #[allow(unused_variables)]
 impl ProcessorView for FakeView { $IMPL }
 fn frame(c:&mut EvidenceCollector,p:&FakeView,t:f32) { let f:boxcars::Frame=serde_json::from_value(serde_json::json!({"time":t,"delta":0.1,"new_actors":[],"deleted_actors":[],"updated_actors":[]})).unwrap(); c.process_frame(p,&f,0,t).unwrap(); }
 fn analysis(c:&EvidenceCollector)->ReplayAnalysis { let ps=serde_json::json!([{"id":"steam:1","name":"Tester","team":0,"platform":"Steam","is_bot":false}]);serde_json::from_value(serde_json::json!({
  "summary":{"id":"m","file_hash":"h","file_name":"m.replay","replay_name":"Synthetic","played_at":null,"mode":"1v1","duration_seconds":20.,"blue_score":1,"orange_score":0,"players":ps,"status":"ready","error":null,"source_path":"","match_type":null,"playlist_id":1,"recorder_name":null,"recorder_player_id":null,"content_hash":"h","map_name":null},
  "players":ps,"frames":c.frames,"metrics":c.metrics("steam:1"),"events":c.events,"coverage":{"metadata":true,"positions":true,"boost":true,"goals":true,"touches":false,"decoded_frames":200,"render_frames":c.frames.len(),"live_play_seconds":c.live_seconds,"notes":[]}
 })).unwrap() }
 #[test] fn review_validate_duplicate_events_fails_but_control_is_valid() {
  for (boost,valid) in [(0.,false),(33.,true)] {
   let mut c=EvidenceCollector::new("m");let p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost,ball_y:0.};
   for i in 0..=60 {frame(&mut c,&p,i as f32/10.); }c.finish_replay(&p).unwrap();
   let outcome=validate_analysis(&analysis(&c));assert_eq!(outcome.is_ok(),valid,"boost={boost}, {outcome:?}");
   eprintln!("validation low boost {boost}: {outcome:?}");
  }
 }
 #[test] fn review_validator_accepts_corrupt_sufficient_statistics_and_coverage() {
  let mut c=EvidenceCollector::new("m");let p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost:33.,ball_y:0.};frame(&mut c,&p,0.);frame(&mut c,&p,0.1);
  let mut a=analysis(&c);assert!(validate_analysis(&a).is_ok());
  a.metrics[1].numerator=Some(f64::INFINITY);a.metrics[1].denominator=Some(-1.);a.coverage.live_play_seconds=f64::NAN;
  assert!(validate_analysis(&a).is_ok(),"characterization: invalid weighting and coverage accepted");
 }
 #[test] fn review_validator_accepts_negative_counts_and_wrong_shot_team() {
  let mut c=EvidenceCollector::new("m");let p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost:33.,ball_y:0.};frame(&mut c,&p,0.);frame(&mut c,&p,0.1);
  let mut a=analysis(&c);a.summary.blue_score=Some(-100);a.metrics[1].value=Some(-100.);
  a.shots.push(StatSample{time:0.1,frame:usize::MAX,kind:"shot".into(),player_id:"steam:1".into(),team:1,player_position:None,shot:None});
  assert!(validate_analysis(&a).is_ok(),"characterization: impossible scores/boost and inconsistent shot team/frame accepted");
 }
 #[test] fn review_low_and_supersonic_boost_generate_duplicate_event_ids() {
  let mut c=EvidenceCollector::new("m");let mut p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost:0.,ball_y:0.};
  for i in 0..=60 { frame(&mut c,&p,i as f32/10.); }
  p.boost=100.;frame(&mut c,&p,6.1);c.finish_replay(&p).unwrap();
  let mut ids=std::collections::HashSet::new();let duplicate=c.events.iter().any(|e|!ids.insert(&e.id));
  assert!(duplicate,"characterization: overlapping low boost and boosting at speed share ID");
  eprintln!("overlapping boost events: {:?}",c.events.iter().map(|e|(&e.id,&e.title,e.time,e.end_time)).collect::<Vec<_>>());
 }
 #[test] fn review_kickoff_time_not_in_active_play() {
  let mut c=EvidenceCollector::new("m");let mut p=FakeView{ids:vec![RemoteId::Steam(1)],hit:false,boost:33.,ball_y:0.};
  for i in 0..=20 { frame(&mut c,&p,i as f32/10.); }
  assert_eq!(c.live_seconds,0.);assert_eq!(c.acc["steam:1"].seconds,0.);
  p.hit=true;frame(&mut c,&p,2.1);frame(&mut c,&p,2.2);
  assert!((c.live_seconds-0.1).abs()<1e-5);
 }
 #[test] fn review_absent_player_extends_observed_low_boost_event() {
  let mut c=EvidenceCollector::new("m");let mut p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost:0.,ball_y:0.};
  for i in 0..=60 { frame(&mut c,&p,i as f32/10.); }
  p.ids.clear();for i in 61..=120 { frame(&mut c,&p,i as f32/10.); }
  p.ids.push(RemoteId::Steam(1));frame(&mut c,&p,12.1);
  let low=c.events.iter().find(|e|e.title=="Extended low-boost window").unwrap();
  assert!(low.end_time>=12.,"characterization: low-boost event continues through six seconds with no car observations");
  assert!((c.acc["steam:1"].seconds-6.).abs()<1e-4);
  eprintln!("low-boost event {}..{}; actual observed seconds {}",low.time,low.end_time,c.acc["steam:1"].seconds);
 }
 #[test] fn review_gap_is_excluded_without_quality_accounting() {
  let mut c=EvidenceCollector::new("m");let p=FakeView{ids:vec![RemoteId::Steam(1)],hit:true,boost:33.,ball_y:0.};
  frame(&mut c,&p,0.);frame(&mut c,&p,0.1);frame(&mut c,&p,0.5);frame(&mut c,&p,0.6);
  assert!((c.live_seconds-0.2).abs()<1e-5);
  assert!(c.frames.iter().any(|f|f.time==0.5 && f.discontinuity));
 }
 #[test] fn review_exposure_event_spans_dropped_timing_gap() {
  let mut c=EvidenceCollector::new("m");let p=FakeView{ids:vec![RemoteId::Steam(1),RemoteId::Steam(2)],hit:true,boost:33.,ball_y:-2000.};
  for i in 0..=12 {frame(&mut c,&p,i as f32/10.); }frame(&mut c,&p,5.);
  let e=c.events.iter().find(|e|e.category=="rotation").unwrap();
  assert_eq!(e.end_time,5.);assert!((c.live_seconds-1.2).abs()<1e-4);
  eprintln!("exposure event {}..{} includes dropped gap 1.2..5.0; observed live seconds {}",e.time,e.end_time,c.live_seconds);
 }
 #[test] fn review_partial_velocity_overstates_metric_sample_count() {
  let mut c=EvidenceCollector::new("m");let mut a=Accumulator::default();a.samples=100;a.seconds=10.;a.observe_resources(0.1,Some(0.),Some(2250.),Some(true));c.acc.insert("p".into(),a);
  let ms=c.metrics("p");let speed=ms.iter().find(|m|m.key=="avg_speed").unwrap();
  assert_eq!(speed.sample_count,100);assert_eq!(speed.denominator,Some(0.1));
 }
}
'''.replace('$IMPL',impl)
p=root/'review/metrics-probe/src';p.mkdir(parents=True,exist_ok=True);(p/'lib.rs').write_text(wrapped+tests,encoding='utf-8')
manifest=(root/'crates/replay-core/Cargo.toml').read_text().split('[[bin]]')[0].replace('name = "replay-core"','name = "review-metrics-probe"')+'\n[workspace]\n'
(root/'review/metrics-probe/Cargo.toml').write_text(manifest,encoding='utf-8')
(root/'review/metrics-probe/README.md').write_text('Review-only white-box tests. lib.rs is generated directly from current replay-core/src/lib.rs without implementation changes. Only module and dictionary include paths are absolute. The appended tests implement ProcessorView synthetic snapshots; unused methods panic. No replay, profile, credential or network provider is read. Regenerate with review/review_metric_probe.py.\n')
print(len(methods),'ProcessorView signatures generated')
