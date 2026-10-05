use super::*;
impl CoachService {
 pub fn search_training_packs(&self,query:&str,mode:&str,limit:usize)->ServiceResult<Value>{
  let catalog:Vec<Value>=serde_json::from_str(include_str!("../../../app/src/data/training-packs.json")).map_err(err)?;
  let query=query.to_ascii_lowercase();
  let records:Vec<_>=catalog.into_iter().filter(|p|mode=="All" || p["modes"].as_array().is_some_and(|ms|ms.iter().any(|m|m==mode))).filter(|p|query.is_empty() || p["skill_tags"].as_array().is_some_and(|tags|tags.iter().any(|t|query.contains(t.as_str().unwrap_or("!")))) || p["title"].as_str().is_some_and(|t|t.to_ascii_lowercase().contains(&query))).take(limit.min(10)).collect();
  Ok(json!({"records":records,"source":"verified_local_catalog","live_search":"unavailable: no supported search connector configured","verification":"source_confirmed does not mean in-game tested; published codes may have changed"}))
 }
 pub fn evidence_tool(&self,tool:&str,mode:&str,args:&Value)->ServiceResult<Value>{
  let settings=self.get_settings()?;let player=settings["player_id"].as_str().ok_or("Set an explicit player identity before evidence retrieval")?;
  if !["All","1v1","2v2","3v3"].contains(&mode){return Err("Unsupported mode".into());}
  match tool {
   "get_player_overview"|"compare_windows"=>self.analytics_context(Some(player),mode),
   "search_training_packs"=>self.search_training_packs(args["query"].as_str().unwrap_or(""),mode,3),
   "get_benchmark_summary"=>Ok(json!({"status":"unavailable","reason":"No validated comparable benchmark cohort"})),
   "get_training_history"=>Ok(json!({"status":"unavailable","reason":"No recorded training adherence"})),
   "list_matches"=>{
    let ctx=self.analytics_context(Some(player),mode)?;let offset=args["cursor"].as_u64().unwrap_or(0).min(100000) as usize;let limit=args["limit"].as_u64().unwrap_or(20).clamp(1,40) as usize;
    let db=self.analytics.lock().map_err(err)?;let mut q=db.prepare("SELECT body,revision FROM source_matches ORDER BY played_at DESC,id DESC").map_err(err)?;
    let rows=q.query_map([],|r|Ok((r.get::<_,String>(0)?,r.get::<_,String>(1)?))).map_err(err)?;let mut matches=vec![];
    for row in rows{let (body,revision)=row.map_err(err)?;let a:Value=serde_json::from_str(&body).map_err(err)?;if (mode=="All"||a["summary"]["mode"]==mode)&&a["players"].as_array().is_some_and(|ps|ps.iter().any(|p|p["id"]==player)){matches.push(json!({"summary":a["summary"],"revision":revision}));}}
    Ok(json!({"matches":matches.iter().skip(offset).take(limit).collect::<Vec<_>>(),"next_cursor":if matches.len()>offset+limit{Some(offset+limit)}else{None},"scope":ctx["player_id"]}))
   },
   "get_match_metrics"|"get_evidence_events"|"get_timeline_window"=>{
    let id=args["replay_id"].as_str().ok_or("Missing replay ID")?;
    let a=if tool=="get_timeline_window"{self.get_replay(id)?}else{self.get_coach_replay(id)?};
    if (mode!="All"&&a["summary"]["mode"]!=mode)||!a["players"].as_array().is_some_and(|ps|ps.iter().any(|p|p["id"]==player)){return Err("Replay outside personal mode scope".into());}
    let start=args["start_s"].as_f64().unwrap_or(0.0);let end=args["end_s"].as_f64().unwrap_or(start+10.0);
    if !start.is_finite()||!end.is_finite()||start<0.0||end<start||end-start>30.0{return Err("Window must span at most 30 seconds".into());}
    let key=if tool=="get_match_metrics"{"metrics"}else if tool=="get_evidence_events"{"events"}else{"frames"};
    let rows:Vec<_>=a[key].as_array().into_iter().flatten().filter(|x|if key=="metrics"{x["player_id"]==player}else if key=="events"{x["player_id"]==player&&x["time"].as_f64().is_some_and(|t|t>=start&&t<=end)}else{x["time"].as_f64().is_some_and(|t|t>=start&&t<=end)}).take(120).cloned().collect();
    Ok(json!({"replay_id":id,"player_id":player,"mode":a["summary"]["mode"],"coverage":a["coverage"],"rows":rows,"limit":120,"bounded":true,"timeline_sampling":"existing render timeline; no inferred missing flags"}))
   },
   _=>Err("Unsupported read-only evidence tool".into())
  }
 }
}
