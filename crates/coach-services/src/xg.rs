//! Local xG per shot on the user's own imported library.
//!
//! This is NOT per-decision xG and NOT a general-population probability. It is a small,
//! transparent, L2-regularised logistic regression fitted on the replay-reported shots in
//! this library (labelled goal / no goal from the subsequent goal event). Every number is
//! evaluated on whole held-out matches (grouped K-fold, never split by shot) and compared
//! with a base-rate predictor. If the sample gate or the skill check fails, the status is
//! `unavailable` with a reason and no per-shot probabilities are produced. Shots without a
//! measured position/ball state have `xg: null`, never a neutral value.
use super::*;
use std::collections::BTreeSet;

pub const XG_VERSION: &str = "xg-1";
const MIN_SHOTS: usize = 150;
const MIN_MATCHES: usize = 15;
const MIN_PER_CLASS: usize = 20;
const FOLDS: usize = 5;
const LAMBDA: f64 = 1.0;
const GOAL_WINDOW: f64 = 8.0;
const POST: f64 = 892.755;
const GOAL_Y: f64 = 5120.0;
const FEATURES: [&str; 5] = [
    "distance_to_goal_m",
    "goal_angle_rad",
    "ball_speed_kuu_s",
    "ball_height_m",
    "defenders_between",
];
const N: usize = FEATURES.len();

#[derive(Clone, Debug)]
struct ShotRow {
    match_id: String,
    player_id: String,
    time: f64,
    goal: bool,
    feats: Option<[f64; N]>,
    missing: Option<&'static str>,
}

#[derive(Default, Debug)]
struct Extraction {
    rows: Vec<ShotRow>,
    goals_without_shot: usize,
}

fn vec3(v: &Value) -> Option<[f64; 3]> {
    let a = v.as_array()?;
    if a.len() != 3 {
        return None;
    }
    let mut o = [0.0; 3];
    for (i, x) in a.iter().enumerate() {
        o[i] = x.as_f64().filter(|n| n.is_finite())?;
    }
    Some(o)
}

/// Opponent cars strictly inside the triangle (ball, left post, right post) in the frame
/// nearest the shot. None when no frame within 0.5 s or no opponent has a position.
fn defenders(a: &Value, time: f64, team: u8, ball: [f64; 3]) -> Option<f64> {
    let frames = a["frames"].as_array()?;
    let ix = frames.partition_point(|f| f["time"].as_f64().unwrap_or(f64::MAX) < time);
    let best = [ix.checked_sub(1), Some(ix)]
        .into_iter()
        .flatten()
        .filter_map(|i| frames.get(i))
        .filter_map(|f| Some(((f["time"].as_f64()? - time).abs(), f)))
        .min_by(|x, y| x.0.total_cmp(&y.0))?;
    if best.0 > 0.5 {
        return None;
    }
    let sign = if team == 0 { 1.0 } else { -1.0 };
    let tri = [(ball[0], ball[1] * sign), (-POST, GOAL_Y), (POST, GOAL_Y)];
    let side = |p: (f64, f64), a: (f64, f64), b: (f64, f64)| {
        (p.0 - b.0) * (a.1 - b.1) - (a.0 - b.0) * (p.1 - b.1)
    };
    let (mut seen, mut count) = (0, 0.0);
    for c in best.1["cars"].as_array()? {
        let Some(p) = vec3(&c["position"]) else {
            continue;
        };
        // Team membership comes from the player list.
        let opp = a["players"].as_array().is_some_and(|ps| {
            ps.iter().any(|pl| {
                pl["id"] == c["player_id"] && pl["team"].as_u64() == Some(u64::from(1 - team))
            })
        });
        if !opp {
            continue;
        }
        seen += 1;
        let q = (p[0], p[1] * sign);
        let (d1, d2, d3) = (
            side(q, tri[0], tri[1]),
            side(q, tri[1], tri[2]),
            side(q, tri[2], tri[0]),
        );
        let outside = (d1 < 0.0 || d2 < 0.0 || d3 < 0.0) && (d1 > 0.0 || d2 > 0.0 || d3 > 0.0);
        if !outside {
            count += 1.0;
        }
    }
    (seen > 0).then_some(count)
}

