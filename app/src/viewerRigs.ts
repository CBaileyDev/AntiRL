import type * as Engine from "./viewerEngine";
import type { PBRMaterial as Pbr } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { ParticleSystem as Particles } from "@babylonjs/core/Particles/particleSystem";
import type { TrailMesh as Trail } from "@babylonjs/core/Meshes/trailMesh";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { ViewerMesh } from "./viewerAssets";
import type { ReplayAnalysis } from "./types";
import { OCTANE_AXLES, SOURCE_WHEEL_RADIUS } from "./viewerGeometry";
interface RigOptions {
  B: typeof Engine;
  PBRMaterial: typeof Pbr;
  ParticleSystem: typeof Particles;
  TrailMesh: typeof Trail;
  scene: Engine.Scene;
  replay: ReplayAnalysis;
  assets: ViewerMesh[];
  assetMesh: (name: string, data: ViewerMesh, material?: number | null) => Engine.Mesh;
  canvasTex: (
    name: string,
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) => Engine.DynamicTexture;
  hex: (color: string) => Engine.Color3;
  emissiveMat: (name: string, color: string, alpha?: number, k?: number) => Engine.StandardMaterial;
  BLUE: string;
  ORANGE: string;
  anisotropy: number;
  shadows: ShadowGenerator;
  glow: GlowLayer;
}
/** Builds shared car geometry, materials, labels, contact shading and boost effects once. */
export function createReplayRigs({
  B,
  PBRMaterial,
  ParticleSystem,
  TrailMesh,
  scene,
  replay,
  assets,
  assetMesh,
  canvasTex,
  hex,
  emissiveMat,
  BLUE,
  ORANGE,
  anisotropy,
  shadows,
  glow,
}: RigOptions) {
  const C3 = B.Color3;
  const V3 = B.Vector3;
  // ---------- Cars ----------
  const flareTex = canvasTex("flare", 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  flareTex.hasAlpha = true;

  const bodyMats = [BLUE, ORANGE].map((h, i) => {
    const m = new PBRMaterial(`body-${i}`, scene);
    m.albedoColor = hex(h);
    m.emissiveColor = hex(h).scale(0.1);
    m.metallic = 0.35;
    m.roughness = 0.28;
    m.clearCoat.isEnabled = true;
    m.clearCoat.intensity = 0.8;
    m.clearCoat.roughness = 0.08;
    return m;
  });
  const darkMat = new PBRMaterial("carDark", scene);
  darkMat.albedoColor = hex("#0b0e14");
  darkMat.metallic = 0.1;
  darkMat.roughness = 0.45;
  const chassisMat = new PBRMaterial("octaneChassis", scene);
  chassisMat.albedoTexture = new B.Texture("/viewer/octane-chassis.webp", scene, false, false);
  chassisMat.metallicTexture = new B.Texture("/viewer/octane-metal.webp", scene, false, false);
  chassisMat.albedoTexture.anisotropicFilteringLevel = anisotropy;
  chassisMat.metallicTexture.anisotropicFilteringLevel = anisotropy;
  chassisMat.useRoughnessFromMetallicTextureGreen = true;
  chassisMat.useRoughnessFromMetallicTextureAlpha = false;
  chassisMat.useMetallnessFromMetallicTextureBlue = true;
  chassisMat.metallic = 1;
  chassisMat.roughness = 0.48;
  const windowMat = new PBRMaterial("octaneWindows", scene);
  windowMat.albedoColor = hex("#101c27");
  windowMat.metallic = 0.15;
  windowMat.roughness = 0.12;
  const rubberMat = new PBRMaterial("wheelRubber", scene);
  rubberMat.albedoColor = hex("#171b20");
  rubberMat.metallic = 0;
  rubberMat.roughness = 0.8;
  const rimMat = new PBRMaterial("carRim", scene);
  rimMat.albedoColor = hex("#e5ecf7");
  rimMat.metallic = 0.9;
  rimMat.roughness = 0.2;
  const carPrototypes = Array.from({ length: assets[0].materialCount }, (_, index) => {
    const mesh = assetMesh(`octane-template-${index}`, assets[0], index);
    mesh.setEnabled(false);
    return mesh;
  });

  const wheelPrototypes = Array.from({ length: assets[2].materialCount }, (_, index) => {
    const mesh = assetMesh(`wheel-template-${index}`, assets[2], index);
    mesh.setEnabled(false);
    return mesh;
  });

  const contactTexture = canvasTex("surfaceContact", 128, 128, (c) => {
    const gradient = c.createRadialGradient(64, 64, 8, 64, 64, 64);
    gradient.addColorStop(0, "rgba(0,0,0,0.65)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.32)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, 128, 128);
  });
  contactTexture.hasAlpha = true;
  const contactMaterial = new B.StandardMaterial("contactShade", scene);
  contactMaterial.diffuseTexture = contactTexture;
  contactMaterial.useAlphaFromDiffuseTexture = true;
  contactMaterial.disableLighting = true;
  contactMaterial.emissiveColor = C3.Black();
  contactMaterial.backFaceCulling = false;
  contactMaterial.disableDepthWrite = true;

  interface Rig {
    id: string;
    team: number;
    root: InstanceType<typeof B.Mesh>;
    ps: InstanceType<typeof ParticleSystem>;
    trail: InstanceType<typeof TrailMesh>;
    boosting: boolean;
    enabled: boolean;
    label: InstanceType<typeof B.Mesh>;
    contact: InstanceType<typeof B.Mesh>;
  }
  const rigs: Rig[] = [];
  const rigById = new Map<string, Rig>();

  const part = (
    root: InstanceType<typeof B.Mesh>,
    m: InstanceType<typeof B.Mesh>,
    mat: InstanceType<typeof PBRMaterial> | InstanceType<typeof B.StandardMaterial>,
    x: number,
    y: number,
    z: number,
    cast = true,
  ) => {
    m.parent = root;
    m.position.set(x, y, z);
    m.material = mat;
    if (cast) shadows.addShadowCaster(m);
    return m;
  };

  for (const p of replay.players) {
    const team = p.team === 0 ? 0 : 1;
    const col = team === 0 ? BLUE : ORANGE;
    const bm = bodyMats[team];
    const root = new B.Mesh(`car-${p.id}`, scene);
    root.rotationQuaternion = new B.Quaternion();

    for (let index = 0; index < carPrototypes.length; index++) {
      const body = carPrototypes[index].clone(`octane-${p.id}-${index}`, root)!;
      body.setEnabled(true);
      body.material = [chassisMat, darkMat, bm, windowMat][index];
      shadows.addShadowCaster(body);
    }
    // RocketSim Octane axle offsets and wheel radii, in replay-local coordinates.
    // Rest suspension is compressed by the car's weight on a driving surface;
    // recorded replays don't contain per-wheel suspension/steering articulation.
    for (const { x, y, halfTrack, radius } of OCTANE_AXLES) {
      for (const side of [-1, 1])
        for (let group = 0; group < wheelPrototypes.length; group++) {
          const wheel = wheelPrototypes[group].clone(`wheel-${p.id}-${x}-${side}-${group}`, root)!;
          wheel.setEnabled(true);
          wheel.scaling.setAll(radius / SOURCE_WHEEL_RADIUS);
          wheel.rotation.x = side > 0 ? Math.PI : 0;
          part(root, wheel, group === 0 ? rimMat : rubberMat, x, y, side * halfTrack);
        }
    }
    // Exhaust emitter (invisible) + boost flame particles
    const exhaust = B.MeshBuilder.CreateBox(`exhaust-${p.id}`, { size: 0.05 }, scene);
    exhaust.isVisible = false;
    exhaust.parent = root;
    exhaust.position.set(-0.66, 0.05, 0);
    const sys = new ParticleSystem(`flame-${p.id}`, 260, scene);
    sys.particleTexture = flareTex;
    sys.emitter = exhaust;
    sys.createBoxEmitter(
      new V3(-1, 0.08, -0.12),
      new V3(-1, -0.05, 0.12),
      new V3(0, -0.05, -0.2),
      new V3(0, 0.05, 0.2),
    );
    sys.minEmitPower = 5;
    sys.maxEmitPower = 9;
    sys.minLifeTime = 0.12;
    sys.maxLifeTime = 0.32;
    sys.minSize = 0.4;
    sys.maxSize = 0.9;
    sys.emitRate = 240;
    sys.blendMode = ParticleSystem.BLENDMODE_ADD;
    if (team === 0) {
      sys.color1 = new B.Color4(0.5, 0.85, 1, 1);
      sys.color2 = new B.Color4(0.2, 0.5, 1, 1);
    } else {
      sys.color1 = new B.Color4(1, 0.85, 0.3, 1);
      sys.color2 = new B.Color4(1, 0.4, 0.1, 1);
    }
    sys.colorDead = new B.Color4(0, 0, 0, 0);

    const tMat = emissiveMat(`ct-${p.id}`, col, 0.35);
    tMat.backFaceCulling = false;
    const trail = new TrailMesh(`ctrail-${p.id}`, exhaust, scene, 0.12, 18, false);
    trail.material = tMat;
    trail.setEnabled(false);

    // Name plate
    const label = B.MeshBuilder.CreatePlane(`label-${p.id}`, { width: 2.5, height: 0.5 }, scene);
    label.parent = root;
    label.position.y = 1.1;
    label.billboardMode = B.Mesh.BILLBOARDMODE_ALL;
    const tex = canvasTex(`name-${p.id}`, 512, 104, (c) => {
      c.fillStyle = "rgba(8,12,20,0.78)";
      c.beginPath();
      const rr = (c as unknown as { roundRect?: (...a: number[]) => void }).roundRect;
      if (rr) rr.call(c, 8, 12, 496, 80, 40);
      else c.rect(8, 12, 496, 80);
      c.fill();
      c.strokeStyle = col;
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = col;
      c.beginPath();
      c.arc(46, 52, 12, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fff";
      c.font = "600 38px Inter, sans-serif";
      c.textBaseline = "middle";
      c.fillText(p.name.slice(0, 18), 72, 54);
    });
    tex.hasAlpha = true;
    const lm = new B.StandardMaterial(`label-mat-${p.id}`, scene);
    lm.diffuseTexture = tex;
    lm.emissiveColor = C3.White();
    lm.disableLighting = true;
    lm.backFaceCulling = false;
    lm.useAlphaFromDiffuseTexture = true;
    label.material = lm;
    glow.addExcludedMesh(label);

    const contact = B.MeshBuilder.CreateGround(
      `contact-${p.id}`,
      { width: 2, height: 1.35 },
      scene,
    );
    contact.material = contactMaterial;
    contact.isPickable = false;
    contact.rotationQuaternion = new B.Quaternion();
    contact.setEnabled(false);
    glow.addExcludedMesh(contact);
    const rig: Rig = {
      id: p.id,
      team,
      root,
      ps: sys,
      trail,
      label,
      contact,
      boosting: false,
      enabled: true,
    };
    rigs.push(rig);
    rigById.set(p.id, rig);
  }

  return { rigs, rigById };
}
