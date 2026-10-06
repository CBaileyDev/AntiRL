//! Read-only game camera discovery. Never write Rocket League config or saves.
use super::*;
use replay_core::CameraProfile;
use rusqlite::OptionalExtension;
fn valid_profile(body: &Value) -> ServiceResult<CameraProfile> {
    let profile: CameraProfile =
        serde_json::from_value(body.clone()).map_err(|_| "Enter all five camera settings")?;
    if !profile.is_valid() {
        return Err("Camera settings outside Rocket League ranges".into());
    }
    Ok(profile)
}
fn parse_camera_ini(text: &str) -> Option<CameraProfile> {
    let mut values = HashMap::new();
    let mut in_camera = false;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_camera = line.to_ascii_lowercase().contains("camera");
            continue;
        }
        if !in_camera || line.starts_with([';', '#']) {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            if let Ok(value) = value.trim().parse::<f32>() {
                values.insert(key.trim().to_ascii_lowercase(), value);
            }
        }
    }
    let value = |keys: &[&str]| keys.iter().find_map(|k| values.get(*k).copied());
    let camera = CameraProfile {
        fov: value(&["camerafov", "fov"])?,
        distance: value(&["cameradistance", "distance"])?,
        height: value(&["cameraheight", "height"])?,
        angle: value(&["camerapitch", "pitch", "angle"])?,
        stiffness: value(&["camerastiffness", "stiffness"])?,
    };
    camera.is_valid().then_some(camera)
}
impl CoachService {
    pub fn camera_profile(&self) -> ServiceResult<Value> {
        let player = self
            .resolve_player_id(None)
            .ok_or("Confirm your player in Settings")?;
        let stored: Option<String> = self
            .db
            .lock()
            .map_err(err)?
            .query_row(
                "SELECT body FROM camera_profiles WHERE player_id=?1",
                [&player],
                |r| r.get(0),
            )
            .optional()
            .map_err(err)?;
        if let Some(body) = stored {
            return serde_json::from_str(&body).map_err(err);
        }
        let config = std::env::var_os("USERPROFILE")
            .map(|p| PathBuf::from(p).join("Documents/My Games/Rocket League/TAGame/Config"));
        if let Some(path) = config.as_ref() {
            for name in ["TACamera.ini", "TASystemSettings.ini", "TAInput.ini"] {
                let file = path.join(name);
                if fs::metadata(&file).is_ok_and(|m| m.len() <= 256 * 1024) {
                    if let Ok(text) = fs::read_to_string(&file) {
                        if let Some(camera) = parse_camera_ini(&text) {
                            return Ok(
                                json!({"camera":camera,"source":"game config","detail":file.to_string_lossy(),"player_id":player}),
                            );
                        }
                    }
                }
            }
        }
        let sources = {
            let db = self.db.lock().map_err(err)?;
            let mut q=db.prepare("SELECT r.coach_body FROM replays r JOIN replay_players p ON r.id=p.replay_id WHERE p.player_id=?1 ORDER BY r.played_sort DESC,r.id DESC LIMIT 20").map_err(err)?;
            let result = q
                .query_map([&player], |r| r.get::<_, String>(0))
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            result
        };
        for body in sources {
            let a: Value = serde_json::from_str(&body).map_err(err)?;
            let Some(p) = a["players"]
                .as_array()
                .and_then(|ps| ps.iter().find(|p| p["id"] == player))
            else {
                continue;
            };
            if let Ok(camera) = valid_profile(&p["camera"]) {
                return Ok(
                    json!({"camera":camera,"source":"your recorded replay camera","detail":a["summary"]["file_name"],"player_id":player}),
                );
            }
            let hash = a["summary"]["file_hash"].as_str().unwrap_or("");
            if hash.len() == 64
                && hash.bytes().all(|b| b.is_ascii_hexdigit())
                && a["players"].as_array().is_some_and(|ps| {
                    ps.iter().filter(|other| other["name"] == p["name"]).count() == 1
                })
            {
                let file = self.snapshot_dir().join(format!("{hash}.replay"));
                if let Ok(metadata) = replay_core::read_profile_metadata(&file, true) {
                    if metadata["file_hash"] != hash {
                        continue;
                    }
                    if let Ok(camera) = valid_profile(&metadata["cameras_by_id"][&player]) {
                        return Ok(
                            json!({"camera":camera,"source":"your recorded replay camera","detail":a["summary"]["file_name"],"player_id":player}),
                        );
                    }
                    if let Some(name) = p["name"].as_str() {
                        if let Ok(camera) = valid_profile(&metadata["cameras_by_name"][name]) {
                            return Ok(
                                json!({"camera":camera,"source":"your recorded replay camera","detail":a["summary"]["file_name"],"player_id":player}),
                            );
                        }
                    }
                }
            }
        }
        Ok(
            json!({"camera":{"fov":110,"distance":270,"height":100,"angle":-3,"stiffness":0.35},"source":"AntiRL default","detail":"No complete camera profile found in Config or your latest 20 replay headers. Set the five values manually; encrypted game saves are not modified.","checked_config":config.map(|p|p.to_string_lossy().into_owned()),"player_id":player}),
        )
    }
    pub fn save_camera_profile(&self, body: &Value) -> ServiceResult<Value> {
        let player = self
            .resolve_player_id(None)
            .ok_or("Confirm your player in Settings")?;
        let camera = valid_profile(body)?;
        let safe = json!({"camera":camera,"source":"your manual camera profile","detail":"Applies to chase and ball cam; controller response is an approximation.","player_id":player});
        self.db.lock().map_err(err)?.execute("INSERT INTO camera_profiles VALUES(?1,?2,?3) ON CONFLICT(player_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at",params![player,safe.to_string(),now()]).map_err(err)?;
        Ok(safe)
    }
    pub fn reset_camera_profile(&self) -> ServiceResult<Value> {
        let player = self
            .resolve_player_id(None)
            .ok_or("Confirm your player in Settings")?;
        self.db
            .lock()
            .map_err(err)?
            .execute("DELETE FROM camera_profiles WHERE player_id=?1", [player])
            .map_err(err)?;
        self.camera_profile()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ini_requires_camera_section_and_complete_valid_profile() {
        let values = "FOV=110\nDistance=270\nHeight=100\nPitch=-3\nStiffness=0.35";
        assert!(parse_camera_ini(values).is_none());
        assert!(parse_camera_ini(&format!("[Camera]\n{values}")).is_some());
        assert!(parse_camera_ini(&format!("[Camera]\n{values}\nFOV=999")).is_none());
        assert!(parse_camera_ini("[Camera]\nFOV=110").is_none());
    }
    #[test]
    fn saved_cameras_are_account_scoped() {
        let dir = std::env::temp_dir().join(format!("antirl-camera-{}", ident()));
        let s = CoachService::open(&dir).unwrap();
        s.save_settings(json!({"player_id":"one"})).unwrap();
        s.save_camera_profile(
            &json!({"fov":100,"distance":300,"height":120,"angle":-4,"stiffness":0.5}),
        )
        .unwrap();
        assert_eq!(
            s.camera_profile().unwrap()["camera"]["fov"].as_f64(),
            Some(100.0)
        );
        s.save_settings(json!({"player_id":"two"})).unwrap();
        assert_eq!(s.camera_profile().unwrap()["source"], "AntiRL default");
        drop(s);
        let _ = fs::remove_dir_all(dir);
    }
}
