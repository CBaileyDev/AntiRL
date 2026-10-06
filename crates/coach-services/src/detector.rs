//! Local bot-likeness heuristic over replicated controller input (analysis-3 capture).
//!
//! This is an INDEX, not a probability and not a cheating verdict. It measures how "discrete and
//! grid-aligned" a player's recorded throttle/steer/jump stream is, which is what RLGym-style
//! lookup-action bots (a small action table, each action held for several physics ticks) produce.
//! Keyboard/d-pad players also produce discrete steering, so that is an explicit confounder that
//! this index cannot separate. It is kept apart from user-entered external detector reports and
//! from the built-in `is_bot` slot flag. User labels (`bot_labels`) exist so it can be calibrated
//! later; until enough labels of both classes exist it is reported as uncalibrated.
use super::*;
use std::collections::BTreeSet;

pub const DETECTOR_VERSION: &str = "botlike-1";
const PROVENANCE: &str = "local heuristic";
/// 8 physics ticks at 120 Hz.
const HOLD_SECONDS: f64 = 8.0 / 120.0;
const MIN_SEGMENT_SECONDS: f64 = 1.0;
const MIN_SEGMENT_SAMPLES: usize = 20;
const MAX_GAP_SECONDS: f64 = 0.25;
const MIN_SAMPLES: usize = 900;
const MIN_CHANGE_EVENTS: usize = 60;
const MIN_ONSET_EVENTS: usize = 30;
pub const MIN_LABELS_PER_CLASS: usize = 10;

struct Sample {
    t: f64,
    throttle: u8,
    steer: u8,
    jump: bool,
    dodge: bool,
}

fn num(v: &Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite())
}

fn flush(cur: &mut Vec<Sample>, kept: &mut Vec<Vec<Sample>>, short: &mut usize) {
    if cur.is_empty() {
        return;
    }
    let secs = cur.last().unwrap().t - cur[0].t;
    if secs >= MIN_SEGMENT_SECONDS && cur.len() >= MIN_SEGMENT_SAMPLES {
        kept.push(std::mem::take(cur));
    } else {
        *short += 1;
        cur.clear();
    }
}

/// Continuous live-play segments of complete throttle+steer samples for one player.
/// Returns (segments kept, segments dropped as too short, live-play frames seen for the player).
fn segments(a: &Value, player: &str) -> (Vec<Vec<Sample>>, usize, usize) {
    let (mut kept, mut short, mut live) = (vec![], 0usize, 0usize);
    let mut cur: Vec<Sample> = vec![];
    for f in a["frames"].as_array().into_iter().flatten() {
        let t = num(&f["time"]);
        let car = f["cars"]
            .as_array()
            .and_then(|cs| cs.iter().find(|c| c["player_id"] == player));
        if f["discontinuity"] == true {
            flush(&mut cur, &mut kept, &mut short);
        }
        let (Some(t), Some(car)) = (t, car) else {
            flush(&mut cur, &mut kept, &mut short);
            continue;
        };
        if f["live_play"] != true {
            flush(&mut cur, &mut kept, &mut short);
            continue;
        }
        live += 1;
        if car["discontinuity"] == true {
            flush(&mut cur, &mut kept, &mut short);
        }
        let byte = |k: &str| car[k].as_u64().filter(|v| *v <= 255).map(|v| v as u8);
        let (Some(throttle), Some(steer)) = (byte("throttle"), byte("steer")) else {
            flush(&mut cur, &mut kept, &mut short);
            continue;
        };
        if cur
            .last()
            .is_some_and(|p| t <= p.t || t - p.t > MAX_GAP_SECONDS)
        {
            flush(&mut cur, &mut kept, &mut short);
        }
        cur.push(Sample {
            t,
            throttle,
            steer,
            jump: car["jump_active"] == true,
            dodge: car["dodge_active"] == true,
        });
    }
    flush(&mut cur, &mut kept, &mut short);
    (kept, short, live)
}

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// Number of distinct raw values seen at least 3 times and in 0.1% of samples (stray replication
/// artifacts do not count, but spread-out analog values do).
fn cardinality(values: impl Iterator<Item = u8>) -> usize {
    let mut counts = [0usize; 256];
    let mut n = 0usize;
    for v in values {
        counts[v as usize] += 1;
        n += 1;
    }
    counts
        .iter()
        .filter(|c| **c >= 3 && **c as f64 >= 0.001 * n as f64)
        .count()
}

