//! User-authored practice plans and self-reported adherence. Never a skill score.
use super::*;

impl CoachService {
    fn practice_scope(&self, mode: &str) -> ServiceResult<String> {
        if !["1v1", "2v2", "3v3"].contains(&mode) {
            return Err("Choose a single mode for practice".into());
        }
        self.resolve_player_id(None)
            .filter(|s| !s.is_empty())
            .ok_or("Confirm your account in Settings before saving personal practice".into())
    }
    pub fn save_practice_plan(&self, mode: &str, body: &Value) -> ServiceResult<Value> {
        let player = self.practice_scope(mode)?;
        let mut safe = json!({"provenance":"user-authored; not a verified tactical finding","prompt_version":conversations::PROMPT_VERSION});
        for key in ["title", "drill", "success_criterion", "next_match_cue"] {
            let s = body[key].as_str().unwrap_or("").trim();
            if s.is_empty() || s.chars().count() > 2000 {
                return Err(format!("{key} must contain 1-2000 characters"));
            }
            check_note_content(s)?;
            safe[key] = json!(s);
        }
        let minutes = body["intended_minutes"]
            .as_f64()
            .filter(|n| n.is_finite() && *n > 0.0 && *n <= 240.0);
        safe["intended_minutes"] = json!(minutes);
        if let Some(pack) = body["pack_id"].as_str() {
            let catalog = self.search_training_packs("", mode, 20)?;
            if !catalog["records"]
                .as_array()
                .is_some_and(|ps| ps.iter().any(|p| p["id"] == pack))
            {
                return Err("Pack is not in the retrieved mode catalog".into());
            }
            safe["pack_id"] = json!(pack);
        }
        let id = ident();
        let at = now();
        self.db.lock().map_err(err)?.execute("INSERT INTO practice_plans(id,player_id,mode,body,created_at) VALUES(?1,?2,?3,?4,?5)",params![id,player,mode,safe.to_string(),at]).map_err(err)?;
        Ok(json!({"id":id,"mode":mode,"body":safe,"created_at":at}))
    }
    pub fn get_practice(&self, mode: &str) -> ServiceResult<Value> {
        let player = self.practice_scope(mode)?;
        let db = self.db.lock().map_err(err)?;
        let mut q=db.prepare("SELECT id,body,created_at FROM practice_plans WHERE player_id=?1 AND mode=?2 AND archived=0 ORDER BY created_at DESC LIMIT 20").map_err(err)?;
        let plans = q
            .query_map(params![player, mode], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let plans:Vec<_>=plans.into_iter().map(|(id,b,at)|json!({"id":id,"body":serde_json::from_str::<Value>(&b).unwrap_or(Value::Null),"created_at":at,"mode":mode})).collect();
        let mut q=db.prepare("SELECT plan_id,body,completed_at FROM training_sessions WHERE player_id=?1 AND mode=?2 ORDER BY completed_at DESC LIMIT 40").map_err(err)?;
        let sessions = q
            .query_map(params![player, mode], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        let sessions:Vec<_>=sessions.into_iter().map(|(id,b,at)|json!({"plan_id":id,"body":serde_json::from_str::<Value>(&b).unwrap_or(Value::Null),"completed_at":at})).collect();
        Ok(
            json!({"plans":plans,"sessions":sessions,"source":"self_report","forecast":"unavailable: no calibrated longitudinal cohort","reassessment":"Review the cue in your next same-mode matches; this is a checkpoint, not a promotion date."}),
        )
    }
    pub fn record_training(
        &self,
        mode: &str,
        plan_id: &str,
        minutes: f64,
        difficulty: &str,
        notes: &str,
    ) -> ServiceResult<()> {
        let player = self.practice_scope(mode)?;
        if !minutes.is_finite()
            || minutes <= 0.0
            || minutes > 240.0
            || !["easy", "appropriate", "hard"].contains(&difficulty)
        {
            return Err("Enter 0-240 minutes and a valid difficulty".into());
        }
        check_note_content(notes)?;
        let db = self.db.lock().map_err(err)?;
        let owned:bool=db.query_row("SELECT EXISTS(SELECT 1 FROM practice_plans WHERE id=?1 AND player_id=?2 AND mode=?3 AND archived=0)",params![plan_id,player,mode],|r|r.get(0)).map_err(err)?;
        if !owned {
            return Err("Practice plan outside personal mode scope".into());
        }
        db.execute("INSERT INTO training_sessions VALUES(?1,?2,?3,?4,?5,?6)",params![ident(),plan_id,player,mode,now(),json!({"completed_minutes":minutes,"difficulty":difficulty,"notes":notes,"provenance":"self_report"}).to_string()]).map_err(err)?;
        Ok(())
    }
    pub fn archive_practice(&self, mode: &str, id: &str) -> ServiceResult<()> {
        let player = self.practice_scope(mode)?;
        self.db
            .lock()
            .map_err(err)?
            .execute(
                "UPDATE practice_plans SET archived=1 WHERE id=?1 AND player_id=?2 AND mode=?3",
                params![id, player, mode],
            )
            .map_err(err)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn practice_survives_restart_without_cross_mode_or_identity_leak() {
        let d = tempfile::tempdir().unwrap();
        let s = CoachService::open(d.path()).unwrap();
        s.save_settings(json!({"player_id":"synthetic:p"})).unwrap();
        let p=s.save_practice_plan("2v2",&json!({"title":"Recovery review","drill":"Practice landing with wheels aligned","success_criterion":"Record clean attempts","next_match_cue":"Review one recovery","intended_minutes":5})).unwrap();
        assert!(s
            .record_training("1v1", p["id"].as_str().unwrap(), 5.0, "easy", "")
            .is_err());
        s.record_training(
            "2v2",
            p["id"].as_str().unwrap(),
            5.0,
            "appropriate",
            "Synthetic completed block",
        )
        .unwrap();
        drop(s);
        let s = CoachService::open(d.path()).unwrap();
        assert_eq!(
            s.get_practice("2v2").unwrap()["sessions"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert!(s.get_practice("1v1").unwrap()["plans"]
            .as_array()
            .unwrap()
            .is_empty());
        s.save_settings(json!({"player_id":"synthetic:q"})).unwrap();
        assert!(s.get_practice("2v2").unwrap()["sessions"]
            .as_array()
            .unwrap()
            .is_empty());
    }
}
