import type { CameraProfile } from "./bindings";
import type { RefObject } from "react";
import type { ReplayAnalysis, Frame } from "./types";
import { chasePose, damping, frameIndex } from "./replayMath";
import { loadViewerMesh } from "./viewerAssets";
import { measuredRefresh, playbackFps, renderScale } from "./viewerQuality";
import { drawBrushedMetal, drawTurfDetail } from "./surfaceTextures";
import { createViewerCameras } from "./viewerCameras";
import { createReplayRigs } from "./viewerRigs";
// Standard Rocket League Big Boost Pad coordinates in Babylon scale (units * 0.01)
const BIG_BOOST_PADS: [number, number, number][] = [
  [-30.72, 0.1, -40.96], // Blue Left
  [30.72, 0.1, -40.96], // Blue Right
  [-35.84, 0.1, 0], // Mid Left
  [35.84, 0.1, 0], // Mid Right
  [-30.72, 0.1, 40.96], // Orange Left
  [30.72, 0.1, 40.96], // Orange Right
];

// Standard 28 small pads, coordinates verified against RLGym common_values.py.
const SMALL_BOOST_PADS: [number, number, number][] = [
  [0, 0.05, 42.4],
  [-17.92, 0.05, 41.84],
  [17.92, 0.05, 41.84],
  [-9.4, 0.05, 33.08],
  [9.4, 0.05, 33.08],
  [0, 0.05, 28.16],
  [-35.84, 0.05, 24.84],
  [35.84, 0.05, 24.84],
  [-17.88, 0.05, 23],
  [17.88, 0.05, 23],
  [-20.48, 0.05, 10.36],
  [0, 0.05, 10.24],
  [20.48, 0.05, 10.36],
  [-10.24, 0.05, -0],
  [10.24, 0.05, -0],
  [-20.48, 0.05, -10.36],
  [0, 0.05, -10.24],
  [20.48, 0.05, -10.36],
  [-17.88, 0.05, -23],
  [17.88, 0.05, -23],
  [-35.84, 0.05, -24.84],
  [35.84, 0.05, -24.84],
  [0, 0.05, -28.16],
  [-9.4, 0.05, -33.1],
  [9.4, 0.05, -33.08],
  [-17.92, 0.05, -41.84],
  [17.92, 0.05, -41.84],
  [0, 0.05, -42.4],
];