/// Raw byte is a digital value: neutral (128 +/- 2) or a fully deflected extreme.
fn snapped(b: u8) -> bool {
    b <= 2 || b >= 253 || (126..=130).contains(&b)
}

fn card_value(k: usize) -> f64 {
    clamp01((12.0 - k as f64) / 9.0)
}

/// Rayleigh-style phase concentration of event times modulo `period`, each segment relative to
/// its own first event. Returns (resultant length R, events used).
fn phase_lock(per_segment: &[Vec<f64>], period: f64) -> (f64, usize) {
    let (mut c, mut s, mut n) = (0.0, 0.0, 0usize);
    for times in per_segment {
        for t in times.iter().skip(1) {
            let ph = ((t - times[0]) / period).rem_euclid(1.0) * std::f64::consts::TAU;
            c += ph.cos();
            s += ph.sin();
            n += 1;
        }
    }
    if n == 0 {
        (0.0, 0)
    } else {
        (c.hypot(s) / n as f64, n)
    }
}

fn lock_value(r: f64, n: usize) -> f64 {
    let floor = 2.0 / (n as f64).sqrt();
    clamp01((r - floor) / (1.0 - floor))
}

fn percentile(sorted: &[f64], p: f64) -> f64 {
    sorted[((sorted.len() - 1) as f64 * p).round() as usize]
}

/// Pooled autocorrelation of the action-change indicator at `lag` frames.
fn change_autocorr(indicators: &[Vec<f64>], lag: usize) -> Option<f64> {
    let all: Vec<f64> = indicators.iter().flatten().copied().collect();
    if all.is_empty() {
        return None;
    }
    let m = all.iter().sum::<f64>() / all.len() as f64;
    let var: f64 = all.iter().map(|x| (x - m).powi(2)).sum();
    if var <= 0.0 {
        return None;
    }
    let cov: f64 = indicators
        .iter()
        .flat_map(|seg| {
            (0..seg.len().saturating_sub(lag)).map(move |i| (seg[i] - m) * (seg[i + lag] - m))
        })
        .sum();
    Some(cov / var)
}

fn signal(name: &str, value: Option<f64>, weight: f64, explanation: String) -> Value {
    json!({"name":name,"value":value.map(|v|(v*1000.0).round()/1000.0),"weight":weight,"explanation":explanation})
}

fn confounders(discrete: bool, cadence: bool) -> Vec<&'static str> {
    let mut c = vec![
        "Keyboard, d-pad and other digital-input players also produce few distinct steer/throttle values; this index cannot tell them apart from a lookup-action bot on discreteness alone.",
        "Bots that output analog (continuous) actions are not detected and would score low.",
        "Replay controller values are replicated updates held between changes; they are not the raw input device stream.",
        "Short or heavily interrupted samples are noisy; see sample_count and coverage.",
    ];
    if discrete && !cadence {
        c.push("Hold-cadence signals were unavailable, so this index rests on input discreteness only, which keyboard play shares.");
    }
    c
}

