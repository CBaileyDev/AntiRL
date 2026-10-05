# Replay viewer assets

Default ball geometry and its diffuse texture, plus the standard stadium modules, were converted
from the public `cache.zip` in [VirxEC/rlviser](https://github.com/VirxEC/rlviser),
retrieved 2026-10-05. Upstream cache:
https://raw.githubusercontent.com/VirxEC/rlviser/master/cache.zip

The reproducible ball conversion is `scripts/prepare-viewer-assets.py`. It reads the
upstream fixed-width bincode mesh cache, scales to this viewer's units, converts
triangle winding, and compresses the ball texture to WebP. It does not extract
assets from an installed game. Buffers are shared between player models.

`scripts/prepare-studio-meshes.py` bakes the original field cage, curved trim and goal
modules using RLViser's `stadiums/Stadium_P_MeshObjects.json` placement data. Its
per-component transforms and bounds are recorded in `stadium-sources.json`.
Driving surfaces use the pre-existing RocketSim standard-arena collision mesh in
`src/arenaMesh.ts`, plus the flat side planes omitted by RocketSim's mesh cache.
The visible surface now follows those collision triangles. Materials are approximated;
exact stadium textures, proprietary shaders and scenery are not included.

The Octane is based on **"Octane - Rocket League Car" by Jako**, licensed under
[CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/):
https://sketchfab.com/3d-models/octane-rocket-league-car-9910f0a5d158425bbc7deb60c7a81f69
Author: https://sketchfab.com/fairlight51
Public source glTF, binary and chassis textures retrieved 2026-10-05 from:
https://github.com/manrajpannu/rl-dart/tree/main/public/models/octane
Full attribution is included in `LICENSE.octane.txt`.
Changes: separate compact mesh buffers, coordinate/winding conversion, chassis texture
compression, team paint, and Dieci wheel scaling/placement at the Octane axle offsets.
The body remains at its original physics origin; glTF presentation-node offsets are ignored.
Dimensions are checked against [RocketSim's Octane configuration](https://github.com/ZealanL/RocketSim/blob/main/src/Sim/Car/CarConfig/CarConfig.cpp).

RLViser's source code is MIT licensed; its license is included in
`LICENSE.rlviser.txt`. Rocket League asset and trademark ownership remains with
Psyonix / Epic Games. The MIT source-code license does not establish a separate
license for those game assets. Review redistribution rights before publishing.

All cars currently use an Octane visual proxy. Replay loadouts and exact stadium
art are not reconstructed. Wheel suspension, steering and spin are not decoded.
Boost pad availability is not decoded; displayed pads
are reference landmarks, not evidence that a pickup was available.