fn extract(a: &Value) -> Extraction {
    let match_id = a["summary"]["id"].as_str().unwrap_or("").to_string();
    let mut shots: Vec<(f64, String, u8, &Value)> = a["shots"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|s| s["kind"] == "shot")
        .filter_map(|s| {
            Some((
                s["time"].as_f64()?,
                s["player_id"].as_str()?.to_string(),
                u8::try_from(s["team"].as_u64()?).ok().filter(|t| *t <= 1)?,
                s,
            ))
        })
        .collect();
    shots.sort_by(|x, y| x.0.total_cmp(&y.0));
    let mut goal_flags = vec![false; shots.len()];
    let mut goals: Vec<_> = a["events"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|e| e["category"] == "goal")
        .filter_map(|e| {
            Some((
                e["time"].as_f64()?,
                e["team"].as_u64()?,
                e["player_id"].as_str(),
            ))
        })
        .collect();
    goals.sort_by(|x, y| x.0.total_cmp(&y.0));
    let mut without = 0;
    for (gt, gteam, gplayer) in goals {
        let cands = |same_player: bool| {
            (0..shots.len()).rev().find(|&i| {
                !goal_flags[i]
                    && u64::from(shots[i].2) == gteam
                    && (0.0..=GOAL_WINDOW).contains(&(gt - shots[i].0))
                    && (!same_player || Some(shots[i].1.as_str()) == gplayer)
            })
        };
        match gplayer.and_then(|_| cands(true)).or_else(|| cands(false)) {
            Some(i) => goal_flags[i] = true,
            None => without += 1,
        }
    }
    let rows = shots
        .iter()
        .zip(goal_flags)
        .map(|((time, player, team, s), goal)| {
            let mut row = ShotRow {
                match_id: match_id.clone(),
                player_id: player.clone(),
                time: *time,
                goal,
                feats: None,
                missing: None,
            };
            if !s["shot"].is_object() {
                row.missing = Some("no shot geometry recorded (position unavailable)");
                return row;
            }
            let shot = &s["shot"];
            let Some(ball) = vec3(&shot["ball_position"]) else {
                row.missing = Some("ball position unavailable");
                return row;
            };
            let Some(speed) = shot["ball_speed"].as_f64().filter(|v| v.is_finite()) else {
                row.missing = Some("ball speed unavailable");
                return row;
            };
            let Some(def) = defenders(a, *time, *team, ball) else {
                row.missing = Some("defender positions unavailable near this shot");
                return row;
            };
            let sign = if *team == 0 { 1.0 } else { -1.0 };
            let (dx, dy) = (ball[0], GOAL_Y - ball[1] * sign);
            let angle = ((POST - dx).atan2(dy) - (-POST - dx).atan2(dy)).abs();
            row.feats = Some([
                dx.hypot(dy) / 1000.0,
                angle,
                speed / 1000.0,
                ball[2] / 1000.0,
                def,
            ]);
            row
        })
        .collect();
    Extraction {
        rows,
        goals_without_shot: without,
    }
}

#[derive(Clone, Debug)]
struct Model {
    mean: [f64; N],
    std: [f64; N],
    w: [f64; N + 1],
}

fn sigmoid(z: f64) -> f64 {
    1.0 / (1.0 + (-z).exp())
}

fn solve(mut h: [[f64; N + 1]; N + 1], mut g: [f64; N + 1]) -> Option<[f64; N + 1]> {
    for c in 0..=N {
        let p = (c..=N).max_by(|&a, &b| h[a][c].abs().total_cmp(&h[b][c].abs()))?;
        if h[p][c].abs() < 1e-12 {
            return None;
        }
        h.swap(c, p);
        g.swap(c, p);
        for r in c + 1..=N {
            let f = h[r][c] / h[c][c];
            let pivot = h[c];
            for (value, pivot_value) in h[r][c..].iter_mut().zip(&pivot[c..]) {
                *value -= f * pivot_value;
            }
            g[r] -= f * g[c];
        }
    }
    let mut x = [0.0; N + 1];
    for r in (0..=N).rev() {
        let s: f64 = (r + 1..=N).map(|k| h[r][k] * x[k]).sum();
        x[r] = (g[r] - s) / h[r][r];
    }
    Some(x)
}

