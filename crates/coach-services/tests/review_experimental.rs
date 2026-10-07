// Review-only verbatim production model helper characterization.
#![allow(dead_code, unused_imports)]
use serde_json::{json, Value};
use std::{
    collections::{BTreeSet, HashMap},
    ffi::OsString,
    io::Read,
    path::Path,
    process::{Command, Stdio},
    sync::{Arc, Mutex as StdMutex},
    time::{Duration, Instant},
};
type ServiceResult<T> = Result<T, String>;
mod detector {
    use super::*;
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
        let (sum, weight) =
            signals
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

    #[test]
    fn review_fifteen_hz_keyboard_scores_maximum_without_cadence() {
        let a = json!({"frames":(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"keyboard","throttle":255,"steer":([0,128,255][i%3]),"jump_active":false,"dodge_active":false}]})).collect::<Vec<_>>()});
        let r = analyze_player(&a, "keyboard");
        assert_eq!(r["status"], "ok");
        assert_eq!(r["index"], 100.);
        assert_eq!(r["timing"]["cadence_resolvable"], false);
        assert_eq!(r["basis"], "discreteness only");
        println!("REVIEW_KEYBOARD_DETECTOR {}", r);
    }
    #[test]
    fn review_validation_analog_controls_score_lower_at_same_rate() {
        let a = json!({"frames":(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"analog","throttle":i%256,"steer":(i*7)%256,"jump_active":false,"dodge_active":false}]})).collect::<Vec<_>>()});
        let r = analyze_player(&a, "analog");
        assert_eq!(r["status"], "ok");
        assert_eq!(r["timing"]["cadence_resolvable"], false);
        assert!(r["index"].as_f64().unwrap() < 10.);
        println!("REVIEW_ANALOG_CONTROL_INDEX {}", r["index"]);
    }
}
mod xg {
    use super::*;
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

    fn sample() -> Value {
        json!({"summary":{"id":"m"},"players":[{"id":"p","team":0},{"id":"other","team":1}],"shots":[{"kind":"shot","time":1.,"player_id":"p","team":0,"shot":{"ball_position":[0,4120,100],"ball_speed":2000}}],"frames":[{"time":1.,"cars":[{"player_id":"other","position":[0,4800,17]}]}],"events":[]})
    }
    #[test]
    fn review_xg_metres_are_off_by_ten() {
        let e = extract(&sample());
        let f = e.rows[0].feats.unwrap();
        assert_eq!(FEATURES[0], "distance_to_goal_m");
        assert_eq!(f[0], 1.); //1000uu is10m.
        assert_eq!(FEATURES[3], "ball_height_m");
        assert_eq!(f[3], 0.1); //100uu is1m.
    }
    #[test]
    fn review_goal_after_opponent_touch_still_labels_old_shot_goal() {
        let mut a = sample();
        a["events"] = json!([{"category":"touch","player_id":"other","team":1,"time":4.},{"category":"goal","team":0,"player_id":"p","time":8.}]);
        assert!(extract(&a).rows[0].goal);
    }
    #[test]
    fn review_missing_one_defender_treated_as_complete_feature() {
        let mut a = sample();
        a["players"]
            .as_array_mut()
            .unwrap()
            .push(json!({"id":"missing","team":1}));
        assert_eq!(defenders(&a, 1., 0, [0., 4120., 100.]), Some(1.));
    }
}
mod sim {
    use super::*;
    fn f(v: &Value) -> Option<f64> {
        v.as_f64().filter(|n| n.is_finite())
    }
    fn vec3(v: &Value) -> Option<[f64; 3]> {
        let a = v.as_array().filter(|a| a.len() == 3)?;
        Some([f(&a[0])?, f(&a[1])?, f(&a[2])?])
    }
    fn quat(v: &Value) -> Option<[f64; 4]> {
        let a = v.as_array().filter(|a| a.len() == 4)?;
        let q = [f(&a[0])?, f(&a[1])?, f(&a[2])?, f(&a[3])?];
        let n: f64 = q.iter().map(|x| x * x).sum();
        (0.8..1.2).contains(&n).then_some(q)
    }
    fn dist(a: [f64; 3], b: [f64; 3]) -> f64 {
        ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
    }

