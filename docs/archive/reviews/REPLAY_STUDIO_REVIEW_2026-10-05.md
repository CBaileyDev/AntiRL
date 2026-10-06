# Replay Studio improvement and validation

## Delivered

- Removed the radar canvas, overlay, toggle, styling, and per-frame drawing.
- Converted RLViser's publicly cached Octane and default ball geometry into shared
  mesh buffers. Included the original ball texture, converted to 1024px WebP.
  This initial asset conversion is superseded by the mesh fidelity follow-up in
  `MESH_FIDELITY_REVIEW_2026-10-05.md`. All cars use an Octane visual proxy.
- Brighter turf with field markings, stadium seating, team goals, and all 34
  standard boost landmarks. Blue goal is replay Y-negative / renderer Z-positive.
  Pickup availability is not decoded and is explicitly distinguished from landmarks.
- Player Chase and Ball Cam now both follow the selected car using zen's published
  110 horizontal FOV, 270 distance, 100 height, -3 pitch, 0.35 stiffness preset.
  The smoothing response approximates the proprietary game controller; it does not
  claim to reproduce Rocket League's internal camera algorithm. Ground heading is
  retained when the car points vertically. Bounds include the goal tunnel.
- Switching from Overhead to Orbit restores perspective and a usable orbit angle.
  Camera state resets on seeks, discontinuities, and perspective changes. During
  a demolition the selected perspective retains its last pose instead of silently
  following another player.
- Recorded ball quaternion interpolation replaces invented rolling motion.
  Trail buffers reset after recorded transforms on seeks, never streaking from
  the old pose. Car trails only appear with observed supersonic velocity.
- Live score is reconstructed from final score and timestamped remaining goals;
  the header keeps the separately labeled final result. Negative clock values
  display as overtime.
- Separate playback and camera rows, container-based responsive layout, stable
  Play button, labeled controls, keyboard shortcuts, and fullscreen viewer.
- Removed all three fixed coaching narratives and the unverified training-pack
  code. Review cards now use actual events, player/team scope, confidence,
  timestamps, recorded descriptions, and clearly framed review questions.
  All event pages are accessible, with category and player filters.
- Coach handoffs carry replay ID, event ID/time, selected player's ID/name,
  and an explicit request to distinguish evidence from interpretation.

## Performance changes

- Playback and Orbit rendering capped at 60 FPS; automatic paused views at 15 FPS.
  Hidden documents skip rendering and playback advancement. Absolute deadline
  remainders preserve the intended rate on high-refresh displays.
- Playback clock feeds the renderer directly while React/HUD notifications are
  limited to 10 Hz. Sidebar filters/metrics are memoized.
- Binary search for current frame and frame stepping. Car lookup maps are rebuilt
  only when the recorded frame changes, avoiding nested per-render searches.
- Shared car geometry/materials, static arena transforms, 1024px soft-shadow map,
  lower glow cost, and a HiDPI rendering cap. Removed unused WebGPU engine export.
  The viewer engine bundle dropped from 489.30KB to 238.08KB (gzip 123.18KB to 60.57KB).
- Initialization and disposal checks protect scene cleanup during async loading.

## Validation

- `pnpm --dir app build`: TypeScript check and production bundle passed.
- `node scripts/test-replay-studio.mjs`: frame boundaries, camera scale, vertical
  heading, ball tracking, goal bounds, FPS-independent damping, perspective event
  scope, live score, and mesh index/buffer integrity passed.
- `cargo test --workspace`: 12 tests passed, 0 failed; the existing explicit live
  synthetic probe remains ignored by default.
- `cargo build -p antirl --release --features custom-protocol`: passed.
- Browser QA used a read-only copy of one existing local replay (4,575 frames,
  four players) in an ignored fixture, outside production entry points.
- 1920/1440px: viewer and notes side by side. 1280/1024px: notes stack below.
  No page overflow and no playback/camera button exceeded viewer bounds.
- All five cameras, play/pause, event seek pausing, repeated lead-in seeks,
  category filters, later event pages, selected Coach context, fullscreen entry
  and exit passed. No application console errors (initial QA favicon 404 only).
- Paused rendering: 18 frames in 1.2 seconds. Playback rendering after the cap:
  145 frames in 2.4 seconds, ~1.16ms mean CPU render duration in the automated
  Chromium test. Before the cap, that uncapped environment rendered 1,035 frames
  in 2.4 seconds. These are local browser measurements, not universal GPU results.
- Packaged WebView2 app visually inspected at its 1440x900 normal window and
  fullscreen. Geometry, textures, controls, and event panel rendered correctly.

## Architecture decision and remaining fidelity limits

[RLViser](https://github.com/VirxEC/rlviser) is a separate Bevy/RocketSim visualizer,
not a Babylon component. Its asset cache is useful without replacing the desktop
renderer. Provenance and upstream license are in `app/public/viewer/SOURCES.md`.

[replay-to-rocketsim](https://github.com/VirxEC/replay-to-rocketsim) reconstructs
120Hz simulated snapshots between sparse replay updates and documents imperfect
resimulation. Integrating it requires collision assets, version compatibility,
and corpus comparisons at authoritative timestamps. That is a separate optional
motion reconstruction layer. This change retains recorded-position interpolation
so simulated motion cannot become invented coaching evidence.

The stadium is an approximation, not the selected map's original art. Replay
loadouts, boost-pad cooldowns, exact native camera dynamics, goal explosions, and
RocketSim resimulation are not implemented. A geometry/appearance proxy must not
be presented as original-game pixel identity. Longer-session and other-hardware
performance testing remain outside the local checks above.

## Sources

- RLViser camera, mesh, asset, and cache loader source; public `cache.zip`.
- [BLAST zen profile](https://blast.tv/rl/player/0f1c26cc/zen), camera settings
  checked 2026-10-05.
- [RLGym standard boost coordinates](https://github.com/RLGym/rlgym/blob/main/rlgym/rocket_league/common_values.py).
- replay-to-rocketsim README, reconstruction methodology and fidelity limits.