/// Pure analysis of one player. `a` is a decoded analysis JSON with frames.
pub(crate) fn analyze_player(a: &Value, player: &str) -> Value {
    let (segs, short, live_frames) = segments(a, player);
    let samples: usize = segs.iter().map(Vec::len).sum();
    let seconds: f64 = segs.iter().map(|s| s.last().unwrap().t - s[0].t).sum();
    let coverage = json!({
        "live_play_frames": live_frames,
        "continuous_control_samples": samples,
        "control_fraction_of_live_play": if live_frames>0 {Some(samples as f64/live_frames as f64)} else {None},
        "segments_used": segs.len(),
        "segments_skipped_short": short,
        "seconds": (seconds*100.0).round()/100.0,
        "skipped": "non-live-play frames, discontinuities, frames without replicated throttle+steer, and segments under 1 s"
    });
    let unavailable = |reason: String| {
        json!({"player_id":player,"status":"unavailable","reason":reason,"index":null,"signals":[],
            "coverage":coverage,"sample_count":samples,"confounders":confounders(false,false),
            "detector_version":DETECTOR_VERSION,"calibrated":false,"provenance":PROVENANCE})
    };
    if live_frames == 0 {
        return unavailable("No live-play frames for this player".into());
    }
    if samples == 0 {
        return unavailable("Controller input was not captured (replay predates analysis-3 capture; re-enrich or re-import)".into());
    }
    if samples < MIN_SAMPLES {
        return unavailable(format!(
            "Only {samples} continuous control samples; at least {MIN_SAMPLES} required"
        ));
    }
    // Replicated-update timing actually measured from the data.
    let mut dts: Vec<f64> = segs
        .iter()
        .flat_map(|s| s.windows(2).map(|w| w[1].t - w[0].t))
        .collect();
    dts.sort_by(|x, y| x.total_cmp(y));
    let (median_dt, p90_dt) = (percentile(&dts, 0.5), percentile(&dts, 0.9));
    let resolvable = median_dt <= HOLD_SECONDS / 2.0 * 1.05 && p90_dt <= HOLD_SECONDS * 0.75;
    let all = || segs.iter().flatten();
    let steer_k = cardinality(all().map(|s| s.steer));
    let throttle_k = cardinality(all().map(|s| s.throttle));
    let analog = all()
        .filter(|s| !snapped(s.steer) || !snapped(s.throttle))
        .count() as f64
        / samples as f64;
    let mut signals = vec![
        signal("steer_value_cardinality", Some(card_value(steer_k)), 0.20,
            format!("{steer_k} distinct steer values each occur at least 3 times and in 0.1% of samples (1.0 at 3 or fewer, 0.0 at 12 or more). Shared with keyboard players.")),
        signal("throttle_value_cardinality", Some(card_value(throttle_k)), 0.10,
            format!("{throttle_k} distinct throttle values each occur at least 3 times and in 0.1% of samples. Shared with keyboard players.")),
        signal("analog_absence", Some(1.0 - analog), 0.25,
            format!("{:.1}% of samples used a non-neutral, non-extreme steer or throttle value (analog stick/trigger range).", analog * 100.0)),
    ];
    let mut change_times = vec![];
    let mut indicators = vec![];
    for s in &segs {
        let mut times = vec![];
        let mut ind = vec![0.0];
        for w in s.windows(2) {
            let changed = (w[0].throttle, w[0].steer) != (w[1].throttle, w[1].steer);
            ind.push(changed as u8 as f64);
            if changed {
                times.push(w[1].t);
            }
        }
        change_times.push(times);
        indicators.push(ind);
    }
    let lag = ((HOLD_SECONDS / median_dt).round() as usize).max(1);
    let diagnostics = json!({
        "median_update_interval_seconds": (median_dt*10000.0).round()/10000.0,
        "p90_update_interval_seconds": (p90_dt*10000.0).round()/10000.0,
        "target_hold_seconds": (HOLD_SECONDS*10000.0).round()/10000.0,
        "cadence_resolvable": resolvable,
        "change_autocorr_lag": lag,
        "change_autocorr_at_hold_lag": change_autocorr(&indicators, lag),
        "change_autocorr_at_lag_1": change_autocorr(&indicators, 1),
        "note": "A 0.067 s (8-tick) hold needs update spacing of at most about 0.033 s to resolve; at that spacing each hold spans only two samples, so the test is coarse."
    });
    let mut cadence_ok = false;
    if !resolvable {
        let why = format!(
            "Replicated update spacing (median {median_dt:.3} s, p90 {p90_dt:.3} s) is too coarse to resolve a {HOLD_SECONDS:.3} s hold."
        );
        signals.push(signal("action_change_cadence", None, 0.30, why.clone()));
        signals.push(signal("jump_dodge_timing_grid", None, 0.15, why));
    } else {
        let (r, n) = phase_lock(&change_times, HOLD_SECONDS);
        if n >= MIN_CHANGE_EVENTS {
            cadence_ok = true;
            signals.push(signal("action_change_cadence", Some(lock_value(r, n)), 0.30,
                format!("Throttle/steer changes fall on a {HOLD_SECONDS:.3} s grid with concentration R={r:.2} over {n} changes (random timing is near {:.2}; Rayleigh p~{:.3}).", 1.0/(n as f64).sqrt(), (-(n as f64)*r*r).exp().min(1.0))));
        } else {
            signals.push(signal(
                "action_change_cadence",
                None,
                0.30,
                format!("Only {n} action changes; at least {MIN_CHANGE_EVENTS} required."),
            ));
        }
        let onsets: Vec<Vec<f64>> = segs
            .iter()
            .map(|s| {
                s.windows(2)
                    .filter(|w| (!w[0].jump && w[1].jump) || (!w[0].dodge && w[1].dodge))
                    .map(|w| w[1].t)
                    .collect()
            })
            .collect();
        let (r, n) = phase_lock(&onsets, HOLD_SECONDS);
        if n >= MIN_ONSET_EVENTS {
            signals.push(signal("jump_dodge_timing_grid", Some(lock_value(r, n)), 0.15,
                format!("Jump/dodge onsets fall on the same grid with concentration R={r:.2} over {n} onsets.")));
        } else {
            signals.push(signal(
                "jump_dodge_timing_grid",
                None,
                0.15,
                format!("Only {n} jump/dodge onsets; at least {MIN_ONSET_EVENTS} required."),
            ));
        }
    }
    let (sum, weight) = signals
        .iter()
        .fold((0.0, 0.0), |(n, d), s| match s["value"].as_f64() {
            Some(v) => (
                n + v * s["weight"].as_f64().unwrap(),
                d + s["weight"].as_f64().unwrap(),
            ),
            None => (n, d),
        });
    let index = (sum / weight * 1000.0).round() / 10.0;
    json!({"player_id":player,"status":"ok","index":index,
        "basis": if cadence_ok {"discreteness and hold cadence"} else {"discreteness only"},
        "signals":signals,"coverage":coverage,"sample_count":samples,"timing":diagnostics,
        "confounders":confounders(true,cadence_ok),
        "detector_version":DETECTOR_VERSION,"calibrated":false,"provenance":PROVENANCE,
        "interpretation":"Heuristic bot-likeness index from 0 to 100. Not a probability, not calibrated, not a cheating verdict; do not infer identity or intent."})
}