    const CONTACT_UU: f64 = 300.;
    const MAX_WINDOW_S: f64 = 2.;
    const MIN_WINDOW_S: f64 = 0.75;
    fn free_frame(fr: &Value) -> bool {
        if fr["live_play"] != true || fr["discontinuity"] == true {
            return false;
        }
        let Some(ball) = vec3(&fr["ball"]["position"]) else {
            return false;
        };
        if vec3(&fr["ball"]["velocity"]).is_none()
            || vec3(&fr["ball"]["angular_velocity"]).is_none()
        {
            return false;
        }
        fr["cars"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|c| vec3(&c["position"]))
            .all(|p| dist(p, ball) > CONTACT_UU)
    }
    /// The free-flight leg that ENDS at frame `idx` (the requested state frame): (first simulated
    /// frame, last compared frame == idx, trimmed to the last MAX_WINDOW_S). None when `idx` itself is
    /// not a free-flight frame (mid-contact, gap, non-live), or the leg is shorter than MIN_WINDOW_S.
    pub fn free_flight_window(frames: &[Value], idx: usize) -> Option<(usize, usize)> {
        let t = |i: usize| f(&frames[i]["time"]);
        if idx >= frames.len() || !free_frame(&frames[idx]) {
            return None;
        }
        let end = idx;
        let mut start = end;
        while start > 0 && free_frame(&frames[start - 1]) {
            let (a, b) = (f(&frames[start - 1]["time"])?, t(start)?);
            let jump = dist(
                vec3(&frames[start - 1]["ball"]["position"])?,
                vec3(&frames[start]["ball"]["position"])?,
            );
            if b <= a || jump / (b - a) > 7000.0 {
                break;
            }
            start -= 1;
        }
        let tend = t(end)?;
        let first = (start + 1..end).find(|&i| t(i).is_some_and(|x| tend - x <= MAX_WINDOW_S))?;
        (tend - t(first)? >= MIN_WINDOW_S).then_some((first, end))
    }
    /// Compares the engine's ball path (time since start, position) with the recorded one by linear
    /// interpolation between recorded frames. Returns (max, mean, samples) in uu.
    pub fn compare_ball_path(
        engine: &[(f64, [f64; 3])],
        frames: &[Value],
        first: usize,
        last: usize,
    ) -> Option<(f64, f64, usize)> {
        let t0 = f(&frames[first]["time"])?;
        let (mut max, mut sum, mut n) = (0.0f64, 0.0f64, 0usize);
        for (dt, pos) in engine {
            let at = t0 + dt;
            let hi = (first..=last).find(|&i| f(&frames[i]["time"]).is_some_and(|t| t >= at));
            let Some(hi) = hi else { continue };
            let b = vec3(&frames[hi]["ball"]["position"])?;
            let th = f(&frames[hi]["time"])?;
            let rec = if hi == first || (th - at).abs() < 1e-9 {
                b
            } else {
                let a = vec3(&frames[hi - 1]["ball"]["position"])?;
                let tl = f(&frames[hi - 1]["time"])?;
                let k = ((at - tl) / (th - tl)).clamp(0.0, 1.0);
                [
                    a[0] + (b[0] - a[0]) * k,
                    a[1] + (b[1] - a[1]) * k,
                    a[2] + (b[2] - a[2]) * k,
                ]
            };
            let e = dist(*pos, rec);
            max = max.max(e);
            sum += e;
            n += 1;
        }
        (n >= 8).then(|| (max, sum / n as f64, n))
    }

