import * as B from "./viewerEngine";
import { PRO_CAMERA } from "./replayMath";
export function createViewerCameras(scene: B.Scene, canvas: HTMLCanvasElement) {
  const V3 = B.Vector3;
  // ---------- Camera ----------
  const view = new B.ArcRotateCamera("camera", -Math.PI / 2, 1.1, 60, new V3(0, 0, 0), scene);
  view.attachControl(canvas, true);
  view.lowerRadiusLimit = 4;
  view.upperRadiusLimit = 220;
  view.wheelPrecision = 15;
  view.minZ = 0.2;
  view.maxZ = 1500;
  view.fov = 0.95;
  const chase = new B.FreeCamera("chase", new V3(0, 2, 0), scene);
  chase.inputs.clear();
  chase.minZ = 0.04;
  chase.maxZ = 1500;
  chase.fovMode = B.Camera.FOVMODE_HORIZONTAL_FIXED;
  chase.fov = (PRO_CAMERA.fov * Math.PI) / 180;

  return { view, chase };
}