fn fit(data: &[([f64; N], bool)]) -> Option<Model> {
    if data.is_empty() {
        return None;
    }
    let n = data.len() as f64;
    let (mut mean, mut std) = ([0.0; N], [1.0; N]);
    for j in 0..N {
        mean[j] = data.iter().map(|d| d.0[j]).sum::<f64>() / n;
        let v = data.iter().map(|d| (d.0[j] - mean[j]).powi(2)).sum::<f64>() / n;
        std[j] = if v.sqrt() > 1e-9 { v.sqrt() } else { 1.0 };
    }
    let z = |x: &[f64; N]| {
        let mut o = [1.0; N + 1];
        for j in 0..N {
            o[j + 1] = (x[j] - mean[j]) / std[j];
        }
        o
    };
    let mut w = [0.0; N + 1];
    for _ in 0..50 {
        let mut g = [0.0; N + 1];
        let mut h = [[0.0; N + 1]; N + 1];
        for (x, y) in data {
            let zx = z(x);
            let p = sigmoid(w.iter().zip(&zx).map(|(a, b)| a * b).sum());
            for a in 0..=N {
                g[a] += (p - f64::from(u8::from(*y))) * zx[a];
                for b in 0..=N {
                    h[a][b] += p * (1.0 - p) * zx[a] * zx[b];
                }
            }
        }
        for a in 1..=N {
            g[a] += LAMBDA * w[a];
            h[a][a] += LAMBDA;
        }
        let d = solve(h, g)?;
        let mut step = 0.0f64;
        for a in 0..=N {
            w[a] -= d[a];
            step = step.max(d[a].abs());
        }
        if !w.iter().all(|v| v.is_finite()) {
            return None;
        }
        if step < 1e-9 {
            break;
        }
    }
    Some(Model { mean, std, w })
}

impl Model {
    fn predict(&self, x: &[f64; N]) -> f64 {
        let mut z = self.w[0];
        for (j, value) in x.iter().enumerate() {
            z += self.w[j + 1] * (value - self.mean[j]) / self.std[j];
        }
        sigmoid(z).clamp(1e-6, 1.0 - 1e-6)
    }
}

fn fnv(s: &str) -> u64 {
    s.bytes().fold(0xcbf29ce484222325, |h, b| {
        (h ^ u64::from(b)).wrapping_mul(0x100000001b3)
    })
}

/// Deterministic match-level fold assignment: matches ordered by hash, dealt round-robin.
fn fold_assignment(matches: &BTreeSet<String>, k: usize) -> HashMap<String, usize> {
    let mut ids: Vec<_> = matches.iter().collect();
    ids.sort_by_key(|m| (fnv(m), (*m).clone()));
    ids.into_iter()
        .enumerate()
        .map(|(i, m)| (m.clone(), i % k))
        .collect()
}

/// (train, test) indices into `rows`; the split is by match, never by shot.
fn split_indices(
    rows: &[ShotRow],
    idx: &[usize],
    folds: &HashMap<String, usize>,
    fold: usize,
) -> (Vec<usize>, Vec<usize>) {
    idx.iter().partition(|&&i| folds[&rows[i].match_id] != fold)
}

fn log_loss(p: &[f64], y: &[bool]) -> f64 {
    p.iter()
        .zip(y)
        .map(|(p, y)| -if *y { p.ln() } else { (1.0 - p).ln() })
        .sum::<f64>()
        / p.len() as f64
}
fn brier(p: &[f64], y: &[bool]) -> f64 {
    p.iter()
        .zip(y)
        .map(|(p, y)| (p - f64::from(u8::from(*y))).powi(2))
        .sum::<f64>()
        / p.len() as f64
}
fn r4(v: f64) -> f64 {
    (v * 10_000.0).round() / 10_000.0
}

struct Assessment {
    doc: Value,
    available: bool,
    /// Out-of-fold (whole-match held-out) prediction per row index.
    oof: HashMap<usize, f64>,
}