    pub struct EngineRun {
        pub stdout: Vec<u8>,
        pub stderr: String,
        pub code: Option<i32>,
    }
    /// Runs `exe` with an argument vector (never a shell string), a wall-clock timeout and an output
    /// cap. The child is killed on timeout or when stdout exceeds `max_out`.
    pub fn run_engine(
        exe: &Path,
        cwd: &Path,
        args: &[OsString],
        timeout: Duration,
        max_out: usize,
    ) -> Result<EngineRun, String> {
        let mut child = Command::new(exe)
            .args(args)
            .current_dir(cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Engine could not be started: {e}"))?;
        let out = Arc::new(StdMutex::new((Vec::<u8>::new(), false)));
        let errs = Arc::new(StdMutex::new(Vec::<u8>::new()));
        let mut pipe_out = child.stdout.take().ok_or("no stdout")?;
        let mut pipe_err = child.stderr.take().ok_or("no stderr")?;
        let o = out.clone();
        let t1 = std::thread::spawn(move || {
            let mut buf = [0u8; 16384];
            while let Ok(n) = pipe_out.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut g = o.lock().unwrap();
                g.0.extend_from_slice(&buf[..n]);
                if g.0.len() > max_out {
                    g.1 = true;
                    break;
                }
            }
        });
        let e = errs.clone();
        let t2 = std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            while let Ok(n) = pipe_err.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut g = e.lock().unwrap();
                if g.len() < 16 * 1024 {
                    g.extend_from_slice(&buf[..n]);
                }
            }
        });
        let start = Instant::now();
        let mut failure = None;
        let status = loop {
            if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
                break Some(s);
            }
            if out.lock().unwrap().1 {
                failure = Some(format!(
                    "Engine output exceeded {max_out} bytes and was stopped"
                ));
            } else if start.elapsed() > timeout {
                failure = Some(format!(
                    "Engine timed out after {} s and was stopped",
                    timeout.as_secs()
                ));
            }
            if failure.is_some() {
                kill_tree(child.id());
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
            std::thread::sleep(Duration::from_millis(15));
        };
        // After a kill the readers are left to end on their own: a grandchild process could still
        // hold the pipes, and a stopped run must not block on it.
        if let Some(f) = failure {
            return Err(f);
        }
        let _ = t1.join();
        if out.lock().unwrap().1 {
            return Err(format!(
                "Engine output exceeded {max_out} bytes and was discarded"
            ));
        }
        let _ = t2.join();
        let stdout = std::mem::take(&mut out.lock().unwrap().0);
        let stderr = String::from_utf8_lossy(&errs.lock().unwrap())
            .chars()
            .take(2000)
            .collect();
        Ok(EngineRun {
            stdout,
            stderr,
            code: status.and_then(|s| s.code()),
        })
    }
    /// Best effort: ends the child and everything it started. std has no process groups on Windows,
    /// so `taskkill /T` is used instead of a job object; a grandchild that detaches itself escapes.
    fn kill_tree(pid: u32) {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x0800_0000)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(not(windows))]
        let _ = pid;
    }
    pub enum EngineOutcome {
        Ok(Vec<Value>),
        /// The engine reported an error line (gate refusal or invalid state): (code, gate, message).
        Refused(String, bool, String),
    }
    pub fn parse_engine_output(run: &EngineRun) -> Result<EngineOutcome, String> {
        let text = String::from_utf8_lossy(&run.stdout);
        let lines: Vec<Value> = text
            .lines()
            .filter_map(|l| serde_json::from_str::<Value>(l.trim()).ok())
            .filter(|v| v.is_object())
            .collect();
        if let Some(e) = lines.iter().find(|l| l["type"] == "error") {
            return Ok(EngineOutcome::Refused(
                e["code"].as_str().unwrap_or("engine_error").into(),
                e["gate"] == true,
                e["message"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(500)
                    .collect(),
            ));
        }
        if run.code != Some(0) {
            return Err(format!(
                "Engine exited with code {:?}: {}",
                run.code,
                run.stderr.trim()
            ));
        }
        let start = lines.iter().any(|l| l["type"] == "rollout_start");
        let end = lines.iter().any(|l| l["type"] == "rollout_end");
        if !start || !end {
            return Err("Engine output was incomplete (no rollout_start/rollout_end)".into());
        }
        Ok(EngineOutcome::Ok(lines))
    }
}