fn auc(pos: &[f64], neg: &[f64]) -> f64 {
    let mut wins = 0.0;
    for p in pos {
        for n in neg {
            wins += if p > n {
                1.0
            } else if p == n {
                0.5
            } else {
                0.0
            };
        }
    }
    wins / (pos.len() * neg.len()) as f64
}

impl CoachService {
    /// Per-player bot-likeness index for one replay. Separate from external detector reports
    /// and the built-in `is_bot` flag (shown only as an independent field).
    pub fn bot_likeness(&self, replay_id: &str) -> ServiceResult<Value> {
        let a = self.get_replay(replay_id)?;
        let players: Vec<Value> = a["players"].as_array().cloned().unwrap_or_default();
        let results: Vec<Value> = players
            .iter()
            .filter_map(|p| {
                let id = p["id"].as_str()?;
                let mut r = analyze_player(&a, id);
                r["name"] = p["name"].clone();
                r["builtin_bot_flag"] = json!(p["is_bot"] == true);
                Some(r)
            })
            .collect();
        Ok(
            json!({"replay_id":replay_id,"detector_version":DETECTOR_VERSION,"calibrated":false,
            "provenance":PROVENANCE,"players":results,
            "separate_from":"user-entered external detector reports and built-in is_bot flags"}),
        )
    }