export interface ReplaySceneOptions {
  replay: ReplayAnalysis;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  clock: RefObject<number>;
  stateRef: RefObject<{
    playerId: string | null | undefined;
    camera: string;
    profile: CameraProfile;
  }>;
  cutawayRef: RefObject<boolean>;
  qualityRef: RefObject<"low" | "high">;
  playbackRef: RefObject<boolean>;
  setReady: (ready: boolean) => void;
  setError: (error: string) => void;
}
/** Owns GPU resources, async initialization and teardown independently of React. */
export function mountReplayScene({
  replay,
  canvasRef,
  clock,
  stateRef,
  cutawayRef,
  qualityRef,
  playbackRef,
  setReady,
  setError,
}: ReplaySceneOptions): (() => void) | undefined {
  let disposed = false;
  let cleanup: (() => void) | undefined;
  setReady(false);
  setError("");

  if (!replay.coverage.positions || !replay.frames.length) {
    setError(
      "Recorded positions are unavailable in this replay. The report and evidence list remain accessible.",
    );
    return;
  }

  Promise.all([
    import("./viewerEngine"),
    import("@babylonjs/core/Materials/PBR/pbrMaterial"),
    import("@babylonjs/core/Lights/Shadows/shadowGenerator"),
    import("@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"),
    import("@babylonjs/core/Layers/glowLayer"),
    import("@babylonjs/core/Particles/particleSystem"),
    import("@babylonjs/core/Meshes/trailMesh"),
    import("@babylonjs/core/Lights/pointLight"),
    import("@babylonjs/core/Materials/imageProcessingConfiguration"),
  ])
    .then(async ([B, pbr, sg, , gl, ps, tm, pl, ipc]) => {
      if (disposed || !canvasRef.current) return;
      const { PBRMaterial } = pbr;
      const { ShadowGenerator } = sg;
      const { GlowLayer } = gl;
      const { ParticleSystem } = ps;
      const { TrailMesh } = tm;
      const { PointLight } = pl;
      const { ImageProcessingConfiguration } = ipc;
      const { VertexData } = await import("@babylonjs/core/Meshes/mesh.vertexData");
      await import("@babylonjs/core/Rendering/edgesRenderer");
      const assets = await Promise.all([
        loadViewerMesh("octane"),
        loadViewerMesh("ball"),
        loadViewerMesh("wheel"),
        loadViewerMesh("stadium"),
      ]);
      if (disposed || !canvasRef.current) return;

      let engine: InstanceType<typeof B.Engine>;
      try {
        engine = new B.Engine(canvasRef.current, true, {
          preserveDrawingBuffer: false,
          stencil: true,
          antialias: true,
          powerPreference: "high-performance",
        });
      } catch {
        engine = new B.Engine(canvasRef.current, false);
      }

      if (disposed) {
        engine.dispose();
        return;
      }

      const S = 0.01;
      const C3 = B.Color3;
      const V3 = B.Vector3;
      const scene = new B.Scene(engine);
      scene.clearColor = new B.Color4(0.1, 0.18, 0.29, 1);
      // Nothing in the arena is clickable; avoid a pick on every mouse move over the canvas.
      scene.skipPointerMovePicking = true;
      scene.skipFrustumClipping = false;
      // Cap HiDPI fill cost without lowering the CSS canvas size.
      engine.setHardwareScalingLevel(renderScale(window.devicePixelRatio));

      cleanup = () => {
        engine.stopRenderLoop();
        scene.dispose();
        engine.dispose();
      };

      // Image processing: ACES tone mapping and contrast
      const ip = scene.imageProcessingConfiguration;
      ip.toneMappingEnabled = true;
      ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
      ip.exposure = 1.2;
      ip.contrast = 1.1;
      ip.vignetteEnabled = false;
      ip.vignetteWeight = 1.8;
      ip.vignetteStretch = 0.4;
      ip.vignetteColor = new B.Color4(0, 0, 0.02, 0);

      const { view, chase } = createViewerCameras(scene, canvasRef.current);

      // ---------- Lights + soft shadows ----------
      const ambient = new B.HemisphericLight("ambient", new V3(0, 1, 0), scene);
      ambient.intensity = 0.9;
      ambient.diffuse = new C3(0.75, 0.85, 1.0);
      ambient.groundColor = new C3(0.08, 0.1, 0.16);

      const key = new B.DirectionalLight("key", new V3(-0.35, -1, 0.45), scene);
      key.position = new V3(30, 90, -40);
      key.intensity = 2.1;
      key.diffuse = new C3(1.0, 0.97, 0.92);
      key.specular = new C3(1, 1, 1);

      const fill = new B.DirectionalLight("fill", new V3(0.5, -0.6, -0.6), scene);
      fill.intensity = 0.55;
      fill.diffuse = new C3(0.45, 0.6, 1.0);

      const shadows = new ShadowGenerator(1024, key);
      shadows.usePercentageCloserFiltering = true;
      shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      shadows.bias = 0.0006;
      shadows.normalBias = 0.02;
      shadows.setDarkness(0.35);
      // Soft contact shadows read the same at half cadence and cost ~120 casters per redraw.
      shadows.getShadowMap()!.refreshRate = 2;

      const glow = new GlowLayer("glow", scene, { blurKernelSize: 20, mainTextureRatio: 0.35 });
      glow.intensity = 0.18;

      // ---------- Helpers ----------
      const hex = (h: string) => C3.FromHexString(h);
      const emissiveMat = (name: string, h: string, alpha = 1, k = 1) => {
        const m = new B.StandardMaterial(name, scene);
        m.diffuseColor = C3.Black();
        m.specularColor = C3.Black();
        m.emissiveColor = hex(h).scale(k);
        m.disableLighting = true;
        m.alpha = alpha;
        return m;
      };
      const canvasTex = (
        name: string,
        w: number,
        h: number,
        draw: (c: CanvasRenderingContext2D) => void,
      ) => {
        const t = new B.DynamicTexture(name, { width: w, height: h }, scene, true);
        draw(t.getContext() as unknown as CanvasRenderingContext2D);
        t.update();
        return t;
      };

      const assetMesh = (
        name: string,
        data: (typeof assets)[number],
        material: number | null = null,
      ) => {
        const mesh = new B.Mesh(name, scene);
        const vertices = new VertexData();
        let positions: Float32Array | number[] = data.positions;
        let uvs: Float32Array | number[] = data.uvs;
        let indices: Uint32Array | number[] = data.indices;
        if (material != null) {
          // Compact each material's vertices once, then clone its shared GPU geometry.
          // Keeping the full body/stadium buffer for every material multiplies vertex work.
          const remap = new Int32Array(data.positions.length / 3).fill(-1);
          positions = [];
          uvs = [];
          indices = [];
          for (let triangle = 0; triangle < data.groups.length; triangle++) {
            if (data.groups[triangle] !== material) continue;
            for (let k = 0; k < 3; k++) {
              const original = data.indices[triangle * 3 + k];
              if (remap[original] === -1) {
                remap[original] = positions.length / 3;
                positions.push(
                  data.positions[original * 3],
                  data.positions[original * 3 + 1],
                  data.positions[original * 3 + 2],
                );
                uvs.push(data.uvs[original * 2], data.uvs[original * 2 + 1]);
              }
              indices.push(remap[original]);
            }
          }
        }
        vertices.positions = positions;
        vertices.uvs = uvs;
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        vertices.indices = indices;
        vertices.normals = normals;
        vertices.applyToMesh(mesh);
        mesh.isPickable = false;
        return mesh;
      };
      const BLUE = "#2f9bff";
      const ORANGE = "#ff8a2a";

      // ---------- Skybox gradient + stars ----------
      const skyTex = canvasTex("skyTex", 1024, 512, (c) => {
        const g = c.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, "#29587c");
        g.addColorStop(0.45, "#527b98");
        g.addColorStop(0.5, "#839aab");
        g.addColorStop(0.56, "#35475e");
        g.addColorStop(1, "#172136");
        c.fillStyle = g;
        c.fillRect(0, 0, 1024, 512);
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 260; i++) {
          c.fillStyle = `rgba(200,220,255,${0.2 + rnd() * 0.6})`;
          c.fillRect(rnd() * 1024, rnd() * 230, 1.4, 1.4);
        }
      });
      const skyMat = new B.StandardMaterial("skyMat", scene);
      skyMat.emissiveTexture = skyTex;
      skyMat.diffuseColor = C3.Black();
      skyMat.specularColor = C3.Black();
      skyMat.disableLighting = true;
      skyMat.backFaceCulling = false;
      const sky = B.MeshBuilder.CreateSphere("sky", { diameter: 1000, segments: 24 }, scene);
      sky.material = skyMat;
      sky.infiniteDistance = true;
      sky.isPickable = false;
      glow.addExcludedMesh(sky);

      // ---------- Floor texture with line markings ----------
      const PX = 20;
      const FW = 81.92;
      const FH = 102.4;
      const CH = 10; // corner chamfer
      const floorTex = canvasTex("floorTex", Math.round(FW * PX), Math.round(FH * PX), (c) => {
        const w = FW * PX;
        const h = FH * PX;
        c.fillStyle = "#04070c";
        c.fillRect(0, 0, w, h);
        c.save();
        c.beginPath();
        const k = CH * PX;
        c.moveTo(k, 0);
        c.lineTo(w - k, 0);
        c.lineTo(w, k);
        c.lineTo(w, h - k);
        c.lineTo(w - k, h);
        c.lineTo(k, h);
        c.lineTo(0, h - k);
        c.lineTo(0, k);
        c.closePath();
        c.clip();
        const base = c.createLinearGradient(0, 0, 0, h);
        base.addColorStop(0, "#315442");
        base.addColorStop(0.28, "#346949");
        base.addColorStop(0.72, "#346949");
        base.addColorStop(1, "#315442");
        c.fillStyle = base;
        c.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          if (i % 2) continue;
          c.fillStyle = "rgba(190,225,170,0.11)";
          c.fillRect(0, (i * h) / 14, w, h / 14);
        }
        const zoneH = 30 * PX;
        const gOr = c.createLinearGradient(0, 0, 0, zoneH);
        gOr.addColorStop(0, "rgba(255,138,42,0.30)");
        gOr.addColorStop(1, "rgba(255,138,42,0)");
        c.fillStyle = gOr;
        c.fillRect(0, 0, w, zoneH);
        const gBl = c.createLinearGradient(0, h, 0, h - zoneH);
        gBl.addColorStop(0, "rgba(47,155,255,0.30)");
        gBl.addColorStop(1, "rgba(47,155,255,0)");
        c.fillStyle = gBl;
        c.fillRect(0, h - zoneH, w, zoneH);
        c.restore();
        c.strokeStyle = "rgba(190,215,255,0.75)";
        c.lineWidth = 5;
        c.lineJoin = "round";
        c.beginPath();
        c.moveTo(k, 3);
        c.lineTo(w - k, 3);
        c.lineTo(w - 3, k);
        c.lineTo(w - 3, h - k);
        c.lineTo(w - k, h - 3);
        c.lineTo(k, h - 3);
        c.lineTo(3, h - k);
        c.lineTo(3, k);
        c.closePath();
        c.stroke();
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(0, h / 2);
        c.lineTo(w, h / 2);
        c.stroke();
        c.beginPath();
        c.arc(w / 2, h / 2, 9.1 * PX, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = "rgba(190,215,255,0.8)";
        c.beginPath();
        c.arc(w / 2, h / 2, 0.7 * PX, 0, Math.PI * 2);
        c.fill();
        // goal boxes
        c.strokeStyle = "rgba(255,138,42,0.7)";
        c.strokeRect(w / 2 - 13 * PX, 2, 26 * PX, 12 * PX);
        c.strokeStyle = "rgba(47,155,255,0.7)";
        c.strokeRect(w / 2 - 13 * PX, h - 12 * PX - 2, 26 * PX, 12 * PX);
      });
      const floorMat = new B.StandardMaterial("floorMat", scene);
      floorTex.vScale = -1;
      floorTex.vOffset = 1;
      const anisotropy = Math.min(16, engine.getCaps().maxAnisotropy || 1);
      floorTex.anisotropicFilteringLevel = anisotropy;
      const turfDetail = canvasTex("turfDetail", 1024, 1024, (c) => drawTurfDetail(c));
      turfDetail.uScale = FW / 4;
      turfDetail.vScale = FH / 4;
      turfDetail.wrapU = B.Texture.WRAP_ADDRESSMODE;
      turfDetail.wrapV = B.Texture.WRAP_ADDRESSMODE;
      turfDetail.anisotropicFilteringLevel = anisotropy;
      turfDetail.updateSamplingMode(B.Texture.TRILINEAR_SAMPLINGMODE);
      floorMat.detailMap.texture = turfDetail;
      floorMat.detailMap.diffuseBlendLevel = 0.7;
      floorMat.detailMap.bumpLevel = 0.22;
      floorMat.detailMap.isEnabled = true;
      floorMat.diffuseTexture = floorTex;
      floorMat.emissiveTexture = floorTex;
      floorMat.emissiveColor = new C3(0.15, 0.15, 0.15);
      floorMat.specularColor = new C3(0.1, 0.12, 0.1);
      floorMat.specularPower = 8;
      const ground = B.MeshBuilder.CreateGround("pitch", { width: FW, height: FH }, scene);
      // Turf blades sit just above the field's metal substrate, avoiding coplanar flicker.
      ground.position.y = 0.03;
      ground.material = floorMat;
      ground.receiveShadows = true;
      ground.freezeWorldMatrix();

      const outer = B.MeshBuilder.CreateGround("outer", { width: 400, height: 400 }, scene);
      outer.position.y = -0.06;
      outer.material = emissiveMat("outerMat", "#05080f");
      outer.freezeWorldMatrix();

      // Stadium seating: four shared-material bands, with a single baked crowd texture.
      const crowdTex = canvasTex("crowd", 1024, 128, (c) => {
        c.fillStyle = "#172437";
        c.fillRect(0, 0, 1024, 128);
        for (let row = 0; row < 12; row++) {
          c.fillStyle = "#304158";
          c.fillRect(0, row * 11 + 8, 1024, 2);
          for (let seat = 0; seat < 180; seat++) {
            c.fillStyle = ["#7292ab", "#d6d4bf", "#476b8f", "#b4805e"][(seat * 7 + row * 11) % 4];
            c.fillRect(seat * 6 + (row % 2) * 3, row * 11 + 2, 2, 4);
          }
        }
      });
      const crowdMat = new B.StandardMaterial("crowdMaterial", scene);
      crowdMat.diffuseTexture = crowdTex;
      crowdMat.emissiveTexture = crowdTex;
      crowdMat.emissiveColor = new C3(0.25, 0.25, 0.25);
      crowdMat.specularColor = C3.Black();
      const scenery: InstanceType<typeof B.Mesh>[] = [];
      for (const side of [-1, 1]) {
        for (const end of [false, true]) {
          const stand = B.MeshBuilder.CreateBox(
            `stand-${side}-${end}`,
            { width: end ? 130 : 8, height: 14, depth: end ? 8 : 114 },
            scene,
          );
          stand.position.set(end ? 0 : side * 52, 12, end ? side * 64 : 0);
          stand.material = crowdMat;
          stand.isPickable = false;
          stand.freezeWorldMatrix();
          const roof = B.MeshBuilder.CreateBox(
            `stand-roof-${side}-${end}`,
            { width: end ? 132 : 11, height: 0.6, depth: end ? 11 : 116 },
            scene,
          );
          roof.position.set(stand.position.x, 20, stand.position.z);
          roof.material = emissiveMat(`stadium-roof-${side}-${end}`, "#283b52");
          roof.isPickable = false;
          roof.freezeWorldMatrix();
          scenery.push(stand, roof);
        }
      }

      // Original standard-field modules: rounded goal frames, curved trim and cage.
      // Baked once in source transforms; all car poses remain recorded replay poses.
      const steel = new B.StandardMaterial("stadiumSteel", scene);
      steel.diffuseColor = hex("#303c48");
      steel.emissiveColor = hex("#17202a");
      steel.specularColor = C3.Black();
      steel.specularPower = 96;
      steel.backFaceCulling = false;
      const metalTexture = canvasTex("brushedMetal", 512, 512, (c) => drawBrushedMetal(c));
      metalTexture.wrapU = B.Texture.WRAP_ADDRESSMODE;
      metalTexture.wrapV = B.Texture.WRAP_ADDRESSMODE;
      metalTexture.anisotropicFilteringLevel = anisotropy;
      steel.diffuseColor = C3.White();
      steel.diffuseTexture = metalTexture;
      const frameSteel = steel.clone("stadiumFrameSteel");
      frameSteel.diffuseTexture = null;
      frameSteel.diffuseColor = hex("#647584");
      // Authored trim overlaps collision surfaces: bias only its depth, never car poses.
      frameSteel.zOffset = -2;
      frameSteel.disableLighting = false;
      frameSteel.emissiveColor = hex("#3f4c5c");
      const teamTrim = [BLUE, ORANGE].map((color, index) => {
        const m = new B.StandardMaterial(`stadiumTeam-${index}`, scene);
        m.diffuseColor = hex(color);
        m.emissiveColor = hex(color).scale(0.45);
        m.zOffset = -2;
        m.specularColor = hex("#b0becb");
        m.specularPower = 80;
        m.backFaceCulling = false;
        return m;
      });
      const stadiumGlass = new B.StandardMaterial("stadiumGlass", scene);
      stadiumGlass.diffuseColor = hex("#3a5972");
      stadiumGlass.alpha = 0.26;
      stadiumGlass.backFaceCulling = false;
      const stadiumMaterials = [frameSteel, ...teamTrim, stadiumGlass, frameSteel];
      for (let group = 0; group < assets[3].materialCount; group++) {
        const module = assetMesh(`stadium-module-${group}`, assets[3], group);
        module.material = stadiumMaterials[group];
        module.receiveShadows = true;
        module.freezeWorldMatrix();
        glow.addExcludedMesh(module);
      }

      // Visible driving surface uses the exact RocketSim collision triangles, including
      // lower coves, diagonal corners and goal tunnels. Flat boxes cannot represent them.
      const am = await import("./arenaMesh");
      if (disposed) return;
      const bin = Uint8Array.from(atob(am.ARENA_B64), (ch) => ch.charCodeAt(0));
      const vi = new Int16Array(bin.buffer, 0, am.ARENA_VERTS * 3);
      const ii = new Uint16Array(
        bin.buffer,
        am.ARENA_VERTS * 6,
        (bin.length - am.ARENA_VERTS * 6) / 2,
      );
      const pos = Float32Array.from(vi, (value) => value / 500);
      const rampIndices: number[] = [],
        wallIndices: number[] = [],
        ceilingIndices: number[] = [];
      for (let i = 0; i < ii.length; i += 3) {
        const height = (pos[ii[i] * 3 + 1] + pos[ii[i + 1] * 3 + 1] + pos[ii[i + 2] * 3 + 1]) / 3;
        // Retain upper curved transitions; cutaway changes visibility only.
        (height > 18 ? ceilingIndices : height < 2.56 ? rampIndices : wallIndices).push(
          ii[i],
          ii[i + 1],
          ii[i + 2],
        );
      }
      const hexTex = canvasTex("wallHex", 256, 256, (c) => {
        c.fillStyle = "#344855";
        c.fillRect(0, 0, 256, 256);
        c.strokeStyle = "#657b87";
        c.lineWidth = 1.3;
        for (let row = -1; row < 9; row++)
          for (let col = -1; col < 8; col++) {
            const x = col * 48 + (row % 2) * 24,
              y = row * 28;
            c.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (Math.PI / 3) * k,
                px = x + 27 * Math.cos(a),
                py = y + 16 * Math.sin(a);
              if (k === 0) c.moveTo(px, py);
              else c.lineTo(px, py);
            }
            c.closePath();
            c.stroke();
          }
      });
      const wallSurface = new B.StandardMaterial("wallSurface", scene);
      hexTex.anisotropicFilteringLevel = anisotropy;
      hexTex.wrapU = B.Texture.WRAP_ADDRESSMODE;
      hexTex.wrapV = B.Texture.WRAP_ADDRESSMODE;
      wallSurface.diffuseTexture = hexTex;
      wallSurface.emissiveColor = C3.Black();
      wallSurface.specularColor = hex("#597584");
      wallSurface.specularPower = 90;
      wallSurface.backFaceCulling = false;
      const contactMeshes: InstanceType<typeof B.Mesh>[] = [];
      const surface = (
        name: string,
        indices: number[],
        material: InstanceType<typeof B.StandardMaterial>,
      ) => {
        const vd = new VertexData();
        const normals: number[] = [];
        VertexData.ComputeNormals(pos, indices, normals);
        vd.positions = pos;
        vd.indices = indices;
        vd.normals = normals;
        // World-space perimeter distance avoids stretched or discontinuous wall hexes.
        vd.uvs = Array.from({ length: am.ARENA_VERTS * 2 }, (_, i) => {
          const v = Math.floor(i / 2) * 3;
          return i % 2 ? pos[v + 1] / 3 : (Math.atan2(pos[v + 2], pos[v]) + Math.PI) * 16;
        });
        const mesh = new B.Mesh(name, scene);
        vd.applyToMesh(mesh);
        mesh.material = material;
        mesh.receiveShadows = true;
        mesh.isPickable = false;
        mesh.freezeWorldMatrix();
        contactMeshes.push(mesh);
        glow.addExcludedMesh(mesh);
      };
      surface("arena-ramps", rampIndices, steel);
      surface("arena-walls", wallIndices, wallSurface);
      const ceilingMat = steel.clone("ceilingSurface");
      ceilingMat.emissiveColor = C3.Black();
      surface("arena-upper-transitions", ceilingIndices, ceilingMat);
      const ceiling = B.MeshBuilder.CreatePlane(
        "arena-ceiling",
        { width: 81.92, height: 102.4, sideOrientation: B.Mesh.DOUBLESIDE },
        scene,
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.y = 20.44;
      ceiling.material = ceilingMat;
      ceiling.isPickable = false;
      ceiling.receiveShadows = true;
      ceiling.freezeWorldMatrix();
      contactMeshes.push(ceiling);
      glow.addExcludedMesh(ceiling);
      // RocketSim uses infinite planes for flat side walls, omitted from its mesh cache.
      for (const sign of [-1, 1]) {
        const wall = B.MeshBuilder.CreatePlane(
          `side-wall-${sign}`,
          { width: 71.68, height: 20.44, sideOrientation: B.Mesh.DOUBLESIDE },
          scene,
        );
        wall.rotation.y = Math.PI / 2;
        wall.position.set(sign * 40.96, 10.22, 0);
        const uv = wall.getVerticesData("uv")!;
        wall.setVerticesData(
          "uv",
          uv.map((value, index) => (value * (index % 2 ? 20.44 : 71.68)) / 3),
        );
        wall.material = wallSurface;
        wall.isPickable = false;
        wall.freezeWorldMatrix();
        contactMeshes.push(wall);
        glow.addExcludedMesh(wall);
      }

      // ---------- Boost pads ----------
      const gold = emissiveMat("padGold", "#ffb02e", 1, 1.1);
      const goldDim = emissiveMat("padGoldDim", "#ffb02e", 0.55, 0.8);
      const baseDark = emissiveMat("padBase", "#0b111c");
      const boostOrbs: InstanceType<typeof B.Mesh>[] = [];
      BIG_BOOST_PADS.forEach((p, i) => {
        const base = B.MeshBuilder.CreateCylinder(
          `bigPad-${i}`,
          { diameter: 3.4, height: 0.1, tessellation: 6 },
          scene,
        );
        base.position.set(p[0], 0.05, p[2]);
        base.material = baseDark;
        base.freezeWorldMatrix();
        const ring = B.MeshBuilder.CreateCylinder(
          `bigRing-${i}`,
          { diameter: 3.0, height: 0.14, tessellation: 6 },
          scene,
        );
        ring.position.set(p[0], 0.06, p[2]);
        ring.material = goldDim;
        ring.freezeWorldMatrix();
        const orb = B.MeshBuilder.CreateSphere(
          `bigOrb-${i}`,
          { diameter: 0.85, segments: 12 },
          scene,
        );
        orb.position.set(p[0], 0.65, p[2]);
        orb.material = gold;
        boostOrbs.push(orb);
      });
      SMALL_BOOST_PADS.forEach((p, i) => {
        const d = B.MeshBuilder.CreateCylinder(
          `smallPad-${i}`,
          { diameter: 1.5, height: 0.08, tessellation: 6 },
          scene,
        );
        d.position.set(p[0], 0.045, p[2]);
        d.material = goldDim;
        d.freezeWorldMatrix();
      });

      // Imported Rocket League geometry is built once and cloned with shared buffers.
      const ballMat = new PBRMaterial("ballMat", scene);
      // Bevy cache UVs use top-left image origin.
      ballMat.albedoTexture = new B.Texture("/viewer/ball.webp", scene, false, false);
      ballMat.albedoTexture.anisotropicFilteringLevel = anisotropy;
      ballMat.metallic = 0.12;
      ballMat.roughness = 0.45;
      const ball = assetMesh("ball", assets[1]);
      ball.rotationQuaternion = new B.Quaternion();
      ball.material = ballMat;
      shadows.addShadowCaster(ball);
      const ballLight = new PointLight("ballLight", new V3(0, 3, 0), scene);
      ballLight.diffuse = new C3(0.35, 0.8, 1);
      ballLight.intensity = 0.7;
      ballLight.range = 24;
      const ballTrailMat = emissiveMat("ballTrail", "#7fdcff", 0.4);
      ballTrailMat.backFaceCulling = false;
      const ballTrail = new TrailMesh("ballTrail", ball, scene, 0.35, 18, false);
      ballTrail.material = ballTrailMat;
      ballTrail.setEnabled(false);

      const { rigs, rigById } = createReplayRigs({
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
      });
      const qa = new B.Quaternion();
      const qb = new B.Quaternion();
      // Scratch objects: the render loop must not allocate per car per frame (GC pauses read as stutter).
      const tmpUp = new V3(),
        tmpNormal = new V3(),
        tmpHit = new V3(),
        tmpFront = new V3(),
        tmpRight = new V3(),
        tmpOrigin = new V3(),
        tmpDir = new V3();
      const upAxis = new V3(0, 1, 0),
        unitX = new V3(1, 0, 0),
        unitZ = new V3(0, 0, 1);
      const downRay = new B.Ray(new V3(), new V3(0, -1, 0), 1.6);
      const camRay = new B.Ray(new V3(), new V3(0, 0, 1), 1);
      const stadiumCage = scene.getMeshByName("stadium-module-4");
      const upperTransitions = scene.getMeshByName("arena-upper-transitions");
      let lastSpectator: boolean | null = null;
      let lastCam = "";
      let lastPlayer: string | null | undefined;
      const desiredEye = new V3();
      const desiredTarget = new V3();
      const lookTarget = new V3();
      const chaseHeading = new V3(1, 0, 0);
      let lastT = clock.current;
      let lastChange = 0;
      let lastDiscontinuity = -1;
      let cachedIndex = -1;
      let carsA = new Map<string, Frame["cars"][number]>();
      let carsB = new Map<string, Frame["cars"][number]>();
      let lastRender = 0;
      let nextRender = 0;
      let renderBudget = 0;

      let refreshHz = 60,
        lastRaf = 0;
      const refreshIntervals: number[] = [];
      scene.metadata = { studio: { refreshHz: 60, targetFps: 60 } };
      const frameCpu: number[] = [];
      const frameIntervals: number[] = [];
      let renderedFrames = 0;
      let priorRender = 0;
      let appliedQuality = "";
      const diagnosticCanvas = canvasRef.current as HTMLCanvasElement & {
        __antirlDiagnostics?: () => unknown;
      };
      diagnosticCanvas.__antirlDiagnostics = () => ({
        renderer: "WebGL",
        quality: qualityRef.current,
        renderedFrames,
        camera: stateRef.current.camera,
        ceilingVisible: ceiling.isEnabled(),
        frameCpuMs: [...frameCpu],
        frameIntervalsMs: [...frameIntervals],
        renderWidth: engine.getRenderWidth(),
        renderHeight: engine.getRenderHeight(),
        drawCalls: (engine as any)._drawCalls?.current ?? null,
        meshCount: scene.meshes.length,
        targetFps: scene.metadata.studio.targetFps,
      });
      let trailsOn = false;
      let resetRequested = true;
      let snap = true;
      let bx = 0;
      let by = 0;
      let bz = 0;
      let ballOn = false;
      const resetTrails = () => {
        ballTrail.reset();
        for (const r of rigs) {
          r.trail.reset();
          r.ps.stop();
          r.ps.reset();
          r.boosting = false;
        }
      };

      // Compile every shader variant (particles, trails, cutaway surfaces, both cameras) up front.
      // First-use compilation on Windows/ANGLE costs 100+ ms each and shows up as mid-play freezes.
      try {
        const hidden = scene.meshes.filter(
          (m) => !m.isEnabled(false) && !m.name.includes("template"),
        );
        for (const m of hidden) m.setEnabled(true);
        for (const r of rigs) r.ps.start();
        for (const cam of [view, chase]) {
          scene.activeCamera = cam;
          scene.render();
        }
        await Promise.race([scene.whenReadyAsync(), new Promise((r) => setTimeout(r, 4000))]);
        if (disposed) return;
        scene.render();
        for (const m of hidden) m.setEnabled(false);
        for (const r of rigs) {
          r.ps.stop();
          r.ps.reset();
          r.trail.reset();
        }
        ballTrail.reset();
        scene.activeCamera = view;
      } catch {
        /* Warm-up is an optimisation only. */
      }

      engine.runRenderLoop(() => {
        const { playerId: pid, camera: cam } = stateRef.current;
        const t = clock.current;
        if (document.hidden) return;
        const renderNow = performance.now();
        if (appliedQuality !== qualityRef.current) {
          appliedQuality = qualityRef.current;
          engine.setHardwareScalingLevel(
            appliedQuality === "low" ? 1 : renderScale(window.devicePixelRatio),
          );
          shadows.getShadowMap()?.resize(appliedQuality === "low" ? 512 : 1024);
          glow.isEnabled = appliedQuality !== "low";
          frameCpu.length = 0;
          frameIntervals.length = 0;
          priorRender = 0;
        }
        const rafInterval = renderNow - lastRaf;
        lastRaf = renderNow;
        if (refreshIntervals.length < 48 && rafInterval > 2 && rafInterval < 40) {
          refreshIntervals.push(rafInterval);
          if (refreshIntervals.length === 48) refreshHz = measuredRefresh(refreshIntervals);
        }
        const baseFps = playbackRef.current || cam === "free" ? playbackFps(refreshHz) : 15;
        const targetFps = qualityRef.current === "low" ? Math.min(30, baseFps) : baseFps;
        const interval = 1000 / targetFps;
        scene.metadata.studio.refreshHz = refreshHz;
        scene.metadata.studio.targetFps = targetFps;
        if (interval !== renderBudget || cam !== lastCam || pid !== lastPlayer) {
          nextRender = 0;
          renderBudget = interval;
        }
        // rAF callbacks jitter by a millisecond or more; a sub-ms tolerance drops every other vsync
        // (16 ms frames mixed with 33 ms ones). Accept anything within ~45% of a refresh period.
        if (renderNow + Math.min(interval * 0.5, 450 / refreshHz) < nextRender) return;
        // Keep a stable phase across vsync jitter without increasing the frame budget.
        nextRender = Math.max(nextRender + interval, renderNow - interval * 0.5);
        const dt = Math.min(0.1, (renderNow - lastRender) / 1000 || 1 / 60);
        lastRender = renderNow;
        const nowMs = performance.now();

        if (t !== lastT) {
          if (t < lastT - 0.001 || t - lastT > 0.75) {
            resetRequested = true;
            snap = true;
          }
          lastT = t;
          lastChange = nowMs;
        }
        const moving = playbackRef.current && nowMs - lastChange < 150;
        if (moving !== trailsOn) {
          trailsOn = moving;
          if (moving) {
            resetRequested = true;
            ballTrail.start();
            for (const r of rigs) r.trail.start();
          } else {
            ballTrail.stop();
            for (const r of rigs) r.trail.stop();
          }
        }
        ballTrail.setEnabled(moving);

        const idx = frameIndex(replay.frames, t);
        const a: Frame = replay.frames[idx];
        const b: Frame = replay.frames[Math.min(idx + 1, replay.frames.length - 1)];
        if (idx !== cachedIndex) {
          cachedIndex = idx;
          carsA = new Map(a.cars.map((car) => [car.player_id, car]));
          carsB = new Map(b.cars.map((car) => [car.player_id, car]));
        }
        if ((a.discontinuity || b.discontinuity) && idx !== lastDiscontinuity) {
          snap = true;
          resetRequested = true;
          lastDiscontinuity = idx;
        }
        const weight =
          b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;

        for (let i = 0; i < boostOrbs.length; i++) {
          const orb = boostOrbs[i];
          orb.rotation.y = t * 1.8;
          const s = 1 + Math.sin(t * 4 + i) * 0.08;
          orb.scaling.set(s, s, s);
          orb.position.y = 1.3 + Math.sin(t * 3 + i) * 0.15;
        }

        // Ball
        if (a.ball) {
          const pa = a.ball.position;
          bx = pa[0] * S;
          by = pa[2] * S;
          bz = -pa[1] * S;
          if (b.ball && !a.discontinuity && !b.discontinuity) {
            const pb = b.ball.position;
            const nx = pb[0] * S;
            const ny = pb[2] * S;
            const nz = -pb[1] * S;
            const dx = nx - bx;
            const dy = ny - by;
            const dz = nz - bz;
            if (dx * dx + dy * dy + dz * dz < 625) {
              bx += dx * weight;
              by += dy * weight;
              bz += dz * weight;
            }
          }
          ball.setEnabled(true);
          ball.position.set(bx, by, bz);
          ballOn = true;
          const ar = a.ball.rotation;
          qa.set(ar[0], ar[2], -ar[1], ar[3]);
          if (b.ball && !a.discontinuity && !b.discontinuity) {
            const br = b.ball.rotation;
            qb.set(br[0], br[2], -br[1], br[3]);
            B.Quaternion.SlerpToRef(qa, qb, weight, ball.rotationQuaternion!);
          } else ball.rotationQuaternion!.copyFrom(qa);
          ballLight.position.set(bx, by + 2.5, bz);
        } else {
          ball.setEnabled(false);
          ballOn = false;
        }

        // Cars
        for (let r = 0; r < rigs.length; r++) {
          const rig = rigs[r];
          const carA = carsA.get(rig.id);
          const carB = carsB.get(rig.id);
          const on = Boolean(carA);
          const velocity = carA?.velocity;
          rig.trail.setEnabled(
            moving &&
              !!velocity &&
              velocity[0] * velocity[0] + velocity[1] * velocity[1] + velocity[2] * velocity[2] >=
                2200 * 2200,
          );
          if (on !== rig.enabled) {
            rig.enabled = on;
            rig.root.setEnabled(on);
            if (!on) rig.contact.setEnabled(false);
            if (!on && rig.boosting) {
              rig.boosting = false;
              rig.ps.stop();
            }
          }
          if (!carA) continue;
          const pa = carA.position;
          let cx = pa[0] * S;
          let cy = pa[2] * S;
          let cz = -pa[1] * S;
          let cont = false;
          if (
            carB &&
            !a.discontinuity &&
            !b.discontinuity &&
            !carA.discontinuity &&
            !carB.discontinuity
          ) {
            const pb = carB.position;
            const dx = pb[0] * S - cx;
            const dy = pb[2] * S - cy;
            const dz = -pb[1] * S - cz;
            if (dx * dx + dy * dy + dz * dz < 625) {
              cont = true;
              cx += dx * weight;
              cy += dy * weight;
              cz += dz * weight;
            }
          }
          rig.root.position.set(cx, cy, cz);
          const q = carA.rotation;
          qa.set(q[0], q[2], -q[1], q[3]);
          const rq = rig.root.rotationQuaternion!;
          if (cont && carB) {
            const q2 = carB.rotation;
            qb.set(q2[0], q2[2], -q2[1], q2[3]);
            B.Quaternion.SlerpToRef(qa, qb, weight, rq);
          } else {
            rq.copyFrom(qa);
          }

          // Low-cost local contact shading. The recorded car transform stays untouched.
          // Most cars use the flat turf fast path; only wall/cove poses need mesh rays.
          const up = tmpUp.copyFrom(upAxis).applyRotationQuaternionInPlace(rq);
          let hasPoint = false;
          let gap = Infinity;
          tmpNormal.copyFrom(upAxis);
          if (
            up.y > 0.97 &&
            cy < 1.8 &&
            Math.abs(cx) < 37.5 &&
            Math.abs(cz) < 47 &&
            Math.abs(cx) + Math.abs(cz) < 76
          ) {
            gap = cy - 0.03;
            tmpHit.set(cx, 0.03, cz);
            hasPoint = true;
          } else if (Math.abs(cx) > 37 || Math.abs(cz) > 47 || Math.abs(cx) + Math.abs(cz) > 76) {
            downRay.origin.copyFrom(rig.root.position);
            downRay.direction.set(-up.x, -up.y, -up.z);
            downRay.length = 1.6;
            for (const mesh of contactMeshes) {
              const hit = mesh.intersects(downRay, false);
              if (hit.hit && hit.distance < gap && hit.pickedPoint) {
                gap = hit.distance;
                tmpHit.copyFrom(hit.pickedPoint);
                hasPoint = true;
                const n = hit.getNormal(true);
                if (n) tmpNormal.copyFrom(n);
                else tmpNormal.copyFrom(up);
                if (V3.Dot(tmpNormal, up) < 0) tmpNormal.scaleInPlace(-1);
              }
            }
          }
          const visible = hasPoint && gap >= 0 && gap < 1.5;
          rig.contact.setEnabled(visible);
          if (visible) {
            rig.contact.position
              .copyFrom(tmpHit)
              .addInPlace(tmpOrigin.copyFrom(tmpNormal).scaleInPlace(0.012));
            tmpFront.copyFrom(unitX).applyRotationQuaternionInPlace(rq);
            tmpFront.subtractInPlace(
              tmpOrigin.copyFrom(tmpNormal).scaleInPlace(V3.Dot(tmpFront, tmpNormal)),
            );
            if (tmpFront.lengthSquared() < 0.001) V3.CrossToRef(tmpNormal, unitZ, tmpFront);
            tmpFront.normalize();
            V3.CrossToRef(tmpFront, tmpNormal, tmpRight).normalize();
            B.Quaternion.FromLookDirectionLHToRef(
              tmpRight,
              tmpNormal,
              rig.contact.rotationQuaternion!,
            );
            rig.contact.scaling.setAll(1 + Math.max(0, gap - 0.18) * 0.3);
            rig.contact.visibility = Math.max(0, 1 - Math.max(0, gap - 0.18) / 1.32);
          }

          const isBoosting =
            moving &&
            cont &&
            !resetRequested &&
            carA.boost != null &&
            carB?.boost != null &&
            carB.boost < carA.boost;
          if (isBoosting !== rig.boosting) {
            rig.boosting = isBoosting;
            if (isBoosting) rig.ps.start();
            else rig.ps.stop();
          }
        }

        // Reset after applying recorded transforms, so seeks never leave a streak from the old pose.
        if (resetRequested) {
          resetTrails();
          resetRequested = false;
        }

        // Player chase and Ball Cam both stay mounted behind the selected car.
        const playerRig = rigById.get(pid ?? "");
        const followed = playerRig ?? rigs.find((r) => r.enabled);
        if (cam !== lastCam || pid !== lastPlayer) {
          // Spectator cutaway: keep wide views unobstructed by the near wall,
          // roof cage or outside seating. Restore full surfaces for player cameras.
          view.detachControl();
          view.mode = cam === "top" ? B.Camera.ORTHOGRAPHIC_CAMERA : B.Camera.PERSPECTIVE_CAMERA;
          if (cam === "free") {
            if (lastCam === "top") {
              view.beta = 1.1;
              view.radius = 85;
            }
            view.attachControl(canvasRef.current, true);
          }
          lastCam = cam;
          lastPlayer = pid;
          snap = true;
        }
        for (const rig of rigs)
          rig.label.setEnabled(
            rig.enabled && !(rig === followed && (cam === "player" || cam === "ball")),
          );
        if ((cam === "player" || cam === "ball") && followed) {
          scene.activeCamera = chase;
          chase.fov = (stateRef.current.profile.fov * Math.PI) / 180;
          const pp = followed.root.position;
          const rq = followed.root.rotationQuaternion!;
          const forward = {
            x: 1 - 2 * (rq.y * rq.y + rq.z * rq.z),
            y: 0,
            z: 2 * (rq.x * rq.z - rq.w * rq.y),
          };
          // Keep the last ground heading while the car's nose points straight up/down.
          if (Math.hypot(forward.x, forward.z) > 0.01) chaseHeading.set(forward.x, 0, forward.z);
          const pose = chasePose(
            pp,
            chaseHeading,
            cam === "ball" && ballOn ? { x: bx, y: by, z: bz } : undefined,
            stateRef.current.profile,
          );
          desiredEye.set(pose.eye.x, pose.eye.y, pose.eye.z);
          desiredTarget.set(pose.target.x, pose.target.y, pose.target.z);
          if (snap || B.Vector3.DistanceSquared(chase.position, desiredEye) > 100) {
            chase.position.copyFrom(desiredEye);
            lookTarget.copyFrom(desiredTarget);
            snap = false;
          } else {
            // Position follows more firmly than the swivel; exponential response is FPS-independent.
            B.Vector3.LerpToRef(
              chase.position,
              desiredEye,
              damping(18 + stateRef.current.profile.stiffness * 20, dt),
              chase.position,
            );
            B.Vector3.LerpToRef(lookTarget, desiredTarget, damping(12, dt), lookTarget);
          }
          if (Math.abs(pp.x) > 28 || Math.abs(pp.z) > 39 || pp.y < 3) {
            const origin = tmpOrigin.copyFrom(pp);
            const normal = tmpNormal.copyFrom(upAxis).applyRotationQuaternionInPlace(rq);
            origin.addInPlace(normal.scaleInPlace(0.12));
            const direction = chase.position.subtractToRef(origin, tmpDir);
            const length = direction.length();
            if (length > 0.001) {
              direction.scaleInPlace(1 / length);
              camRay.origin.copyFrom(origin);
              camRay.direction.copyFrom(direction);
              camRay.length = length;
              let safeLength = length;
              for (const mesh of contactMeshes) {
                const hit = mesh.intersects(camRay, false);
                if (hit.hit && hit.distance > 0.001)
                  safeLength = Math.min(safeLength, Math.max(0.1, hit.distance - 0.15));
              }
              if (safeLength < length)
                chase.position.copyFrom(origin).addInPlace(direction.scaleInPlace(safeLength));
            }
          }
          chase.setTarget(lookTarget);
        } else {
          scene.activeCamera = view;
          if (cam === "top") {
            const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
            const halfH = Math.max(62, 48 / aspect);
            view.orthoTop = halfH;
            view.orthoBottom = -halfH;
            view.orthoLeft = -halfH * aspect;
            view.orthoRight = halfH * aspect;
            view.target.set(0, 0, 0);
            view.alpha = -Math.PI / 2;
            view.beta = 0.001;
            view.radius = 120;
          } else if (cam !== "free") {
            desiredTarget.set(ballOn ? bx * 0.45 : 0, 2, ballOn ? bz * 0.85 : 0);
            if (snap) {
              view.target.copyFrom(desiredTarget);
              snap = false;
            } else B.Vector3.LerpToRef(view.target, desiredTarget, damping(3, dt), view.target);
            view.alpha = Math.PI;
            view.beta = 0.8;
            view.radius = 47;
          }
        }

        const eye = scene.activeCamera?.position;
        const outside = !!eye && (eye.y > 20.44 || Math.abs(eye.x) > 40.96 || Math.abs(eye.z) > 60);
        const spectator =
          cutawayRef.current &&
          (cam === "top" || cam === "broadcast" || (cam === "free" && outside));
        if (spectator !== lastSpectator) {
          lastSpectator = spectator;
          ceiling.setEnabled(!spectator);
          upperTransitions?.setEnabled(!spectator);
          wallSurface.alpha = spectator ? 0.18 : 1;
          stadiumCage?.setEnabled(!spectator);
          for (const mesh of scenery) mesh.setEnabled(!spectator);
        }
        scene.render();
        renderedFrames++;
        frameCpu.push(performance.now() - renderNow);
        if (priorRender) frameIntervals.push(renderNow - priorRender);
        priorRender = renderNow;
        if (frameCpu.length > 400) frameCpu.shift();
        if (frameIntervals.length > 400) frameIntervals.shift();
      });

      const resize = () => {
        engine.setHardwareScalingLevel(
          qualityRef.current === "low" ? 1 : renderScale(window.devicePixelRatio),
        );
        engine.resize();
      };
      window.addEventListener("resize", resize);
      const observer = new ResizeObserver(resize);
      observer.observe(canvasRef.current);

      cleanup = () => {
        observer.disconnect();
        window.removeEventListener("resize", resize);
        engine.stopRenderLoop();
        delete diagnosticCanvas.__antirlDiagnostics;
        for (const r of rigs) r.ps.dispose();
        shadows.dispose();
        glow.dispose();
        scene.dispose();
        engine.dispose();
      };

      setReady(true);
    })
    .catch((e) => {
      cleanup?.();
      if (!disposed) setError("3D rendering failed to initialize: " + String(e));
    });

  return () => {
    disposed = true;
    cleanup?.();
  };
}