fn gate_doc() -> Value {
    json!({"min_labelled_shots":MIN_SHOTS,"min_matches":MIN_MATCHES,"min_per_class":MIN_PER_CLASS})
}
fn limitations() -> Value {
    json!([
        "xG per shot learned from your own imported library only; it is not a population or rank-wide probability and not decision-level xG.",
        "Includes replay-reported shots by every player in your library's matches (both teams), not only yours.",
        "Labels: a shot is a goal when a same-team goal event follows within 8 s (preferring the same player). Replay-reported shot events with no geometry have no xG.",
        "Features are shot-time geometry and ball speed plus opposing cars inside the ball-to-posts triangle. Shooter pressure, shot placement/target, keeper positioning beyond that triangle and shooter boost are not modelled.",
        "Small sample: coefficients and per-player goals-vs-xG differences are noisy; reliability bins are reported but small bins are not a calibration guarantee."
    ])
}

fn unavailable(reason: String, n_shots: usize, n_matches: usize, ex: &Value) -> Assessment {
    Assessment {
        doc: json!({"status":"unavailable","reason":reason,"model_version":XG_VERSION,
            "n_shots":n_shots,"n_matches":n_matches,"gate":gate_doc(),"extraction":ex,
            "limitations":limitations()}),
        available: false,
        oof: HashMap::new(),
    }
}

fn assess(rows: &[ShotRow], ex: &Value) -> Assessment {
    let idx: Vec<usize> = (0..rows.len())
        .filter(|&i| rows[i].feats.is_some())
        .collect();
    let matches: BTreeSet<String> = idx.iter().map(|&i| rows[i].match_id.clone()).collect();
    let goals = idx.iter().filter(|&&i| rows[i].goal).count();
    let (ns, nm) = (idx.len(), matches.len());
    if ns < MIN_SHOTS || nm < MIN_MATCHES {
        return unavailable(
            format!("Need at least {MIN_SHOTS} labelled shots from {MIN_MATCHES} matches; have {ns} shots from {nm} matches"),
            ns, nm, ex,
        );
    }
    if goals < MIN_PER_CLASS || ns - goals < MIN_PER_CLASS {
        return unavailable(
            format!(
                "Need at least {MIN_PER_CLASS} goals and {MIN_PER_CLASS} non-goals; have {goals} goals and {} non-goals",
                ns - goals
            ),
            ns, nm, ex,
        );
    }
    let data = |ix: &[usize]| -> Vec<([f64; N], bool)> {
        ix.iter()
            .map(|&i| (rows[i].feats.unwrap(), rows[i].goal))
            .collect()
    };
    let folds = fold_assignment(&matches, FOLDS);
    let (mut oof, mut base) = (HashMap::new(), HashMap::new());
    for f in 0..FOLDS {
        let (train, test) = split_indices(rows, &idx, &folds, f);
        let Some(m) = fit(&data(&train)) else {
            return unavailable(
                "Model fit did not converge on a training split".into(),
                ns,
                nm,
                ex,
            );
        };
        let rate = train.iter().filter(|&&i| rows[i].goal).count() as f64 / train.len() as f64;
        for i in test {
            oof.insert(i, m.predict(&rows[i].feats.unwrap()));
            base.insert(i, rate.clamp(1e-6, 1.0 - 1e-6));
        }
    }
    let y: Vec<bool> = idx.iter().map(|&i| rows[i].goal).collect();
    let p: Vec<f64> = idx.iter().map(|i| oof[i]).collect();
    let b: Vec<f64> = idx.iter().map(|i| base[i]).collect();
    let (ll, bll) = (log_loss(&p, &y), log_loss(&b, &y));
    let (br, bbr) = (brier(&p, &y), brier(&b, &y));
    let mut bins = vec![];
    for k in 0..5 {
        let (lo, hi) = (k as f64 * 0.2, (k + 1) as f64 * 0.2);
        let m: Vec<usize> = (0..p.len())
            .filter(|&i| p[i] >= lo && (p[i] < hi || (k == 4 && p[i] <= hi)))
            .collect();
        if !m.is_empty() {
            let n = m.len() as f64;
            bins.push(json!({"range":[r4(lo),r4(hi)],"n":m.len(),
                "mean_predicted":r4(m.iter().map(|&i| p[i]).sum::<f64>()/n),
                "observed_goal_rate":r4(m.iter().filter(|&&i| y[i]).count() as f64/n)}));
        }
    }
    let skill = ll < bll && br < bbr;
    let heldout = json!({"method":"grouped K-fold by match (no match appears in both train and test)",
        "folds":FOLDS,"n_shots":ns,"n_matches":nm,
        "log_loss":r4(ll),"brier":r4(br),
        "base_rate_log_loss":r4(bll),"base_rate_brier":r4(bbr),
        "beats_base_rate":skill,"reliability_bins":bins});
    let Some(full) = fit(&data(&idx)) else {
        return unavailable("Model fit did not converge".into(), ns, nm, ex);
    };
    if !skill {
        let mut a = unavailable(
            "Model does not beat the base-rate predictor on held-out matches; per-shot xG withheld"
                .into(),
            ns,
            nm,
            ex,
        );
        a.doc["heldout"] = heldout;
        return a;
    }
    let coefficients: Vec<Value> = FEATURES
        .iter()
        .enumerate()
        .map(|(j, n)| {
            json!({"feature":n,"standardized":r4(full.w[j+1]),"per_unit":r4(full.w[j+1]/full.std[j]),
                "mean":r4(full.mean[j]),"std":r4(full.std[j])})
        })
        .collect();
    Assessment {
        doc: json!({"status":"available","model_version":XG_VERSION,"model":"L2 logistic regression",
            "scope":"xG per shot on your own library; not per-decision xG","n_shots":ns,"n_matches":nm,
            "n_goals":goals,"base_rate":r4(goals as f64 / ns as f64),"lambda":LAMBDA,
            "intercept":r4(full.w[0]),"coefficients":coefficients,"heldout":heldout,
            "calibration":"Reliability bins on held-out matches are reported; no calibration guarantee is claimed at this sample size.",
            "gate":gate_doc(),"extraction":ex,"limitations":limitations()}),
        available: true,
        oof,
    }
}

