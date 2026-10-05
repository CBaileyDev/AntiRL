# Replay Studio mesh fidelity follow-up

## Problem and change

The reported segment is the first imported Park_P replay at approximately 35.074s,
with the local player's car driving across the diagonal corner wall. Recorded poses
were correct, but the old renderer showed flat box walls and almost invisible curved
collision geometry. Its wheels were oversized cylinder placeholders.

- The visible driving surface now uses the actual existing RocketSim standard-arena
  collision triangles: lower coves, diagonal corners, back walls and goal tunnels.
  The two flat side planes omitted from RocketSim's mesh cache are explicitly drawn.
- Original RLViser standard-field modules replace fabricated goal posts and flat
  trim: rounded goal frames, quarterpipes, cage and field structure. The converter
  follows upstream placement overrides, rotations and reflections, then converts
  to the replay renderer's world basis. Both goals extend outward correctly.
- The attributed Jako Octane model preserves the original 28,478 body triangles
  with separate chassis, trim, paint and window materials. Chassis textures and
  actual Dieci rim/tread geometry replace the plain body mask and cylinders.
  Wheel radius and axle/track dimensions follow RocketSim's Octane configuration.
- Chase-camera rays use the driving surfaces so the eye cannot pass through
  diagonal corner walls or lower ramps. Recorded car transforms are unchanged.
- Broadcast, Orbit and Overhead use a spectator cutaway: near walls become
  translucent, and the roof cage and exterior seating are hidden. Broadcast's
  camera also stays inside the side boundary so stadium art cannot block play.
- Each material is compacted once. Player clones share the resulting GPU buffers.
  Scene vertex count fell from 723,611 in the first new draft to 220,772, a 69.5%
  reduction. No mesh rebuilding occurs during playback.

## Verification

- `node scripts/test-replay-studio.mjs`: passed, including all four binary assets.
- `python scripts/test-studio-meshes.py`: passed. Checks original Octane body bounds
  and triangle count, wheel radius, both goal placements, three real curved-wall
  poses, and all four tire contacts on the reported diagonal corner segment.
- At 35.074s the center-to-wall distance is 0.1703 scene units (17.03 cm). At the
  adjacent recorded pose (35.012s), all four tire gaps are within 6.2 mm.
  This is geometry proof, not an adjustment to the recorded car pose.
- A broader sample found 93 near-contact poses across the four players and the
  lower coves, corners and walls. It includes transitions/jumps; its extremes must
  not be treated as precise suspension reconstruction.
- Browser playback at 1440×900: 144 rendered frames over 2.4s (60 FPS), average
  CPU frame work 1.18ms, p95 1.60ms on this PC in the final check. Paused rendering remains 15 FPS.
  These figures do not establish performance on other hardware or long sessions.
- All five cameras, event seeking, Coach context links, event pagination,
  fullscreen and 1024/1280/1440/1920 layouts passed the existing browser checks.
  A fresh reload produced zero browser errors or warnings.
- Frontend build and optimized native build passed. Reopened
  `target/release/antirl.exe` and inspected the same real replay at kickoff and the
  reported corner-wall segment in the native WebGL renderer.

## Exactness boundary

The standard-arena driving surface and the imported body/structural triangles are
source geometry. Stadium materials, turf and external scenery remain approximations.
Replay loadouts and per-wheel suspension, steering and spin are not decoded; all
players still use an Octane visual proxy with Dieci wheels. This does not claim
pixel-identical Rocket League rendering or exact original art for every map.

Asset URLs, conversion notes and attribution are in
`app/public/viewer/SOURCES.md` and `LICENSE.octane.txt`.
