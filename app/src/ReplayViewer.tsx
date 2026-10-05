import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Video,
  Eye,
  Compass,
  Tv,
  Layers,
  Sparkles,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type { ReplayAnalysis, Frame } from "./types";
import { chasePose, damping, frameIndex, PRO_CAMERA, scoreAt } from "./replayMath";
import { loadViewerMesh } from "./viewerAssets";
import { OCTANE_AXLES, SOURCE_WHEEL_RADIUS } from "./viewerGeometry";
import { measuredRefresh, playbackFps, renderScale } from "./viewerQuality";
import BoostRing from "./components/BoostRing";
import { drawBrushedMetal, drawTurfDetail } from "./surfaceTextures";

export const timeLabel = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// Standard Rocket League Big Boost Pad coordinates in Babylon scale (units * 0.01)
const BIG_BOOST_PADS: [number, number, number][] = [
  [-30.72, 0.1, -40.96], // Blue Left
  [30.72, 0.1, -40.96],  // Blue Right
  [-35.84, 0.1, 0],      // Mid Left
  [35.84, 0.1, 0],       // Mid Right
  [-30.72, 0.1, 40.96],  // Orange Left
  [30.72, 0.1, 40.96],   // Orange Right
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

interface ReplayViewerProps {
  replay: ReplayAnalysis;
  playerId?: string | null;
  time: number;
  onTime: (time: number) => void;
  onSelectEvent?: (eventId: string) => void;
  seekVersion?: number;
}

export default function ReplayViewer({
  replay,
  playerId,
  time,
  onTime,
  onSelectEvent,
  seekVersion = 0,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ time, playerId, camera: "player" });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<"player" | "ball" | "broadcast" | "top" | "free">("player");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [cutaway,setCutaway]=useState(true);
  const cutawayRef=useRef(cutaway);cutawayRef.current=cutaway;
  const [expanded, setExpanded] = useState(false);

  stateRef.current = { time, playerId, camera };
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  const start = replay.frames[0]?.time ?? 0;
  const end = replay.frames.at(-1)?.time ?? replay.summary.duration_seconds;

  const clock = useRef(time);
  const publishedTime = useRef(time);
  const previousSeek = useRef(seekVersion);
  const playbackRef = useRef(playing);
  playbackRef.current = playing;
  useEffect(() => {
    if (seekVersion !== previousSeek.current || time !== publishedTime.current) {
      clock.current = time;
      setPlaying(false);
      previousSeek.current = seekVersion;
    }
  }, [time, seekVersion]);

  const publish = (value: number) => {
    clock.current = value;
    publishedTime.current = value;
    onTimeRef.current(value);
  };
  const seek = (value: number) => { setPlaying(false); publish(value); };

  useEffect(() => {
    const changed = () => setExpanded(document.fullscreenElement === surfaceRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => { document.removeEventListener("fullscreenchange", changed); };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await surfaceRef.current?.requestFullscreen();
    } catch { /* Host may disable fullscreen; regular responsive view remains usable. */ }
  };

  // Animation frame loop for playback
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();
    let lastPublish = last;
    if (clock.current >= end) {
      // Restart from the beginning when play is pressed at the end
      clock.current = start;
      publish(start);
    }

    const tick = (now: number) => {
      // Background windows should not consume CPU or advance silently.
      const dt = document.hidden ? 0 : Math.min(0.1, (now - last) / 1000);
      last = now;
      const next = Math.min(end, clock.current + dt * speed);
      clock.current = next;
      // The renderer reads clock directly; React/HUD update at 10 Hz instead of 60+ Hz.
      if (now - lastPublish >= 100 || next >= end) {
        publish(next);
        lastPublish = now;
      }
      if (next >= end) {
        setPlaying(false);
      } else {
        id = requestAnimationFrame(tick);
      }
    };

    id = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(id); publish(clock.current); };
  }, [playing, speed, end, start]);

  // Babylon 3D Scene setup and render loop
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    setReady(false);
    setError("");

    if (!replay.coverage.positions || !replay.frames.length) {
      setError(
        "Recorded positions are unavailable in this replay. The report and evidence list remain accessible."
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
        const assets = await Promise.all([loadViewerMesh("octane"), loadViewerMesh("ball"), loadViewerMesh("wheel"), loadViewerMesh("stadium")]);
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
        // Cap HiDPI fill cost without lowering the CSS canvas size.
        engine.setHardwareScalingLevel(renderScale(window.devicePixelRatio));

        cleanup = () => { engine.stopRenderLoop(); scene.dispose(); engine.dispose(); };

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

        // ---------- Camera ----------
        const view = new B.ArcRotateCamera("camera", -Math.PI / 2, 1.1, 60, new V3(0, 0, 0), scene);
        view.attachControl(canvasRef.current, true);
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
        chase.fov = PRO_CAMERA.fov * Math.PI / 180;

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

        const glow = new GlowLayer("glow", scene, { blurKernelSize: 28 });
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
        const canvasTex = (name: string, w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
          const t = new B.DynamicTexture(name, { width: w, height: h }, scene, true);
          draw(t.getContext() as unknown as CanvasRenderingContext2D);
          t.update();
          return t;
        };

        const assetMesh = (name: string, data: (typeof assets)[number], material: number | null = null) => {
          const mesh = new B.Mesh(name, scene);
          const vertices = new VertexData();
          let positions: Float32Array | number[] = data.positions;
          let uvs: Float32Array | number[] = data.uvs;
          let indices: Uint32Array | number[] = data.indices;
          if(material != null) {
            // Compact each material's vertices once, then clone its shared GPU geometry.
            // Keeping the full body/stadium buffer for every material multiplies vertex work.
            const remap = new Int32Array(data.positions.length/3).fill(-1);
            positions = []; uvs = []; indices = [];
            for(let triangle=0;triangle<data.groups.length;triangle++) {
              if(data.groups[triangle]!==material) continue;
              for(let k=0;k<3;k++) {
                const original=data.indices[triangle*3+k];
                if(remap[original]===-1) {
                  remap[original]=positions.length/3;
                  positions.push(data.positions[original*3],data.positions[original*3+1],data.positions[original*3+2]);
                  uvs.push(data.uvs[original*2],data.uvs[original*2+1]);
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
          const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
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
        const turfDetail = canvasTex("turfDetail",1024,1024,c=>drawTurfDetail(c));
        turfDetail.uScale=FW/4; turfDetail.vScale=FH/4;
        turfDetail.wrapU=B.Texture.WRAP_ADDRESSMODE; turfDetail.wrapV=B.Texture.WRAP_ADDRESSMODE;
        turfDetail.anisotropicFilteringLevel=anisotropy;
        turfDetail.updateSamplingMode(B.Texture.TRILINEAR_SAMPLINGMODE);
        floorMat.detailMap.texture=turfDetail;
        floorMat.detailMap.diffuseBlendLevel=0.7; floorMat.detailMap.bumpLevel=0.22;
        floorMat.detailMap.isEnabled=true;
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
        const crowdTex = canvasTex("crowd", 1024, 128, c => {
          c.fillStyle = "#172437"; c.fillRect(0, 0, 1024, 128);
          for (let row = 0; row < 12; row++) {
            c.fillStyle = "#304158"; c.fillRect(0, row * 11 + 8, 1024, 2);
            for (let seat = 0; seat < 180; seat++) {
              c.fillStyle = ["#7292ab", "#d6d4bf", "#476b8f", "#b4805e"][(seat * 7 + row * 11) % 4];
              c.fillRect(seat * 6 + row % 2 * 3, row * 11 + 2, 2, 4);
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
            const stand = B.MeshBuilder.CreateBox(`stand-${side}-${end}`, { width: end ? 130 : 8, height: 14, depth: end ? 8 : 114 }, scene);
            stand.position.set(end ? 0 : side * 52, 12, end ? side * 64 : 0);
            stand.material = crowdMat; stand.isPickable = false; stand.freezeWorldMatrix();
            const roof = B.MeshBuilder.CreateBox(`stand-roof-${side}-${end}`, { width: end ? 132 : 11, height: 0.6, depth: end ? 11 : 116 }, scene);
            roof.position.set(stand.position.x, 20, stand.position.z);
            roof.material = emissiveMat(`stadium-roof-${side}-${end}`, "#283b52");
            roof.isPickable = false; roof.freezeWorldMatrix();
            scenery.push(stand, roof);
          }
        }

        // Original standard-field modules: rounded goal frames, curved trim and cage.
        // Baked once in source transforms; all car poses remain recorded replay poses.
        const steel = new B.StandardMaterial("stadiumSteel", scene);
        steel.diffuseColor = hex("#303c48");
        steel.emissiveColor = hex("#17202a");
        steel.specularColor = C3.Black(); steel.specularPower = 96;
        steel.backFaceCulling = false;
        const metalTexture=canvasTex("brushedMetal",512,512,c=>drawBrushedMetal(c));
        metalTexture.wrapU=B.Texture.WRAP_ADDRESSMODE; metalTexture.wrapV=B.Texture.WRAP_ADDRESSMODE;
        metalTexture.anisotropicFilteringLevel=anisotropy;
        steel.diffuseColor=C3.White(); steel.diffuseTexture=metalTexture;
        const frameSteel = steel.clone("stadiumFrameSteel");
        frameSteel.diffuseTexture=null;
        frameSteel.disableLighting = false;
        frameSteel.emissiveColor = hex("#3f4c5c");
        const teamTrim = [BLUE, ORANGE].map((color, index) => {
          const m = new B.StandardMaterial(`stadiumTeam-${index}`, scene);
          m.diffuseColor = hex(color); m.emissiveColor = hex(color).scale(0.45);
          m.specularColor = hex("#b0becb"); m.specularPower = 80; m.backFaceCulling = false;
          return m;
        });
        const stadiumGlass = new B.StandardMaterial("stadiumGlass", scene);
        stadiumGlass.diffuseColor = hex("#3a5972"); stadiumGlass.alpha = 0.26;
        stadiumGlass.backFaceCulling = false;
        const stadiumMaterials = [frameSteel, ...teamTrim, stadiumGlass, frameSteel];
        for (let group = 0; group < assets[3].materialCount; group++) {
          const module = assetMesh(`stadium-module-${group}`, assets[3], group);
          module.material = stadiumMaterials[group];
          module.receiveShadows = true; module.freezeWorldMatrix();
          glow.addExcludedMesh(module);
        }

        // Visible driving surface uses the exact RocketSim collision triangles, including
        // lower coves, diagonal corners and goal tunnels. Flat boxes cannot represent them.
        const am = await import("./arenaMesh");
        if (disposed) return;
        const bin = Uint8Array.from(atob(am.ARENA_B64), ch => ch.charCodeAt(0));
        const vi = new Int16Array(bin.buffer, 0, am.ARENA_VERTS * 3);
        const ii = new Uint16Array(bin.buffer, am.ARENA_VERTS * 6, (bin.length - am.ARENA_VERTS * 6) / 2);
        const pos = Float32Array.from(vi, value => value / 500);
        const rampIndices: number[] = [], wallIndices: number[] = [], ceilingIndices:number[] = [];
        for (let i = 0; i < ii.length; i += 3) {
          const height = (pos[ii[i]*3+1] + pos[ii[i+1]*3+1] + pos[ii[i+2]*3+1]) / 3;
          // Retain upper curved transitions; cutaway changes visibility only.
          (height > 18 ? ceilingIndices : height < 2.56 ? rampIndices : wallIndices).push(ii[i], ii[i+1], ii[i+2]);
        }
        const hexTex = canvasTex("wallHex", 256, 256, c => {
          c.fillStyle = "#344855"; c.fillRect(0,0,256,256);
          c.strokeStyle = "#657b87"; c.lineWidth = 1.3;
          for (let row=-1; row<9; row++) for (let col=-1; col<8; col++) {
            const x=col*48+(row%2)*24, y=row*28;
            c.beginPath();
            for(let k=0;k<6;k++) {
              const a=Math.PI/3*k, px=x+27*Math.cos(a), py=y+16*Math.sin(a);
              if(k===0)c.moveTo(px,py);else c.lineTo(px,py);
            }
            c.closePath(); c.stroke();
          }
        });
        const wallSurface = new B.StandardMaterial("wallSurface", scene);
        hexTex.anisotropicFilteringLevel=anisotropy;
        hexTex.wrapU = B.Texture.WRAP_ADDRESSMODE; hexTex.wrapV = B.Texture.WRAP_ADDRESSMODE;
        wallSurface.diffuseTexture = hexTex;
        wallSurface.emissiveColor = C3.Black();
        wallSurface.specularColor = hex("#597584"); wallSurface.specularPower = 90;
        wallSurface.backFaceCulling = false;
        const contactMeshes: InstanceType<typeof B.Mesh>[] = [];
        const surface = (name: string, indices: number[], material: InstanceType<typeof B.StandardMaterial>) => {
          const vd = new VertexData(); const normals: number[] = [];
          VertexData.ComputeNormals(pos, indices, normals);
          vd.positions = pos; vd.indices = indices; vd.normals = normals;
          // World-space perimeter distance avoids stretched or discontinuous wall hexes.
          vd.uvs = Array.from({length:am.ARENA_VERTS*2}, (_,i) => {
            const v=Math.floor(i/2)*3;
            return i%2 ? pos[v+1]/3 : (Math.atan2(pos[v+2],pos[v])+Math.PI)*16;
          });
          const mesh = new B.Mesh(name, scene); vd.applyToMesh(mesh);
          mesh.material = material; mesh.receiveShadows = true;
          mesh.isPickable = false; mesh.freezeWorldMatrix();
          contactMeshes.push(mesh); glow.addExcludedMesh(mesh);
        };
        surface("arena-ramps", rampIndices, steel);
        surface("arena-walls", wallIndices, wallSurface);
        const ceilingMat=steel.clone("ceilingSurface"); ceilingMat.emissiveColor=C3.Black();
        surface("arena-upper-transitions",ceilingIndices,ceilingMat);
        const ceiling=B.MeshBuilder.CreatePlane("arena-ceiling",{width:81.92,height:102.4,sideOrientation:B.Mesh.DOUBLESIDE},scene);
        ceiling.rotation.x=Math.PI/2;ceiling.position.y=20.44;ceiling.material=ceilingMat;ceiling.isPickable=false;ceiling.receiveShadows=true;ceiling.freezeWorldMatrix();
        contactMeshes.push(ceiling);glow.addExcludedMesh(ceiling);
        // RocketSim uses infinite planes for flat side walls, omitted from its mesh cache.
        for (const sign of [-1,1]) {
          const wall = B.MeshBuilder.CreatePlane(`side-wall-${sign}`, {width:71.68,height:20.44,sideOrientation:B.Mesh.DOUBLESIDE},scene);
          wall.rotation.y = Math.PI/2; wall.position.set(sign*40.96,10.22,0);
          const uv = wall.getVerticesData("uv")!;
          wall.setVerticesData("uv", uv.map((value,index)=>value*(index%2 ? 20.44 : 71.68)/3));
          wall.material = wallSurface; wall.isPickable = false; wall.freezeWorldMatrix();
          contactMeshes.push(wall); glow.addExcludedMesh(wall);
        }

        // ---------- Boost pads ----------
        const gold = emissiveMat("padGold", "#ffb02e", 1, 1.1);
        const goldDim = emissiveMat("padGoldDim", "#ffb02e", 0.55, 0.8);
        const baseDark = emissiveMat("padBase", "#0b111c");
        const boostOrbs: InstanceType<typeof B.Mesh>[] = [];
        BIG_BOOST_PADS.forEach((p, i) => {
          const base = B.MeshBuilder.CreateCylinder(`bigPad-${i}`, { diameter: 3.4, height: 0.1, tessellation: 6 }, scene);
          base.position.set(p[0], 0.05, p[2]);
          base.material = baseDark;
          base.freezeWorldMatrix();
          const ring = B.MeshBuilder.CreateCylinder(`bigRing-${i}`, { diameter: 3.0, height: 0.14, tessellation: 6 }, scene);
          ring.position.set(p[0], 0.06, p[2]);
          ring.material = goldDim;
          ring.freezeWorldMatrix();
          const orb = B.MeshBuilder.CreateSphere(`bigOrb-${i}`, { diameter: 0.85, segments: 12 }, scene);
          orb.position.set(p[0], 0.65, p[2]);
          orb.material = gold;
          boostOrbs.push(orb);
        });
        SMALL_BOOST_PADS.forEach((p, i) => {
          const d = B.MeshBuilder.CreateCylinder(`smallPad-${i}`, { diameter: 1.5, height: 0.08, tessellation: 6 }, scene);
          d.position.set(p[0], 0.045, p[2]);
          d.material = goldDim;
          d.freezeWorldMatrix();
        });

        // Imported Rocket League geometry is built once and cloned with shared buffers.
        const ballMat = new PBRMaterial("ballMat", scene);
        // Bevy cache UVs use top-left image origin.
        ballMat.albedoTexture = new B.Texture("/viewer/ball.webp", scene, false, false);
        ballMat.albedoTexture.anisotropicFilteringLevel=anisotropy;
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
        chassisMat.albedoTexture.anisotropicFilteringLevel=anisotropy;
        chassisMat.metallicTexture.anisotropicFilteringLevel=anisotropy;
        chassisMat.useRoughnessFromMetallicTextureGreen = true;
        chassisMat.useRoughnessFromMetallicTextureAlpha = false;
        chassisMat.useMetallnessFromMetallicTextureBlue = true;
        chassisMat.metallic = 1; chassisMat.roughness = 0.48;
        const windowMat = new PBRMaterial("octaneWindows", scene);
        windowMat.albedoColor = hex("#101c27"); windowMat.metallic = 0.15; windowMat.roughness = 0.12;
        const rubberMat = new PBRMaterial("wheelRubber", scene);
        rubberMat.albedoColor = hex("#171b20"); rubberMat.metallic = 0; rubberMat.roughness = 0.8;
        const rimMat = new PBRMaterial("carRim", scene);
        rimMat.albedoColor = hex("#e5ecf7");
        rimMat.metallic = 0.9;
        rimMat.roughness = 0.2;
        const carPrototypes = Array.from({ length: assets[0].materialCount }, (_, index) => {
          const mesh = assetMesh(`octane-template-${index}`, assets[0], index);
          mesh.setEnabled(false);
          return mesh;
        });

        const wheelPrototypes = Array.from({length:assets[2].materialCount}, (_,index) => {
          const mesh = assetMesh(`wheel-template-${index}`,assets[2],index);
          mesh.setEnabled(false); return mesh;
        });

        const contactTexture=canvasTex("surfaceContact",128,128,c=>{
          const gradient=c.createRadialGradient(64,64,8,64,64,64);
          gradient.addColorStop(0,"rgba(0,0,0,0.65)");
          gradient.addColorStop(0.5,"rgba(0,0,0,0.32)"); gradient.addColorStop(1,"rgba(0,0,0,0)");
          c.fillStyle=gradient;c.fillRect(0,0,128,128);
        });
        contactTexture.hasAlpha=true;
        const contactMaterial=new B.StandardMaterial("contactShade",scene);
        contactMaterial.diffuseTexture=contactTexture;
        contactMaterial.useAlphaFromDiffuseTexture=true;
        contactMaterial.disableLighting=true;contactMaterial.emissiveColor=C3.Black();
        contactMaterial.backFaceCulling=false;contactMaterial.disableDepthWrite=true;

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
          cast = true
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
          for (const {x, y, halfTrack, radius} of OCTANE_AXLES) {
            for (const side of [-1,1]) for(let group=0;group<wheelPrototypes.length;group++) {
              const wheel = wheelPrototypes[group].clone(`wheel-${p.id}-${x}-${side}-${group}`,root)!;
              wheel.setEnabled(true);
              wheel.scaling.setAll(radius / SOURCE_WHEEL_RADIUS);
              wheel.rotation.x = side > 0 ? Math.PI : 0;
              part(root,wheel,group===0 ? rimMat : rubberMat,x,y,side*halfTrack);
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
          sys.createBoxEmitter(new V3(-1, 0.08, -0.12), new V3(-1, -0.05, 0.12), new V3(0, -0.05, -0.2), new V3(0, 0.05, 0.2));
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
            c.font = "600 38px 'Plus Jakarta Sans', Inter, sans-serif";
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

          const contact=B.MeshBuilder.CreateGround(`contact-${p.id}`,{width:2,height:1.35},scene);
          contact.material=contactMaterial;contact.isPickable=false;
          contact.rotationQuaternion=new B.Quaternion();
          contact.setEnabled(false);glow.addExcludedMesh(contact);
          const rig: Rig = { id: p.id, team, root, ps: sys, trail, label, contact, boosting: false, enabled: true };
          rigs.push(rig);
          rigById.set(p.id, rig);
        }

        const qa = new B.Quaternion();
        const qb = new B.Quaternion();
        let lastCam = "";
        let lastPlayer: string | null | undefined;
        const desiredEye = new V3();
        const desiredTarget = new V3();
        const lookTarget = new V3();
        const chaseHeading = new V3(1, 0, 0);
        let lastT = stateRef.current.time;
        let lastChange = 0;
        let lastDiscontinuity = -1;
        let cachedIndex = -1;
        let carsA = new Map<string, Frame["cars"][number]>();
        let carsB = new Map<string, Frame["cars"][number]>();
        let lastRender = 0;
        let nextRender = 0;
        let renderBudget = 0;

        let refreshHz=60, lastRaf=0;
        const refreshIntervals: number[]=[];
        scene.metadata={studio:{refreshHz:60,targetFps:60}};
        let trailsOn = false;
        let resetRequested = true;
        let snap = true;
        let bx = 0;
        let by = 0;
        let bz = 0;
        let ballOn = false;
        const resetTrails = () => {
          ballTrail.reset();
          for (const r of rigs) { r.trail.reset(); r.ps.stop(); r.ps.reset(); r.boosting=false; }
        };

        engine.runRenderLoop(() => {
          const { playerId: pid, camera: cam } = stateRef.current;
          const t = clock.current;
          if (document.hidden) return;
          const renderNow = performance.now();
          const rafInterval=renderNow-lastRaf; lastRaf=renderNow;
          if(refreshIntervals.length<48 && rafInterval>2 && rafInterval<40) {
            refreshIntervals.push(rafInterval);
            if(refreshIntervals.length===48) refreshHz=measuredRefresh(refreshIntervals);
          }
          const targetFps=playbackRef.current || cam === "free" ? playbackFps(refreshHz) : 15;
          const interval=1000/targetFps;
          scene.metadata.studio.refreshHz=refreshHz;scene.metadata.studio.targetFps=targetFps;
          if(interval!==renderBudget || cam!==lastCam || pid!==lastPlayer) {nextRender=0;renderBudget=interval;}
          if(renderNow+0.25<nextRender) return;
          // Keep a stable phase across vsync jitter without increasing the frame budget.
          nextRender=Math.max(nextRender+interval,renderNow);
          const dt = Math.min(0.1, (renderNow - lastRender) / 1000 || 1 / 60);
          lastRender = renderNow;
          const nowMs = performance.now();

          if (t !== lastT) {
            if (t < lastT - 0.001 || t - lastT > 0.75) { resetRequested = true; snap = true; }
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
            carsA = new Map(a.cars.map(car => [car.player_id, car]));
            carsB = new Map(b.cars.map(car => [car.player_id, car]));
          }
          if ((a.discontinuity || b.discontinuity) && idx !== lastDiscontinuity) { snap = true; resetRequested = true; lastDiscontinuity = idx; }
          const weight = b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;

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
            rig.trail.setEnabled(moving && !!velocity && Math.hypot(...velocity) >= 2200);
            if (on !== rig.enabled) {
              rig.enabled = on;
              rig.root.setEnabled(on);
              if(!on)rig.contact.setEnabled(false);
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
            if (carB && !a.discontinuity && !b.discontinuity && !carA.discontinuity && !carB.discontinuity) {
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
            const up=V3.Up().applyRotationQuaternion(rq);
            let point: InstanceType<typeof B.Vector3> | null=null;
            let normal=V3.Up(), gap=Infinity;
            if(up.y>0.97 && cy<1.8 && Math.abs(cx)<37.5 && Math.abs(cz)<47 && Math.abs(cx)+Math.abs(cz)<76) {
              gap=cy-0.03;point=new V3(cx,0.03,cz);
            } else if(Math.abs(cx)>37 || Math.abs(cz)>47 || Math.abs(cx)+Math.abs(cz)>76) {
              const ray=new B.Ray(rig.root.position,up.scale(-1),1.6);
              for(const mesh of contactMeshes) {
                const hit=mesh.intersects(ray,false);
                if(hit.hit && hit.distance<gap && hit.pickedPoint) {
                  gap=hit.distance;point=hit.pickedPoint;
                  normal=hit.getNormal(true) || up.clone();
                  if(V3.Dot(normal,up)<0)normal.scaleInPlace(-1);
                }
              }
            }
            const visible=!!point && gap>=0 && gap<1.5;
            rig.contact.setEnabled(visible);
            if(visible && point) {
              rig.contact.position.copyFrom(point.add(normal.scale(0.012)));
              const front=new V3(1,0,0).applyRotationQuaternion(rq);
              front.subtractInPlace(normal.scale(V3.Dot(front,normal)));
              if(front.lengthSquared()<0.001)front.copyFrom(V3.Cross(normal,new V3(0,0,1)));
              front.normalize();
              const right=V3.Cross(front,normal).normalize();
              B.Quaternion.FromLookDirectionLHToRef(right,normal,rig.contact.rotationQuaternion!);
              rig.contact.scaling.setAll(1+Math.max(0,gap-0.18)*0.3);
              rig.contact.visibility=Math.max(0,1-Math.max(0,gap-0.18)/1.32);
            }

            const isBoosting = moving && cont && !resetRequested && carA.boost != null && carB?.boost != null && carB.boost < carA.boost;
            if (isBoosting !== rig.boosting) {
              rig.boosting = isBoosting;
              if (isBoosting) rig.ps.start();
              else rig.ps.stop();
            }
          }

          // Reset after applying recorded transforms, so seeks never leave a streak from the old pose.
          if (resetRequested) { resetTrails(); resetRequested = false; }

          // Player chase and Ball Cam both stay mounted behind the selected car.
          const playerRig = rigById.get(pid ?? "");
          const followed = playerRig ?? rigs.find(r => r.enabled);
          if (cam !== lastCam || pid !== lastPlayer) {
            // Spectator cutaway: keep wide views unobstructed by the near wall,
            // roof cage or outside seating. Restore full surfaces for player cameras.
            const spectator = cutawayRef.current && (cam === "broadcast" || cam === "top");
            wallSurface.alpha = spectator ? 0.12 : 1;
            scene.getMeshByName("stadium-module-4")?.setEnabled(!spectator);
            for(const mesh of scenery) mesh.setEnabled(!spectator);
            view.detachControl();
            view.mode = cam === "top" ? B.Camera.ORTHOGRAPHIC_CAMERA : B.Camera.PERSPECTIVE_CAMERA;
            if (cam === "free") {
              if (lastCam === "top") { view.beta = 1.1; view.radius = 85; }
              view.attachControl(canvasRef.current, true);
            }
            lastCam = cam;
            lastPlayer = pid;
            snap = true;
          }
          for (const rig of rigs) rig.label.setEnabled(rig.enabled && !(rig === followed && (cam === "player" || cam === "ball")));
          if ((cam === "player" || cam === "ball") && followed) {
            scene.activeCamera = chase;
            const pp = followed.root.position;
            const rq = followed.root.rotationQuaternion!;
            const forward = { x: 1 - 2 * (rq.y * rq.y + rq.z * rq.z), y: 0, z: 2 * (rq.x * rq.z - rq.w * rq.y) };
            // Keep the last ground heading while the car's nose points straight up/down.
            if (Math.hypot(forward.x, forward.z) > 0.01) chaseHeading.set(forward.x, 0, forward.z);
            const pose = chasePose(pp, chaseHeading, cam === "ball" && ballOn ? { x: bx, y: by, z: bz } : undefined);
            desiredEye.set(pose.eye.x, pose.eye.y, pose.eye.z);
            desiredTarget.set(pose.target.x, pose.target.y, pose.target.z);
            if (snap || B.Vector3.DistanceSquared(chase.position, desiredEye) > 100) {
              chase.position.copyFrom(desiredEye);
              lookTarget.copyFrom(desiredTarget);
              snap = false;
            } else {
              // Position follows more firmly than the swivel; exponential response is FPS-independent.
              B.Vector3.LerpToRef(chase.position, desiredEye, damping(18 + PRO_CAMERA.stiffness * 20, dt), chase.position);
              B.Vector3.LerpToRef(lookTarget, desiredTarget, damping(12, dt), lookTarget);
            }
            if (Math.abs(pp.x)>28 || Math.abs(pp.z)>39 || pp.y<3) {
              const origin = pp.clone();
              const normal = B.Vector3.Up().applyRotationQuaternion(rq);
              origin.addInPlace(normal.scale(0.12));
              const direction = chase.position.subtract(origin);
              const length = direction.length();
              if(length>0.001) {
                direction.scaleInPlace(1/length);
                const ray = new B.Ray(origin,direction,length);
                let safeLength=length;
                for(const mesh of contactMeshes) {
                  const hit=mesh.intersects(ray,false);
                  if(hit.hit && hit.distance>0.001) safeLength=Math.min(safeLength,Math.max(0.1,hit.distance-0.15));
                }
                if(safeLength<length) chase.position.copyFrom(origin.add(direction.scale(safeLength)));
              }
            }
            chase.setTarget(lookTarget);
          } else {
            scene.activeCamera = view;
            if (cam === "top") {
              const aspect = engine.getRenderWidth() / Math.max(1, engine.getRenderHeight());
              const halfH = Math.max(62, 48 / aspect);
              view.orthoTop = halfH; view.orthoBottom = -halfH;
              view.orthoLeft = -halfH * aspect; view.orthoRight = halfH * aspect;
              view.target.set(0, 0, 0); view.alpha = -Math.PI / 2; view.beta = 0.001; view.radius = 120;
            } else if (cam !== "free") {
              desiredTarget.set(ballOn ? bx * 0.45 : 0, 2, ballOn ? bz * 0.85 : 0);
              if (snap) { view.target.copyFrom(desiredTarget); snap = false; }
              else B.Vector3.LerpToRef(view.target, desiredTarget, damping(3, dt), view.target);
              view.alpha = Math.PI; view.beta = 0.8; view.radius = 47;
            }
          }

          const eye=scene.activeCamera?.position;
          const outside=!!eye && (eye.y>20.44 || Math.abs(eye.x)>40.96 || Math.abs(eye.z)>60);
          const spectator=cutawayRef.current && (cam==="top" || cam==="broadcast" || (cam==="free" && outside));
          ceiling.setEnabled(!spectator);scene.getMeshByName("arena-upper-transitions")?.setEnabled(!spectator);
          wallSurface.alpha=spectator?0.18:1;
          scene.getMeshByName("stadium-module-4")?.setEnabled(!spectator);
          for(const mesh of scenery)mesh.setEnabled(!spectator);
          scene.render();
        });

        const resize = () => {engine.setHardwareScalingLevel(renderScale(window.devicePixelRatio));engine.resize();};
        window.addEventListener("resize", resize);
        const observer = new ResizeObserver(resize);
        observer.observe(canvasRef.current);

        cleanup = () => {
          observer.disconnect();
          window.removeEventListener("resize", resize);
          engine.stopRenderLoop();
          for (const r of rigs) r.ps.dispose();
          shadows.dispose();
          glow.dispose();
          scene.dispose();
          engine.dispose();
        };

        setReady(true);
      })
      .catch((e) => { cleanup?.(); if (!disposed) setError("3D rendering failed to initialize: " + String(e)); });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [replay]);

  const currentFrame = useMemo(() => replay.frames[frameIndex(replay.frames, time)], [replay.frames, time]);
  const scores = useMemo(() => scoreAt(replay.events, [replay.summary.blue_score, replay.summary.orange_score], time), [replay.events, replay.summary, time]);
  const currentCar = currentFrame?.cars.find((c) => c.player_id === playerId);
  const selectedPlayer = replay.players.find((p) => p.id === playerId);

  const frameStep = (dir: number) => {
    const index = frameIndex(replay.frames, clock.current);
    const exact = Math.abs((replay.frames[index]?.time ?? 0) - clock.current) < 0.001;
    const next = dir > 0 ? index + 1 : exact ? index - 1 : index;
    seek(replay.frames[Math.max(0, Math.min(replay.frames.length - 1, next))]?.time ?? start);
  };
  const seekRelative = (delta: number) => seek(Math.max(start, Math.min(end, clock.current + delta)));

  return (
    <div ref={surfaceRef} className="studio-main" aria-label="Replay 3D Studio">
      {/* 3D Arena Surface */}
      <div
        className="arena-wrapper"
        tabIndex={0}
        aria-label="Replay arena canvas. Space to toggle play/pause, left/right arrows to step frames, 1-5 for camera views."
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,select,textarea,button")) return;
          if (e.key === " ") {
            e.preventDefault();
            setPlaying((p) => !p);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            e.shiftKey ? seekRelative(-5) : frameStep(-1);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            e.shiftKey ? seekRelative(5) : frameStep(1);
          } else if (["1", "2", "3", "4", "5"].includes(e.key)) {
            e.preventDefault();
            setCamera(
              (["player", "ball", "broadcast", "top", "free"] as const)[Number(e.key) - 1]
            );
          }
        }}
      >
        <canvas ref={canvasRef} className="arena-canvas" />

        {/* HUD: Broadcast Scoreboard and Game Clock */}
        <div className="arena-hud">
          <div className="hud-broadcast-scoreboard">
            <div className="score-side blue">
              <span className="team-tag">BLUE</span>
              <span className="score-num">{scores[0] ?? "—"}</span>
            </div>

            <div className="score-clock-box">
              <span className="clock-digits">
                {currentFrame?.match_clock_seconds != null
                  ? currentFrame.match_clock_seconds < 0 ? `+${timeLabel(-currentFrame.match_clock_seconds)}` : timeLabel(currentFrame.match_clock_seconds)
                  : timeLabel(time)}
              </span>
              <span className="clock-sub">MATCH CLOCK</span>
            </div>

            <div className="score-side orange">
              <span className="score-num">{scores[1] ?? "—"}</span>
              <span className="team-tag">ORANGE</span>
            </div>
          </div>

          {/* Focused Player Telemetry Pill */}
          {selectedPlayer && (
            <div className="hud-telemetry-badge">
              <div className="telemetry-player-info">
                <span className={`team-dot ${selectedPlayer.team === 0 ? "blue" : "orange"}`} />
                <span className="player-label">{selectedPlayer.name}</span>
              </div>
              <BoostRing value={currentCar?.boost}/>

            </div>
          )}
        </div>

        {(!ready || error) && (
          <div className="arena-loading-overlay">
            {!error && <Sparkles size={24} className="spinning" color="#38BDF8" />}
            <span>{error || "Loading replay stadium…"}</span>
          </div>
        )}
      </div>

      <div style={{display:"flex",gap:12,alignItems:"center",fontSize:12}}><label><input type="checkbox" checked={cutaway} onChange={e=>setCutaway(e.target.checked)}/> Automatic spectator cutaway</label><span>Pad glow is decorative; pickup/cooldown state unavailable. Exhaust is inferred from observed boost decrease.</span></div>
      {/* Timeline & Broadcast Playback Card */}
      <div className="timeline-card">
        {/* Scrubber with Event Pins */}
        <div className="timeline-scrubber-track">
          <input
            type="range"
            className="timeline-slider"
            aria-label="Replay scrub bar"
            min={start}
            max={Math.max(end, start + 0.01)}
            step="any"
            value={Math.max(start, Math.min(time, end))}
            onChange={(e) => {
              setPlaying(false);
              seek(Number(e.target.value));
            }}
          />

          <div className="timeline-markers-layer">
            {replay.events.map((ev) => {
              const pct = Math.max(0, Math.min(100, ((ev.time - start) / Math.max(end - start, 1)) * 100));
              const pinClass =
                ev.category === "goal"
                  ? "marker-goal"
                  : ev.category === "demo"
                  ? "marker-demo"
                  : ev.severity === "strength"
                  ? "marker-strength"
                  : "marker-review";

              return (
                <button
                  key={ev.id}
                  className={`timeline-marker-pin ${pinClass}`}
                  style={{ left: `${pct}%` }}
                  title={`${timeLabel(ev.time)}: ${ev.title}`}
                  aria-label={`${timeLabel(ev.time)}: ${ev.title}`}
                  onClick={() => {
                    setPlaying(false);
                    // Seek with ~3s lead-in
                    seek(Math.max(start, ev.time - 3.0));
                    onSelectEvent?.(ev.id);
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Playback Controls & Camera Selection */}
        <div className="playback-bar">
          <div className="playback-buttons">
            <button
              className="icon-btn"
              aria-label="Restart from beginning" title="Restart from beginning"
              onClick={() => {
                setPlaying(false);
                seek(start);
              }}
            >
              <RotateCcw size={15} />
            </button>
            <button
              className="icon-btn"
              aria-label="Previous frame" title="Previous frame (Left Arrow)"
              onClick={() => frameStep(-1)}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-btn primary play-pulse"
              aria-label={playing ? "Pause replay" : "Play replay"} title={playing ? "Pause (Space)" : "Play (Space)"}
              disabled={!ready || !!error}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="icon-btn"
              aria-label="Next frame" title="Next frame (Right Arrow)"
              onClick={() => frameStep(1)}
            >
              <SkipForward size={15} />
            </button>

            <span className="time-display-box">
              {timeLabel(time)} <span className="time-duration">/ {timeLabel(end)}</span>
            </span>
          </div>

          {/* Right Controls: Speeds & Cameras */}
          <div className="playback-right-controls">
            {/* Speed Pills */}
            <div className="speed-pills-row">
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <button
                  key={s}
                  className={`speed-pill ${speed === s ? "active" : ""}`}
                  aria-pressed={speed === s}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

          </div>
        </div>
        <div className="camera-settings-row">
          <span className="control-label">CAMERA</span>
            {/* Camera Switcher Buttons */}
            <div className="camera-btn-group">
              {[
                { id: "player", label: "Chase", icon: Video },
                { id: "ball", label: "Ball Cam", icon: Eye },
                { id: "broadcast", label: "Broadcast", icon: Tv },
                { id: "top", label: "Overhead", icon: Layers },
                { id: "free", label: "Orbit", icon: Compass },
              ].map((c) => {
                const Icon = c.icon;
                const active = camera === c.id;
                return (
                  <button
                    key={c.id}
                    className={`camera-toggle-btn ${active ? "active" : ""}`}
                    onClick={() => setCamera(c.id as any)}
                    title={c.label}
                    aria-pressed={active}
                  >
                    <Icon size={14} />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          <button className="icon-btn" onClick={toggleFullscreen} title={expanded ? "Exit fullscreen" : "Fullscreen viewer"} aria-label={expanded ? "Exit fullscreen" : "Fullscreen viewer"}>
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
        <div className="viewer-footnote"><span>{camera === "player" || camera === "ball" ? "Pro preset · zen · 110° / 270 / 100 / −3° / 0.35" : camera === "free" ? "Drag to orbit · Scroll to zoom" : camera === "top" ? "Overhead · full pitch" : "Broadcast · ball tracking"}</span><span>Space play · ← → frame · 1–5 camera</span></div>
      </div>
    </div>
  );
}
