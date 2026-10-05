# Rank display and render quality review

## Changes

- Settings' rank selectors previously showed text only. The shared selector now displays a 40 px local Rocket League badge for every selected rank, including Bronze, Silver, Gold and Platinum. Profile setup uses this same selector without duplicate header badges.
- Shared `rankAssetIndex` keeps badge selection and the highest-playlist sidebar rank in the same order. Arabic and Roman tier numbers map to the same artwork.
- Image decoding is asynchronous; a failed image falls back to the bundled Unranked badge. A later selection restores the correct artwork. The rank controls retain native select keyboard behavior and now have explicit accessible names in Settings.
- Rejected malformed list responses before storing coaching memory or teammates in React state. This fixes a Settings crash in browser preview. Preview logging no longer prints command arguments.
- Settings saving now validates its response and performs one data refresh instead of two concurrent refreshes. Browser preview merges edited settings locally. Redundant inline HTML/body style attributes were removed; their existing CSS already supplies these styles and avoids native CSP errors.
- No dependencies, image generation, remote runtime requests or changes to user profile values were introduced.

## Validation

| Check | Result | Evidence |
| --- | --- | --- |
| Rank artwork | PASS | All 23 PNGs match their existing source manifest hashes and decode in Chromium. Pixel checks confirm visible artwork. |
| Rank selection | PASS | Unranked and all 22 ranked choices render their matching badge. Roman/Arabic mapping and highest rank across 1s/2s/3s pass. |
| Profile save and sidebar | PASS | Browser-only profile set to Bronze III, Silver II and Gold I; saving shows Gold I's artwork and highest-rank label in the sidebar. Native profile values were not changed. |
| Failed artwork recovery | PASS | A simulated 404 falls back to Unranked; the following selection loads its correct badge. |
| Settings | PASS | Gold I to Gold II keyboard change updates to image 8; the page renders at 1024 px without horizontal overflow. |
| Rank layout | PASS | Rendered at 1440 and 1024 px. |
| Replay interaction | PASS | Five cameras, play/pause, seek, pagination, event-to-Coach context, fullscreen, and 1920/1440/1280/1024 px layouts. |
| Playback budget | PASS | 216 renders in 2400.7 ms (89.97 FPS), under the detected 90 FPS budget. Average CPU render work 1.17 ms; p95 1.5 ms. Chromium headless, WebGL2, 774 x 483 render buffer, recorded four-player fixture. These are CPU measurements, not GPU timings. |
| Paused budget | PASS | 18 renders in 1.2 s (15 FPS). |
| High DPI | PASS | DPR 2: CSS canvas 774 x 483, render buffer 1161 x 724, hardware scaling 2/3. |
| Regression tests | PASS | `test-ranks-quality.mjs`, `test-replay-studio.mjs`, `test-studio-meshes.py`; 12 Rust tests, 1 opt-in live provider test ignored. |
| Packaged native rank artwork | PASS | All 23 embedded images decode in the release WebView2 app. Settings renders Bronze I, Gold II and Platinum III without saving test profile values. |
| Packaged native playback | PASS | 216 renders in 2400.6 ms (89.98 FPS), average CPU render work 0.96 ms, 759 x 474 render buffer. Short local WebView2 benchmark with CDP attached. |
| Final native startup / Settings | PASS | Final build renders lower-rank selections and the expected dark background; zero console errors or warnings. |
| Other GPUs / long sessions / live provider | NOT RUN | The short local measurements do not establish behavior on other hardware, long sessions or provider services. |

The existing turf detail, contact shading and recorded geometry are preserved. Cars' recorded positions are unchanged. The viewer still uses procedural arena materials and an Octane proxy; this review does not establish identical game rendering, or guarantee that the entire application is bug-free. Source artwork attribution is in `app/public/ranks/sources.json`.