impl CoachService {
    fn xg_rows(&self) -> ServiceResult<(Vec<ShotRow>, Value)> {
        let ids: Vec<String> = {
            let db = self.db.lock().map_err(err)?;
            let mut q = db
                .prepare("SELECT id FROM replays ORDER BY played_sort DESC,id")
                .map_err(err)?;
            let ids = q
                .query_map([], |r| r.get(0))
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            ids
        };
        let (mut rows, mut no_data, mut goals_without, mut bench) = (vec![], 0, 0, 0);
        for id in ids {
            let a = self.get_replay(&id)?;
            if a["summary"]["dataset_role"] == "benchmark" {
                bench += 1;
                continue;
            }
            if a["analysis_version"] != replay_core::ANALYSIS_VERSION {
                no_data += 1;
                continue;
            }
            let e = extract(&a);
            goals_without += e.goals_without_shot;
            rows.extend(e.rows);
        }
        let with_features = rows.iter().filter(|r| r.feats.is_some()).count();
        let ex = json!({"shot_events":rows.len(),"with_complete_features":with_features,
            "excluded_missing_features":rows.len()-with_features,
            "replays_without_analysis_3_data":no_data,"benchmarks_excluded":bench,
            "goals_without_shot_event":goals_without,
            "note":"Replays without analysis-3 shot data must be re-enriched or re-imported."});
        Ok((rows, ex))
    }

    /// Library-level model status with held-out evaluation. Status is `unavailable` with a
    /// reason when the sample gate or the base-rate skill check fails.
    pub fn xg_model_status(&self) -> ServiceResult<Value> {
        let (rows, ex) = self.xg_rows()?;
        Ok(assess(&rows, &ex).doc)
    }

