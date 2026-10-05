// RocketSim Octane CarConfig: front/back axle and lateral offsets, radii in uu * .01.
// The loaded tire mesh has radius .16313 before scaling. Grounded axle heights give
// 16.75 uu clearance; articulation is unavailable in the replay telemetry.
export const OCTANE_AXLES = Object.freeze([
  { x: 0.5125, y: -0.0425, halfTrack: 0.259, radius: 0.125 },
  { x: -0.3375, y: -0.0175, halfTrack: 0.295, radius: 0.15 },
]);
export const SOURCE_WHEEL_RADIUS = 0.16313;