    /// Record a user confirmation: `Some(true)` bot, `Some(false)` human, `None` unknown. The
    /// index is recomputed by the backend and stored with its detector version.
    pub fn set_bot_label(
        &self,
        replay_id: &str,
        player_id: &str,
        confirmed_bot: Option<bool>,
    ) -> ServiceResult<Value> {
        let a = self.get_replay(replay_id)?;
        let player = a["players"]
            .as_array()
            .and_then(|ps| ps.iter().find(|p| p["id"] == player_id))
            .ok_or("Player is not in this replay")?;
        let builtin = player["is_bot"] == true;
        let r = analyze_player(&a, player_id);
        let index = r["index"].as_f64();
        let resolvable = r["timing"]["cadence_resolvable"] == true;
        self.db.lock().map_err(err)?.execute(
            "INSERT INTO bot_labels VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(replay_id,player_id) DO UPDATE SET confirmed_bot=excluded.confirmed_bot,index_value=excluded.index_value,detector_version=excluded.detector_version,sample_count=excluded.sample_count,cadence_resolvable=excluded.cadence_resolvable,builtin_bot=excluded.builtin_bot,updated_at=excluded.updated_at",
            params![replay_id, player_id, confirmed_bot, index, DETECTOR_VERSION, r["sample_count"].as_u64().unwrap_or(0) as i64, resolvable, builtin, now()],
        ).map_err(err)?;
        Ok(
            json!({"replay_id":replay_id,"player_id":player_id,"confirmed_bot":confirmed_bot,"index":index,"detector_version":DETECTOR_VERSION}),
        )
    }

    pub fn bot_labels(&self) -> ServiceResult<Value> {
        let db = self.db.lock().map_err(err)?;
        let mut q = db.prepare("SELECT replay_id,player_id,confirmed_bot,index_value,detector_version,sample_count,cadence_resolvable,builtin_bot,updated_at FROM bot_labels ORDER BY updated_at DESC").map_err(err)?;
        let rows = q
            .query_map([], |r| {
                Ok(json!({
                    "replay_id":r.get::<_,String>(0)?,"player_id":r.get::<_,String>(1)?,
                    "confirmed_bot":r.get::<_,Option<i64>>(2)?.map(|v|v==1),"index":r.get::<_,Option<f64>>(3)?,
                    "detector_version":r.get::<_,String>(4)?,"sample_count":r.get::<_,i64>(5)?,
                    "cadence_resolvable":r.get::<_,i64>(6)?==1,"builtin_bot_flag":r.get::<_,i64>(7)?==1,"updated_at":r.get::<_,String>(8)?
                }))
            })
            .map_err(err)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(err)?;
        Ok(json!({"labels":rows,"provenance":"user-entered confirmations"}))
    }

