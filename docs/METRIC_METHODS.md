# AntiRL Metric & Detector Methods Documentation

Version: 1.0.0
Inspection Date: 2026-10-05

All metrics and tactical events in AntiRL are derived from genuine Rocket League network frames extracted locally using `boxcars` (0.12.0) and `subtr-actor` (1.4.0). AntiRL maintains an evidence standard: observations are reproducible calculations with explicit units, coverage, and provenance.

---

## 1. Coordinate and Unit Conventions

- **Coordinate System**: Rocket League Unreal Units (Z-up, X-right, Y-forward).
  - Blue defends negative Y (`Y < 0`), Orange defends positive Y (`Y > 0`).
  - Field Dimensions: ~8192 units wide (`-4096..4096`), ~10240 units long (`-5120..5120`), ~2048 units ceiling.
  - Goal Width: 1786 units (`-893..893`), Height: 643 units.
  - Ball Diameter: 186.4 units.
- **Render Transform**: AntiRL maps Unreal units to Babylon 3D scene units via:
  ```ts
  const pos = (p: number[]) => new Vector3(p[0] * 0.01, p[2] * 0.01, -p[1] * 0.01);
  ```
- **Time Bases**: Canonical replay elapsed seconds (monotonic, native frame-anchored) is stored separately from match clock seconds remaining.
- **Boost Normalization**: Raw replay actor boost values are integers `0..255`. AntiRL normalizes them to percentages `0.0..100.0%` via `clamp(raw / 2.55, 0.0, 100.0)`. Missing boost is represented as `None`/`null`, never coerced to zero.

---

## 2. Implemented Telemetry Metrics

| Metric Key | Label | Units | Method & Formula | Limitations & Missing Data Behavior |
|---|---|---|---|---|
| `tracked_seconds` | Measured active play | Seconds (`s`) | \(\sum \Delta t\) where `live_play == true` and car rigid body is observed. Excludes pre-kickoff countdowns and goal replay sequences. | Excludes stoppages and disconnected players. |
| `avg_boost` | Average boost | Percentage (`%`) | \(\frac{\int \text{boost}(t) dt}{\int dt}\) during active play. Time-weighted integral over frames with valid boost level. | Excludes frames where player boost actor was despawned or unobserved. |
| `low_boost_pct` | Time below 10 boost | Percentage (`%`) | \(\frac{\text{seconds}(\text{boost} < 10.0)}{\text{tracked\_seconds}} \times 100\). | Resource measurement, not a fault determination. Pressure and starve phases can force low boost. |
| `avg_speed` | Average speed | Unreal units/sec (`uu/s`) | \(\frac{\int \|\vec{v}(t)\| dt}{\int dt}\) for linear velocity vectors. | Replicated velocity depends on network snapshot rates. Does not measure decision quality. |
| `supersonic_boost_seconds` | Boosting at supersonic speed | Seconds (`s`) | Cumulative duration where \(\|\vec{v}\| \ge 2200\text{ uu/s}\) and `boost_active == true`. | Aerial direction changes and turning speed maintenance may justify brief supersonic boost. |
| `defensive_half_pct` | Time in defensive half | Percentage (`%`) | Time-weighted share of active play where \(y \times \text{team\_sign} < 0\). | Measures spatial positioning, not defensive rotation quality or shadow effectiveness. |
| `ahead_ball_pct` | Time ahead of ball | Percentage (`%`) | Time-weighted share where \(y_{\text{car}} \times \text{sign} > y_{\text{ball}} \times \text{sign} + 200\text{ uu}\). | Can be advantageous when receiving upfield passes or demoing retreating opponents. |
| `avg_ball_distance` | Average ball separation | Unreal units (`uu`) | \(\frac{\int \|\vec{p}_{\text{car}} - \vec{p}_{\text{ball}}\| dt}{\int dt}\). | Positional separation has no universal optimum; varies by 1st vs 2nd man role. |
| `touches` | Estimated ball contacts | Count | Extracted from `subtr-actor` contact attribution graph using hitbox proximity & team touch markers. | Heuristic contact attribution; contacts can be missed or misattributed in crowded 50-50s. |

---

## 3. Tactical Event Detectors

### A. Extended Low-Boost Window
- **Category**: `boost`
- **Trigger**: Player's observed boost remains `< 10.0%` continuously for \(\ge 5.0\) seconds of live play without discontinuity.
- **Output**: Event with start and end timestamps, linking to metric `low_boost_pct`.
- **Review Advice**: Evaluates whether small-pad collection paths were available through central/perimeter arcs while maintaining play involvement.

### B. Supersonic Boost Waste
- **Category**: `boost`
- **Trigger**: Linear velocity \(\ge 2200\text{ uu/s}\) while `boost_active == true` continuously for \(\ge 1.0\) second.
- **Output**: Event with start and end timestamps, linking to metric `supersonic_boost_seconds`.
- **Review Advice**: Marks boost-active windows at >=2200 uu/s for contextual review. This differs from total supersonic uptime and from the 2300 uu/s cap; it does not establish wasted boost.

### C. Defensive Exposure Window
- **Category**: `rotation` / `coverage`
- **Trigger**: When defending deep in own half (\(y_{\text{ball}} \times \text{sign} < -500\text{ uu}\)), all observable teammates are positioned upfield of the ball (\(y_{\text{car}} \times \text{sign} > y_{\text{ball}} \times \text{sign} + 400\text{ uu}\)) continuously for \(\ge 1.0\) second.
- **Output**: Team-scoped tactical event with start and end timestamps.
- **Review Advice**: Visual review cue to verify individual recovery routes and transition speed. Not an automated fault verdict on the nearest defender.

### D. Goals and Demolitions
- **Category**: `goal` / `demo`
- **Trigger**: Replay header goal tables and native demolition events anchored to exact network frame timestamps.
- **Output**: Explicit factual event markers with scorer/attacker attribution.

The authoritative versioned dictionary is `app/src/data/metrics.json` (metrics-2). Old equal-match aggregates lacking sufficient statistics remain labelled legacy estimates.