    /// Per-shot xG for one replay from a model fitted on the library's OTHER matches.
    pub fn xg_replay_shots(&self, replay_id: &str) -> ServiceResult<Value> {
        let (rows, ex) = self.xg_rows()?;
        let mine: Vec<&ShotRow> = rows.iter().filter(|r| r.match_id == replay_id).collect();
        // The availability gate and held-out skill check are evaluated on the library WITHOUT the
        // scored replay, so the replay can neither unlock nor block its own scores.
        let others_rows: Vec<ShotRow> = rows
            .iter()
            .filter(|r| r.match_id != replay_id)
            .cloned()
            .collect();
        let status = assess(&others_rows, &ex);
        if mine.is_empty() {
            return Ok(
                json!({"version":XG_VERSION,"status":"unavailable","replay_id":replay_id,
                "reason":"No analysis-3 shot events for this replay; re-enrich or re-import it","shots":[]}),
            );
        }
        let basis = |s: &str, r: Option<String>| json!({"version":XG_VERSION,"status":s,"replay_id":replay_id,"reason":r,"library":status.doc});
        if !status.available {
            let mut v = basis(
                "unavailable",
                status.doc["reason"].as_str().map(str::to_owned),
            );
            v["shots"] = json!(mine
                .iter()
                .map(|r| json!({"time":r.time,"player_id":r.player_id,"goal":r.goal,"xg":null}))
                .collect::<Vec<_>>());
            return Ok(v);
        }
        let train: Vec<_> = rows
            .iter()
            .filter(|r| r.match_id != replay_id)
            .filter_map(|r| r.feats.map(|f| (f, r.goal)))
            .collect();
        let others: BTreeSet<_> = rows
            .iter()
            .filter(|r| r.match_id != replay_id && r.feats.is_some())
            .map(|r| &r.match_id)
            .collect();
        if train.len() < MIN_SHOTS || others.len() < MIN_MATCHES {
            return Ok(basis(
                "unavailable",
                Some("Not enough shots in the library's other matches to score this replay without leakage".into()),
            ));
        }
        let Some(model) = fit(&train) else {
            return Ok(basis(
                "unavailable",
                Some("Model fit did not converge".into()),
            ));
        };
        let shots: Vec<Value> = mine
            .iter()
            .map(|r| match r.feats {
                Some(f) => {
                    let feats: serde_json::Map<String, Value> = FEATURES
                        .iter()
                        .zip(f)
                        .map(|(n, v)| (n.to_string(), json!(r4(v))))
                        .collect();
                    json!({"time":r.time,"player_id":r.player_id,"goal":r.goal,
                        "xg":r4(model.predict(&f)),"features":feats})
                }
                None => json!({"time":r.time,"player_id":r.player_id,"goal":r.goal,
                    "xg":null,"unavailable_reason":r.missing}),
            })
            .collect();
        let mut v = basis("available", None);
        v["model_scope"] = json!("out-of-fold: fitted on the library's other matches only (this match left out); gate and skill check also exclude this match");
        v["xg_column_label"] = json!("xG (library model, out-of-fold)");
        v["shots"] = json!(shots);
        v["limitations"] = limitations();
        Ok(v)
    }