#[test]
fn review_ball_validation_accepts_eight_duplicate_start_samples() {
    let frames: Vec<Value> = (0..30)
        .map(|i| json!({"time":i as f64/15.,"ball":{"position":[i as f64*100.,0.,500.]}}))
        .collect();
    let duplicates = vec![(0., [0., 0., 500.]); 8];
    let (max, mean, n) = sim::compare_ball_path(&duplicates, &frames, 0, 29).unwrap();
    assert_eq!((max, mean, n), (0., 0., 8));
}
#[test]
fn review_validation_ball_normal_path_passes_and_bad_path_fails() {
    let frames: Vec<Value> = (0..30)
        .map(|i| json!({"time":i as f64/15.,"ball":{"position":[i as f64*100.,0.,500.]}}))
        .collect();
    let good: Vec<_> = (0..30)
        .map(|i| (i as f64 / 15., [i as f64 * 100., 0., 500.]))
        .collect();
    let bad: Vec<_> = (0..30)
        .map(|i| (i as f64 / 15., [i as f64 * 100. + 200., 0., 500.]))
        .collect();
    let (max, mean, n) = sim::compare_ball_path(&good, &frames, 0, 29).unwrap();
    assert_eq!((max, mean, n), (0., 0., 30));
    let (max, mean, n) = sim::compare_ball_path(&bad, &frames, 0, 29).unwrap();
    assert_eq!((max, mean, n), (200., 200., 30));
}
#[test]
#[ignore = "Internal review subprocess helper"]
fn review_pipe_inherited_holder() {
    std::thread::sleep(Duration::from_millis(900));
}
#[test]
#[ignore = "Internal review subprocess helper"]
#[allow(clippy::zombie_processes)]
fn review_pipe_holder_child() {
    Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "review_pipe_inherited_holder",
            "--ignored",
            "--nocapture",
        ])
        .spawn()
        .unwrap();
}
#[test]
fn review_engine_timeout_does_not_cover_readers_after_parent_exit() {
    let started = Instant::now();
    let exe = std::env::current_exe().unwrap();
    let out = sim::run_engine(
        &exe,
        exe.parent().unwrap(),
        &[
            "--exact".into(),
            "review_pipe_holder_child".into(),
            "--ignored".into(),
            "--nocapture".into(),
        ],
        Duration::from_millis(100),
        100_000,
    )
    .unwrap();
    assert_eq!(out.code, Some(0));
    assert!(started.elapsed() > Duration::from_millis(800));
    println!(
        "REVIEW_ENGINE100MS_TIMEOUT_ACTUAL_MS {}",
        started.elapsed().as_millis()
    );
}
#[test]
fn review_xg_status_pools_modes_and_nonpersonal_matches() {
    let tmp = tempfile::tempdir().unwrap();
    let service = coach_services::CoachService::open(tmp.path()).unwrap();
    service
        .save_settings(
            json!({"provider":"none","player_id":"me","replay_folder":"","auto_import":false}),
        )
        .unwrap();
    for (i, mode) in ["1v1", "3v3"].iter().enumerate() {
        let a = json!({"summary":{"id":format!("other-{i}"),"mode":mode},"analysis_version":replay_core::ANALYSIS_VERSION,"players":[{"id":"other-person","team":0},{"id":"opponent","team":1}],"shots":[{"kind":"shot","time":1,"player_id":"other-person","team":0,"shot":{"ball_position":[0,4120,100],"ball_speed":2000}}],"frames":[{"time":1,"cars":[{"player_id":"opponent","position":[0,4800,17]}]}],"events":[]});
        service.save_replay(&a).unwrap();
    }
    let out = service.xg_model_status().unwrap();
    assert_eq!(out["n_shots"], 2);
    assert_eq!(out["n_matches"], 2);
    println!("REVIEW_XG_NONPERSONAL_MODE_POOLED {}", out);
}
#[test]
fn review_engine_envelope_accepts_missing_decision_geometry() {
    let run=sim::EngineRun{stdout:b"{\"type\":\"rollout_start\"}\n{\"type\":\"decision\",\"step\":-1,\"ball\":null,\"cars\":[]}\n{\"type\":\"rollout_end\"}\n".to_vec(),stderr:String::new(),code:Some(0)};
    assert!(matches!(
        sim::parse_engine_output(&run).unwrap(),
        sim::EngineOutcome::Ok(_)
    ));
}
#[test]
fn review_validation_saved_human_label_keeps_high_bot_badge_eligible_index() {
    let tmp = tempfile::tempdir().unwrap();
    let service = coach_services::CoachService::open(tmp.path()).unwrap();
    let frames:Vec<_>=(0..1200).map(|i|json!({"time":i as f64/15.,"live_play":true,"cars":[{"player_id":"keyboard","throttle":255,"steer":([0,128,255][i%3]),"jump_active":false,"dodge_active":false}]})).collect();
    let a = json!({"summary":{"id":"keyboard-game","mode":"2v2"},"analysis_version":replay_core::ANALYSIS_VERSION,"players":[{"id":"keyboard","name":"Synthetic keyboard player","team":0,"is_bot":false}],"frames":frames,"events":[],"metrics":[]});
    service.save_replay(&a).unwrap();
    service
        .set_bot_label("keyboard-game", "keyboard", Some(false))
        .unwrap();
    let labels = service.bot_labels().unwrap();
    let l = &labels["labels"][0];
    assert_eq!(l["confirmed_bot"], false);
    assert_eq!(l["index"], 100.);
    println!("REVIEW_CONFIRMED_HUMAN_BADGE_ELIGIBLE {}", l);
}