    /// Descriptive AUC/threshold statistics on user labels. Returns "insufficient labels" until
    /// at least MIN_LABELS_PER_CLASS distinct players of both classes have a current-version index.
    pub fn bot_calibration_report(&self) -> ServiceResult<Value> {
        type Row = (String, Option<i64>, Option<f64>, String);
        let rows: Vec<Row> = {
            let db = self.db.lock().map_err(err)?;
            let mut q = db
                .prepare("SELECT player_id,confirmed_bot,index_value,detector_version FROM bot_labels")
                .map_err(err)?;
            let rows = q
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .map_err(err)?
                .collect::<Result<Vec<_>, _>>()
                .map_err(err)?;
            rows
        };
        let (mut unknown, mut stale, mut unscorable) = (0, 0, 0);
        let (mut pos, mut neg) = (vec![], vec![]);
        let (mut pos_players, mut neg_players) = (BTreeSet::new(), BTreeSet::new());
        for (player, label, index, version) in rows {
            let Some(label) = label else {
                unknown += 1;
                continue;
            };
            if version != DETECTOR_VERSION {
                stale += 1;
                continue;
            }
            let Some(index) = index else {
                unscorable += 1;
                continue;
            };
            if label == 1 {
                pos.push(index);
                pos_players.insert(player);
            } else {
                neg.push(index);
                neg_players.insert(player);
            }
        }
        let both: Vec<_> = pos_players.intersection(&neg_players).collect();
        let have = json!({"labelled_replays":pos.len()+neg.len(),"bot_labelled_replays":pos.len(),"human_labelled_replays":neg.len(),
            "bot_labels":pos.len(),"human_labels":neg.len(),"players_labelled_both_ways":both.len(),"distinct_bot_players":pos_players.len(),
            "distinct_human_players":neg_players.len(),"unknown":unknown,"other_detector_version":stale,"index_unavailable":unscorable});
        if pos_players.len() < MIN_LABELS_PER_CLASS || neg_players.len() < MIN_LABELS_PER_CLASS {
            return Ok(
                json!({"status":"insufficient labels","calibrated":false,"detector_version":DETECTOR_VERSION,
                "required":{"distinct_players_per_class":MIN_LABELS_PER_CLASS},"have":have,
                "note":"No threshold or accuracy is reported until both classes have enough distinct confirmed players. Include keyboard players among the human labels."}),
            );
        }
        let mut thresholds = vec![];
        for t in (0..=100).step_by(10) {
            let t = t as f64;
            let tp = pos.iter().filter(|v| **v >= t).count();
            let fp = neg.iter().filter(|v| **v >= t).count();
            let (tpr, fpr) = (tp as f64 / pos.len() as f64, fp as f64 / neg.len() as f64);
            thresholds.push(json!({"threshold":t,"true_positive_rate":tpr,"false_positive_rate":fpr,
                "precision_on_this_label_mix": if tp+fp>0 {Some(tp as f64/(tp+fp) as f64)} else {None},"youden_j":tpr-fpr,"true_positives":tp,"false_positives":fp}));
        }
        let best = thresholds
            .iter()
            .max_by(|a, b| {
                a["youden_j"]
                    .as_f64()
                    .unwrap()
                    .total_cmp(&b["youden_j"].as_f64().unwrap())
            })
            .cloned();
        Ok(
            json!({"status":"descriptive statistics on user labels","calibrated":false,"detector_version":DETECTOR_VERSION,
            "auc":auc(&pos,&neg),"have":have,"thresholds":thresholds,"in_sample_best_youden_threshold":best,"in_sample":true,
            "limitations":["All metrics here are in-sample: computed on the same labels that define them, with no held-out evaluation. The best-J threshold is not a decision cutoff.","Counts are labelled replays; the same player can contribute several replays, so effective sample size is the number of distinct players, not replays.","Labels are user-entered and unverified.","No held-out evaluation or confidence interval; small samples overfit.","Precision depends on the label mix, not on real-world bot prevalence.","These statistics do not turn the index into a probability of botting or cheating."]}),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Lcg(u64);
    impl Lcg {
        fn next(&mut self) -> u64 {
            self.0 = self
                .0
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            self.0 >> 33
        }
    }

    fn analysis(
        id: &str,
        player: &str,
        n: usize,
        dt: f64,
        mut f: impl FnMut(usize) -> (u8, u8, bool),
    ) -> Value {
        let frames: Vec<Value> = (0..n).map(|i| {
            let (th, st, jump) = f(i);
            json!({"time":i as f64*dt,"live_play":true,"discontinuity":false,"cars":[{"player_id":player,"discontinuity":false,"throttle":th,"steer":st,"jump_active":jump,"dodge_active":false}]})
        }).collect();
        json!({"summary":{"id":id,"mode":"1v1","blue_score":0,"orange_score":0,"played_at":"2026-10-03 12-00-00"},"players":[{"id":player,"team":0}],"coverage":{},"frames":frames,"events":[]})
    }

    const SNAP: [u8; 3] = [0, 128, 255];
    /// Discrete bot: new action chosen only on every second 30 Hz frame (8 ticks at 120 Hz).
    fn bot(rng: &mut Lcg) -> impl FnMut(usize) -> (u8, u8, bool) + '_ {
        let mut cur = (128, 128, false);
        move |i| {
            if i % 2 == 0 && rng.next().is_multiple_of(3) {
                cur = (
                    SNAP[(rng.next() % 3) as usize],
                    SNAP[(rng.next() % 3) as usize],
                    rng.next().is_multiple_of(6),
                );
            }
            cur
        }
    }

    #[test]
    fn discrete_grid_stream_scores_above_keyboard_above_analog() {
        let (n, dt) = (3600, 1.0 / 30.0);
        let mut r1 = Lcg(1);
        let b = analyze_player(&analysis("b", "p", n, dt, bot(&mut r1)), "p");
        // Keyboard-like: same digital values, but holds of random length starting on any frame.
        let mut r2 = Lcg(2);
        let (mut left, mut cur) = (0u64, (128u8, 128u8, false));
        let k = analyze_player(
            &analysis("k", "p", n, dt, |_| {
                if left == 0 {
                    left = 1 + r2.next() % 14;
                    cur = (
                        SNAP[(r2.next() % 3) as usize],
                        SNAP[(r2.next() % 3) as usize],
                        r2.next().is_multiple_of(9),
                    );
                }
                left -= 1;
                cur
            }),
            "p",
        );
        // Analog: smoothly varying stick with noise.
        let mut r3 = Lcg(3);
        let h = analyze_player(
            &analysis("h", "p", n, dt, |i| {
                let s = (128.0 + 100.0 * ((i as f64) / 17.0).sin() + (r3.next() % 9) as f64) as u8;
                let t = (128.0 + 90.0 * ((i as f64) / 31.0).cos()) as u8;
                (t, s, false)
            }),
            "p",
        );
        for r in [&b, &k, &h] {
            assert_eq!(r["status"], "ok", "{r}");
            assert_eq!(r["calibrated"], false);
            assert_eq!(r["provenance"], "local heuristic");
            assert!(r["confounders"]
                .as_array()
                .unwrap()
                .iter()
                .any(|c| c.as_str().unwrap().contains("Keyboard")));
        }
        let (bi, ki, hi) = (
            b["index"].as_f64().unwrap(),
            k["index"].as_f64().unwrap(),
            h["index"].as_f64().unwrap(),
        );
        assert!(
            bi > ki + 20.0 && ki > hi + 20.0,
            "bot {bi} keyboard {ki} analog {hi}"
        );
        assert!(bi > 85.0 && hi < 25.0, "bot {bi} analog {hi}");
        assert_eq!(b["timing"]["cadence_resolvable"], true);
        let cadence = |r: &Value| {
            r["signals"]
                .as_array()
                .unwrap()
                .iter()
                .find(|s| s["name"] == "action_change_cadence")
                .unwrap()["value"]
                .as_f64()
                .unwrap()
        };
        assert!(
            cadence(&b) > 0.8 && cadence(&k) < 0.3,
            "{} {}",
            cadence(&b),
            cadence(&k)
        );
    }

    #[test]
    fn coarse_sampling_makes_cadence_unavailable_not_zero() {
        let mut r = Lcg(4);
        let out = analyze_player(&analysis("c", "p", 1200, 0.1, bot(&mut r)), "p");
        assert_eq!(out["timing"]["cadence_resolvable"], false);
        let s = out["signals"].as_array().unwrap();
        assert!(s
            .iter()
            .filter(|x| {
                let n = x["name"].as_str().unwrap();
                n.contains("cadence") || n.contains("grid")
            })
            .all(|x| x["value"].is_null()));
        assert_eq!(out["basis"], "discreteness only");
    }

    #[test]
    fn missing_or_short_input_is_unavailable_never_neutral() {
        let mut a = analysis("m", "p", 2000, 1.0 / 30.0, |_| (128, 128, false));
        for f in a["frames"].as_array_mut().unwrap() {
            f["cars"][0].as_object_mut().unwrap().remove("throttle");
            f["cars"][0].as_object_mut().unwrap().remove("steer");
        }
        let out = analyze_player(&a, "p");
        assert_eq!(out["status"], "unavailable");
        assert!(out["index"].is_null() && out["reason"].as_str().unwrap().contains("analysis-3"));
        let short = analyze_player(
            &analysis("s", "p", 100, 1.0 / 30.0, |_| (128, 128, false)),
            "p",
        );
        assert_eq!(short["status"], "unavailable");
    }

    #[test]
    fn discontinuities_and_non_live_frames_split_segments() {
        let mut a = analysis("d", "p", 1000, 1.0 / 30.0, |_| (128, 128, false));
        let f = a["frames"].as_array_mut().unwrap();
        f[500]["discontinuity"] = json!(true);
        for fr in f.iter_mut().skip(700).take(20) {
            fr["live_play"] = json!(false);
        }
        f[900]["cars"][0]["discontinuity"] = json!(true);
        let (segs, _, live) = segments(&a, "p");
        assert_eq!(live, 980);
        assert_eq!(segs.len(), 4);
        assert!(segs.iter().all(|s| s.windows(2).all(|w| w[1].t > w[0].t)));
        assert_eq!(segs.iter().map(Vec::len).sum::<usize>(), 980);
    }

    #[test]
    fn labels_calibration_requires_both_classes_then_reports_auc() {
        let dir = std::env::temp_dir().join(format!("antirl-botlike-{}", ident()));
        let s = CoachService::open(&dir).unwrap();
        assert_eq!(
            s.bot_calibration_report().unwrap()["status"],
            "insufficient labels"
        );
        for i in 0..MIN_LABELS_PER_CLASS * 2 {
            let is_bot = i % 2 == 0;
            let (id, player) = (format!("r{i}"), format!("pl{i}"));
            let mut rng = Lcg(100 + i as u64);
            let a = if is_bot {
                analysis(&id, &player, 1500, 1.0 / 30.0, bot(&mut rng))
            } else {
                analysis(&id, &player, 1500, 1.0 / 30.0, |k| {
                    (128 + (k % 50) as u8, 100 + (k % 37) as u8, false)
                })
            };
            s.save_replay(&a).unwrap();
            s.set_bot_label(&id, &player, Some(is_bot)).unwrap();
            if i == 5 {
                assert_eq!(
                    s.bot_calibration_report().unwrap()["status"],
                    "insufficient labels"
                );
            }
        }
        s.set_bot_label("r0", "pl0", None).unwrap();
        assert_eq!(
            s.bot_calibration_report().unwrap()["status"],
            "insufficient labels"
        );
        s.set_bot_label("r0", "pl0", Some(true)).unwrap();
        let rep = s.bot_calibration_report().unwrap();
        assert_eq!(rep["calibrated"], false);
        assert_eq!(rep["auc"].as_f64(), Some(1.0), "{rep}");
        assert!(rep["in_sample_best_youden_threshold"]["youden_j"].as_f64().unwrap() > 0.9);
        assert!(s.set_bot_label("r0", "nobody", Some(true)).is_err());
        assert_eq!(
            s.bot_labels().unwrap()["labels"].as_array().unwrap().len(),
            MIN_LABELS_PER_CLASS * 2
        );
        let live = s.bot_likeness("r1").unwrap();
        assert_eq!(live["players"][0]["builtin_bot_flag"], false);
        drop(s);
        let _ = fs::remove_dir_all(dir);
    }

    /// Real replays: set ANTIRL_DETECTOR_REPLAYS to a directory of .replay files (read-only).
    #[test]
    fn real_replays_when_provided() {
        let Some(dir) = std::env::var_os("ANTIRL_DETECTOR_REPLAYS") else {
            eprintln!("SKIPPED: ANTIRL_DETECTOR_REPLAYS not set; real-replay detection unavailable here");
            return;
        };
        for e in fs::read_dir(dir).unwrap().flatten().take(3) {
            let path = e.path();
            if path.extension().is_none_or(|x| x != "replay") {
                continue;
            }
            let bytes = replay_core::read_replay(&path).unwrap();
            let a = replay_core::decode(&path, &bytes).unwrap();
            let v = serde_json::to_value(&a).unwrap();
            for p in v["players"].as_array().unwrap() {
                let r = analyze_player(&v, p["id"].as_str().unwrap());
                eprintln!(
                    "{} {} bot_flag={} status={} index={} samples={} cadence={} basis={}",
                    path.file_name().unwrap().to_string_lossy(),
                    p["name"],
                    p["is_bot"],
                    r["status"],
                    r["index"],
                    r["sample_count"],
                    r["timing"]["cadence_resolvable"],
                    r["basis"]
                );
            }
        }
    }
}