    /// Goals vs xG for the confirmed player, using out-of-fold (held-out match) predictions.
    pub fn xg_player_summary(&self) -> ServiceResult<Value> {
        let player = self
            .resolve_player_id(None)
            .filter(|p| !p.is_empty())
            .ok_or("Confirm your player in Settings")?;
        let (rows, ex) = self.xg_rows()?;
        let a = assess(&rows, &ex);
        if !a.available {
            return Ok(
                json!({"version":XG_VERSION,"status":"unavailable","player_id":player,
                "reason":a.doc["reason"],"library":a.doc}),
            );
        }
        let mine: Vec<usize> = (0..rows.len())
            .filter(|&i| rows[i].player_id == player)
            .collect();
        let scored: Vec<usize> = mine
            .iter()
            .copied()
            .filter(|i| a.oof.contains_key(i))
            .collect();
        let xg: f64 = scored.iter().map(|i| a.oof[i]).sum();
        let goals = scored.iter().filter(|&&i| rows[i].goal).count();
        Ok(
            json!({"version":XG_VERSION,"status":"available","player_id":player,
            "shots_scored":scored.len(),"shots_without_xg":mine.len()-scored.len(),
            "goals_on_scored_shots":goals,"xg_sum":r4(xg),"goals_minus_xg":r4(goals as f64 - xg),
            "basis":"out-of-fold predictions: every shot is scored by a model that never saw its match",
            "caveat":"With few shots this difference is within noise; it is not a finishing-skill verdict.",
            "usage_note":"Small sample, not a finishing-skill measure.",
            "library":a.doc}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Lcg(u64);
    impl Lcg {
        fn u(&mut self) -> f64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
    }

    fn synthetic(n: usize, matches: usize) -> Vec<ShotRow> {
        let mut r = Lcg(7);
        (0..n)
            .map(|i| {
                let f = [
                    1.0 + 5.0 * r.u(),
                    0.1 + 0.9 * r.u(),
                    0.5 + 2.5 * r.u(),
                    2.0 * r.u(),
                    (3.0 * r.u()).floor(),
                ];
                let z = 1.5 - 1.2 * f[0] + 4.0 * f[1] + 0.6 * f[2] - 1.0 * f[3] - 0.8 * f[4];
                ShotRow {
                    match_id: format!("m{}", i % matches),
                    player_id: "p".into(),
                    time: i as f64,
                    goal: r.u() < sigmoid(z),
                    feats: Some(f),
                    missing: None,
                }
            })
            .collect()
    }

    #[test]
    fn recovers_coefficient_directions() {
        let rows = synthetic(600, 30);
        let data: Vec<_> = rows.iter().map(|r| (r.feats.unwrap(), r.goal)).collect();
        let m = fit(&data).unwrap();
        let signs: Vec<bool> = m.w[1..].iter().map(|w| *w > 0.0).collect();
        assert_eq!(signs, vec![false, true, true, false, false]);
        let a = assess(&rows, &json!({}));
        assert!(a.available, "{}", a.doc);
        assert_eq!(a.doc["heldout"]["beats_base_rate"], true);
    }

    #[test]
    fn split_is_by_match_without_leakage() {
        let rows = synthetic(300, 20);
        let idx: Vec<usize> = (0..rows.len()).collect();
        let ms: BTreeSet<String> = rows.iter().map(|r| r.match_id.clone()).collect();
        let folds = fold_assignment(&ms, FOLDS);
        let mut seen = BTreeSet::new();
        for f in 0..FOLDS {
            let (train, test) = split_indices(&rows, &idx, &folds, f);
            let tr: BTreeSet<_> = train.iter().map(|&i| &rows[i].match_id).collect();
            let te: BTreeSet<_> = test.iter().map(|&i| &rows[i].match_id).collect();
            assert!(!te.is_empty() && tr.is_disjoint(&te));
            assert_eq!(train.len() + test.len(), rows.len());
            for m in te {
                assert!(seen.insert(m.clone()), "match in two test folds");
            }
        }
        assert_eq!(seen, ms);
    }

    #[test]
    fn gate_blocks_small_samples() {
        let a = assess(&synthetic(149, 30), &json!({}));
        assert!(!a.available && a.doc["status"] == "unavailable");
        assert!(a.doc["reason"].as_str().unwrap().contains("149"));
        let a = assess(&synthetic(400, 14), &json!({}));
        assert!(!a.available && a.doc["reason"].as_str().unwrap().contains("14 matches"));
        let mut rows = synthetic(300, 30);
        rows[0].feats = None;
        rows[0].missing = Some("x");
        assert_eq!(assess(&rows, &json!({})).doc["n_shots"], 299);
    }

    #[test]
    fn labels_goals_and_marks_missing_position() {
        let a = json!({"summary":{"id":"m"},
          "players":[{"id":"a","team":0},{"id":"b","team":1}],
          "frames":[{"time":10.0,"cars":[{"player_id":"b","position":[0,4800,17]}]}],
          "events":[{"category":"goal","time":12.0,"team":0,"player_id":"a"},{"category":"goal","time":40.0,"team":1,"player_id":"b"}],
          "shots":[
            {"time":10.0,"kind":"shot","player_id":"a","team":0,"shot":{"ball_position":[0,3000,100],"ball_speed":1500.0}},
            {"time":20.0,"kind":"shot","player_id":"a","team":0,"shot":null},
            {"time":21.0,"kind":"save","player_id":"b","team":1,"shot":null}]});
        let e = extract(&a);
        assert_eq!(e.rows.len(), 2);
        assert!(e.rows[0].goal && e.rows[0].feats.is_some());
        assert_eq!(e.rows[0].feats.unwrap()[4], 1.0);
        assert!(!e.rows[1].goal && e.rows[1].feats.is_none() && e.rows[1].missing.is_some());
        assert_eq!(e.goals_without_shot, 1);
    }
}
