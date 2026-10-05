import React, { useEffect, useRef, useState } from "react";
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
  Zap,
} from "lucide-react";
import type { ReplayAnalysis, Frame } from "./types";

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

// Key Small Boost Pad locations
const SMALL_BOOST_PADS: [number, number, number][] = [
  [0, 0.05, -42],
  [-17.92, 0.05, -41.84],
  [17.92, 0.05, -41.84],
  [0, 0.05, -28.16],
  [-10.24, 0.05, -28.16],
  [10.24, 0.05, -28.16],
  [-20.48, 0.05, -10.24],
  [20.48, 0.05, -10.24],
  [0, 0.05, -10.24],
  [-10.24, 0.05, 0],
  [10.24, 0.05, 0],
  [0, 0.05, 10.24],
  [-20.48, 0.05, 10.24],
  [20.48, 0.05, 10.24],
  [0, 0.05, 28.16],
  [-10.24, 0.05, 28.16],
  [10.24, 0.05, 28.16],
  [0, 0.05, 42],
  [-17.92, 0.05, 41.84],
  [17.92, 0.05, 41.84],
];

interface ReplayViewerProps {
  replay: ReplayAnalysis;
  playerId?: string | null;
  time: number;
  onTime: (time: number) => void;
  onSelectEvent?: (eventId: string) => void;
}

export default function ReplayViewer({
  replay,
  playerId,
  time,
  onTime,
  onSelectEvent,
}: ReplayViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ time, playerId, camera: "player" });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<"player" | "ball" | "broadcast" | "top" | "free">("player");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [showRadar, setShowRadar] = useState(true);

  stateRef.current = { time, playerId, camera };

  const start = replay.frames[0]?.time ?? 0;
  const end = replay.frames.at(-1)?.time ?? replay.summary.duration_seconds;

  const clock = useRef(time);
  clock.current = time;

  // Animation frame loop for playback
  useEffect(() => {
    if (!playing) return;
    let id = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(end, clock.current + dt * speed);
      onTime(next);
      if (next >= end) {
        setPlaying(false);
      } else {
        id = requestAnimationFrame(tick);
      }
    };

    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, speed, end, onTime]);

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

    import("./viewerEngine")
      .then(async (B) => {
        if (disposed || !canvasRef.current) return;

        let engine: InstanceType<typeof B.Engine> | InstanceType<typeof B.WebGPUEngine>;
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

        const scene = new B.Scene(engine);
        // Deep obsidian arena background
        scene.clearColor = new B.Color4(0.04, 0.05, 0.07, 1);

        // Main Camera
        const view = new B.ArcRotateCamera(
          "camera",
          -Math.PI / 2,
          1.1,
          75,
          new B.Vector3(0, 0, 0),
          scene
        );
        view.attachControl(canvasRef.current, true);
        view.lowerRadiusLimit = 4;
        view.upperRadiusLimit = 220;
        view.wheelPrecision = 15;

        // Ambient + Directional Stadium Floodlights
        const ambient = new B.HemisphericLight("ambient", new B.Vector3(0, 1, 0), scene);
        ambient.intensity = 0.75;
        ambient.groundColor = new B.Color3(0.08, 0.1, 0.12);

        const stadiumLight1 = new B.DirectionalLight(
          "light1",
          new B.Vector3(0.5, -1, 0.8),
          scene
        );
        stadiumLight1.intensity = 1.2;
        stadiumLight1.diffuse = new B.Color3(0.95, 0.98, 1.0);

        const stadiumLight2 = new B.DirectionalLight(
          "light2",
          new B.Vector3(-0.5, -1, -0.8),
          scene
        );
        stadiumLight2.intensity = 0.9;
        stadiumLight2.diffuse = new B.Color3(1.0, 0.95, 0.9);

        // Material builder helper
        const makeMat = (name: string, hex: string, emHex?: string, alpha = 1.0) => {
          const m = new B.StandardMaterial(name, scene);
          m.diffuseColor = B.Color3.FromHexString(hex);
          m.specularColor = new B.Color3(0.2, 0.2, 0.2);
          m.alpha = alpha;
          if (emHex) {
            m.emissiveColor = B.Color3.FromHexString(emHex);
          }
          return m;
        };

        const blueColor = "#38BDF8";
        const orangeColor = "#FB923C";
        const blueMat = makeMat("blueCarMat", blueColor, "#0284C7");
        const orangeMat = makeMat("orangeCarMat", orangeColor, "#C2410C");
        const goalBlueMat = makeMat("goalBlue", "#38BDF8", "#0284C7");
        const goalOrangeMat = makeMat("goalOrange", "#FB923C", "#EA580C");
        const boostPadGold = makeMat("boostPadGold", "#F59E0B", "#D97706");
        const boostPadCyan = makeMat("boostPadCyan", "#06B6D4", "#0891B2");
        const rubberMat = makeMat("rubber", "#111418");
        const rimMat = makeMat("rims", "#E2E8F0", "#94A3B8");
        const glassMat = makeMat("glass", "#0F172A", "#1E293B", 0.7);

        // PITCH: Deep dark turf with lawn stripes
        const turfBase = makeMat("turfBase", "#0B1116");
        const turfStripe = makeMat("turfStripe", "#0E151C");

        const ground = B.MeshBuilder.CreateGround("pitch", { width: 81.92, height: 102.4 }, scene);
        ground.material = turfBase;

        for (let s = 0; s < 12; s++) {
          const strip = B.MeshBuilder.CreateGround(
            `stripe-${s}`,
            { width: 81.92, height: 8.53 },
            scene
          );
          strip.position.set(0, 0.01, -46.93 + s * 8.53);
          strip.material = s % 2 === 0 ? turfBase : turfStripe;
        }

        // Team Colored Zone Glows on Pitch Ends
        const blueZone = B.MeshBuilder.CreateGround(
          "blueZone",
          { width: 81.92, height: 26 },
          scene
        );
        blueZone.position.set(0, 0.015, -38.2);
        const bzMat = makeMat("bzMat", "#0369A1", "#0284C7", 0.18);
        blueZone.material = bzMat;

        const orangeZone = B.MeshBuilder.CreateGround(
          "orangeZone",
          { width: 81.92, height: 26 },
          scene
        );
        orangeZone.position.set(0, 0.015, 38.2);
        const ozMat = makeMat("ozMat", "#C2410C", "#EA580C", 0.18);
        orangeZone.material = ozMat;

        // PITCH LINES: Boundary, Center Line, Center Circle, Goal Arc
        const drawLine = (name: string, points: [number, number, number][], hex = "#334155") => {
          const lineMesh = B.MeshBuilder.CreateLines(
            name,
            { points: points.map((p) => new B.Vector3(...p)) },
            scene
          );
          lineMesh.color = B.Color3.FromHexString(hex);
          return lineMesh;
        };

        drawLine("bounds", [
          [-40.96, 0.03, -51.2],
          [40.96, 0.03, -51.2],
          [40.96, 0.03, 51.2],
          [-40.96, 0.03, 51.2],
          [-40.96, 0.03, -51.2],
        ], "#64748B");

        drawLine("halfway", [
          [-40.96, 0.03, 0],
          [40.96, 0.03, 0],
        ], "#64748B");

        drawLine(
          "centerCircle",
          Array.from({ length: 65 }, (_, i) => [
            Math.cos((i / 64) * Math.PI * 2) * 9.1,
            0.03,
            Math.sin((i / 64) * Math.PI * 2) * 9.1,
          ]),
          "#94A3B8"
        );

        // STADIUM WALLS & CORNER GLASS CURVES
        const wallMat = makeMat("glassWall", "#1E293B", "#0F172A", 0.25);
        for (const side of [-1, 1]) {
          const sideWall = B.MeshBuilder.CreateBox(
            `wall-side-${side}`,
            { width: 0.4, height: 14, depth: 102.4 },
            scene
          );
          sideWall.position.set(side * 41.16, 7, 0);
          sideWall.material = wallMat;

          const backWall = B.MeshBuilder.CreateBox(
            `wall-back-${side}`,
            { width: 81.92, height: 14, depth: 0.4 },
            scene
          );
          backWall.position.set(0, 7, side * 51.4);
          backWall.material = wallMat;

          // Glowing Wall Trim Neon
          drawLine(`neon-top-${side}`, [
            [-40.96, 14, side * 51.2],
            [40.96, 14, side * 51.2],
          ], side > 0 ? orangeColor : blueColor);

          drawLine(`neon-side-${side}`, [
            [side * 40.96, 14, -51.2],
            [side * 40.96, 14, 51.2],
          ], "#475569");
        }

        // GOALS (Neon Crossbars, Posts, and Deep Net Cage)
        for (const side of [-1, 1]) {
          const gMat = side > 0 ? goalOrangeMat : goalBlueMat;
          // Posts
          for (const x of [-8.93, 8.93]) {
            const post = B.MeshBuilder.CreateCylinder(
              `post-${side}-${x}`,
              { diameter: 0.4, height: 6.43, tessellation: 16 },
              scene
            );
            post.position.set(x, 3.215, side * 51.2);
            post.material = gMat;
          }
          // Crossbar
          const crossbar = B.MeshBuilder.CreateCylinder(
            `crossbar-${side}`,
            { diameter: 0.4, height: 18.26, tessellation: 16 },
            scene
          );
          crossbar.rotation.z = Math.PI / 2;
          crossbar.position.set(0, 6.43, side * 51.2);
          crossbar.material = gMat;

          // Goal Net Enclosure
          const net = B.MeshBuilder.CreateBox(
            `net-${side}`,
            { width: 17.86, height: 6.43, depth: 8.0 },
            scene
          );
          net.position.set(0, 3.215, side * (51.2 + 4.0));
          const netMat = makeMat(`netMat-${side}`, side > 0 ? "#7C2D12" : "#075985", undefined, 0.35);
          net.material = netMat;
        }

        // BOOST PADS
        // 6 Big Full 100 Boost Pads with floating glowing orbs
        const boostOrbs: InstanceType<typeof B.Mesh>[] = [];
        BIG_BOOST_PADS.forEach((posArr, i) => {
          const padDisc = B.MeshBuilder.CreateCylinder(
            `bigPad-${i}`,
            { diameter: 3.2, height: 0.12, tessellation: 24 },
            scene
          );
          padDisc.position.set(posArr[0], posArr[1], posArr[2]);
          padDisc.material = boostPadGold;

          const orb = B.MeshBuilder.CreateSphere(
            `bigOrb-${i}`,
            { diameter: 1.1, segments: 16 },
            scene
          );
          orb.position.set(posArr[0], posArr[1] + 0.8, posArr[2]);
          orb.material = boostPadGold;
          boostOrbs.push(orb);
        });

        // 20+ Small Boost Pads with glowing discs
        SMALL_BOOST_PADS.forEach((posArr, i) => {
          const smallDisc = B.MeshBuilder.CreateCylinder(
            `smallPad-${i}`,
            { diameter: 1.5, height: 0.08, tessellation: 16 },
            scene
          );
          smallDisc.position.set(posArr[0], posArr[1], posArr[2]);
          smallDisc.material = boostPadCyan;
        });

        // BALL: Metallic Rocket League sphere with glowing seams & ground shadow disc
        const ballMat = makeMat("ballMat", "#FFFFFF", "#38BDF8");
        ballMat.specularColor = new B.Color3(0.8, 0.8, 0.8);
        const ball = B.MeshBuilder.CreateSphere("ball", { diameter: 1.86, segments: 28 }, scene);
        ball.material = ballMat;

        // Ball Shadow Disc on Turf
        const shadowMat = makeMat("shadowMat", "#000000", undefined, 0.55);
        const ballShadow = B.MeshBuilder.CreateDisc(
          "ballShadow",
          { radius: 1.0, tessellation: 24 },
          scene
        );
        ballShadow.rotation.x = Math.PI / 2;
        ballShadow.position.y = 0.025;
        ballShadow.material = shadowMat;

        // CAR SILHOUETTES: Sleek Sports-Car Models
        const cars = new Map<string, InstanceType<typeof B.Mesh>>();
        const thrusters = new Map<string, InstanceType<typeof B.Mesh>>();

        for (const p of replay.players) {
          const isBlue = p.team === 0;
          const carMat = isBlue ? blueMat : orangeMat;

          // Main Chassis Base
          const car = B.MeshBuilder.CreateBox(
            `car-${p.id}`,
            { width: 2.4, height: 0.62, depth: 1.6 },
            scene
          );
          car.material = carMat;

          // Front Aerodynamic Hood & Splitter
          const hood = B.MeshBuilder.CreateBox(
            `hood-${p.id}`,
            { width: 1.1, height: 0.38, depth: 1.45 },
            scene
          );
          hood.parent = car;
          hood.position.set(0.68, -0.08, 0);
          hood.material = carMat;

          // Cockpit Windshield (Tinted Glass)
          const cabin = B.MeshBuilder.CreateBox(
            `cabin-${p.id}`,
            { width: 1.15, height: 0.44, depth: 1.25 },
            scene
          );
          cabin.parent = car;
          cabin.position.set(-0.12, 0.44, 0);
          cabin.material = glassMat;

          // Rear Deck & Elevated Spoiler Wing
          const spoiler = B.MeshBuilder.CreateBox(
            `spoiler-${p.id}`,
            { width: 0.3, height: 0.08, depth: 1.55 },
            scene
          );
          spoiler.parent = car;
          spoiler.position.set(-1.1, 0.62, 0);
          spoiler.material = rubberMat;

          // 4 Alloy Wheels with Rubber Tires
          for (const x of [-0.75, 0.75]) {
            for (const z of [-0.85, 0.85]) {
              const tire = B.MeshBuilder.CreateCylinder(
                `tire-${p.id}-${x}-${z}`,
                { diameter: 0.65, height: 0.34, tessellation: 16 },
                scene
              );
              tire.parent = car;
              tire.rotation.x = Math.PI / 2;
              tire.position.set(x, -0.18, z);
              tire.material = rubberMat;

              const rim = B.MeshBuilder.CreateCylinder(
                `rim-${p.id}-${x}-${z}`,
                { diameter: 0.32, height: 0.36, tessellation: 16 },
                scene
              );
              rim.parent = tire;
              rim.material = rimMat;
            }
          }

          // Twin Exhaust Boost Thruster Jet
          const thrusterJet = B.MeshBuilder.CreateCylinder(
            `boost-${p.id}`,
            { diameterTop: 0.1, diameterBottom: 0.55, height: 1.6, tessellation: 12 },
            scene
          );
          thrusterJet.parent = car;
          thrusterJet.rotation.z = Math.PI / 2;
          thrusterJet.position.set(-1.9, 0.02, 0);
          const jetMat = makeMat(`jetMat-${p.id}`, "#F59E0B", "#F97316", 0.85);
          thrusterJet.material = jetMat;
          thrusterJet.setEnabled(false);
          thrusters.set(p.id, thrusterJet);

          // Dynamic 3D Nameplate Billboard
          const label = B.MeshBuilder.CreatePlane(`label-${p.id}`, { width: 7.5, height: 1.5 }, scene);
          label.parent = car;
          label.position.y = 2.4;
          label.billboardMode = B.Mesh.BILLBOARDMODE_ALL;

          const texture = new B.DynamicTexture(`name-${p.id}`, { width: 512, height: 104 }, scene, false);
          texture.hasAlpha = true;
          // Draw crisp esports badge
          const ctx = texture.getContext();
          ctx.fillStyle = "rgba(10, 14, 22, 0.85)";
          ctx.beginPath();
          if ((ctx as any).roundRect) {
            (ctx as any).roundRect(8, 8, 496, 88, 16);
          } else {
            ctx.rect(8, 8, 496, 88);
          }
          ctx.fill();
          ctx.strokeStyle = isBlue ? "#38BDF8" : "#FB923C";
          ctx.lineWidth = 4;
          ctx.stroke();

          ctx.fillStyle = "#FFFFFF";
          ctx.font = "bold 36px 'Plus Jakarta Sans', Inter, sans-serif";
          ctx.fillText(p.name.slice(0, 20), 24, 60);

          texture.update();

          const labelMat = new B.StandardMaterial(`label-mat-${p.id}`, scene);
          labelMat.diffuseTexture = texture;
          labelMat.emissiveColor = B.Color3.White();
          labelMat.disableLighting = true;
          labelMat.backFaceCulling = false;
          label.material = labelMat;

          cars.set(p.id, car);
        }

        // Coordinate conversion: Rocket League (X right, Y fwd, Z up) -> Babylon (X right, Y up, Z -fwd)
        const pos = (p: number[]) => new B.Vector3(p[0] * 0.01, p[2] * 0.01, -p[1] * 0.01);

        // Binary search for frame at time t
        const findFrameIndex = (t: number) => {
          let low = 0;
          let high = replay.frames.length - 1;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (replay.frames[mid].time <= t) low = mid;
            else high = mid - 1;
          }
          return low;
        };

        let lastCam = "";

        // Continuous render loop
        engine.runRenderLoop(() => {
          const { time: t, playerId: pid, camera: cam } = stateRef.current;
          const idx = findFrameIndex(t);
          const a: Frame = replay.frames[idx];
          const b: Frame = replay.frames[Math.min(idx + 1, replay.frames.length - 1)];
          const weight =
            b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;

          // Rotate boost pad orbs
          boostOrbs.forEach((orb, i) => {
            orb.rotation.y += 0.02;
            orb.position.y = BIG_BOOST_PADS[i][1] + 0.8 + Math.sin(t * 3 + i) * 0.12;
          });

          // Ball positioning & ground shadow
          if (a.ball) {
            ball.setEnabled(true);
            ballShadow.setEnabled(true);
            const pA = pos(a.ball.position);
            ball.position = pA;

            if (
              b.ball &&
              !a.discontinuity &&
              !b.discontinuity &&
              B.Vector3.Distance(pA, pos(b.ball.position)) < 25
            ) {
              ball.position = B.Vector3.Lerp(pA, pos(b.ball.position), weight);
            }

            // Shadow directly under ball
            ballShadow.position.x = ball.position.x;
            ballShadow.position.z = ball.position.z;
            const height = Math.max(0, ball.position.y);
            const scale = Math.max(0.4, 1.2 - height * 0.04);
            ballShadow.scaling.set(scale, scale, scale);
            shadowMat.alpha = Math.max(0.15, 0.6 - height * 0.03);
          } else {
            ball.setEnabled(false);
            ballShadow.setEnabled(false);
          }

          // Cars positioning, rotation, boost thrusters, & interpolation
          for (const [id, mesh] of cars) {
            const carA = a.cars.find((c) => c.player_id === id);
            const carB = b.cars.find((c) => c.player_id === id);
            mesh.setEnabled(Boolean(carA));

            if (carA) {
              const pA = pos(carA.position);
              mesh.position = pA;

              const continuous =
                !!carB &&
                !a.discontinuity &&
                !b.discontinuity &&
                !carA.discontinuity &&
                !carB.discontinuity &&
                B.Vector3.Distance(pA, pos(carB.position)) < 25;

              if (continuous && carB) {
                mesh.position = B.Vector3.Lerp(pA, pos(carB.position), weight);
              }

              const qA = carA.rotation;
              const rotA = new B.Quaternion(qA[0], qA[2], -qA[1], qA[3]);

              if (continuous && carB) {
                const qB = carB.rotation;
                const rotB = new B.Quaternion(qB[0], qB[2], -qB[1], qB[3]);
                mesh.rotationQuaternion = B.Quaternion.Slerp(rotA, rotB, weight);
              } else {
                mesh.rotationQuaternion = rotA;
              }

              // Thruster jet animation
              const jet = thrusters.get(id);
              if (jet) {
                const isBoosting =
                  carA.boost != null &&
                  carB?.boost != null &&
                  carB.boost < carA.boost;
                jet.setEnabled(isBoosting);
              }
            }
          }

          // CAMERA MODES
          if (cam !== lastCam) {
            view.detachControl();
            if (cam === "free") {
              view.mode = B.Camera.PERSPECTIVE_CAMERA;
              view.attachControl(canvasRef.current, true);
            }
            lastCam = cam;
          }

          if (cam === "top") {
            view.mode = B.Camera.ORTHOGRAPHIC_CAMERA;
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
          } else if (cam === "broadcast") {
            // RLCS Sideline TV Camera: dynamic sideline pan & tilt
            view.mode = B.Camera.PERSPECTIVE_CAMERA;
            const focalPoint = ball.position;
            view.target = B.Vector3.Lerp(view.target, focalPoint, 0.08);
            view.alpha = -Math.PI / 2 + (focalPoint.x / 40.96) * 0.35;
            view.beta = 1.15;
            view.radius = 52 + Math.abs(focalPoint.z) * 0.15;
          } else if (cam === "ball") {
            view.mode = B.Camera.PERSPECTIVE_CAMERA;
            view.target.copyFrom(ball.position);
            view.beta = 1.1;
            view.radius = 34;
            view.alpha = -Math.PI / 2;
          } else if (cam === "player") {
            view.mode = B.Camera.PERSPECTIVE_CAMERA;
            const pMesh = cars.get(pid ?? "");
            if (pMesh) {
              view.target.copyFrom(pMesh.position);
              view.beta = 1.18;
              view.radius = 18;
              if (pMesh.rotationQuaternion) {
                const front = new B.Vector3(1, 0, 0).applyRotationQuaternion(pMesh.rotationQuaternion);
                view.alpha = Math.atan2(-front.z, -front.x);
              }
            } else {
              view.target.copyFrom(ball.position);
              view.radius = 32;
            }
          }

          // 2D Tactical Radar update
          if (radarCanvasRef.current && showRadar) {
            const ctx = radarCanvasRef.current.getContext("2d");
            if (ctx) {
              const rw = radarCanvasRef.current.width;
              const rh = radarCanvasRef.current.height;
              ctx.clearRect(0, 0, rw, rh);

              // Field outline
              ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
              ctx.lineWidth = 1.5;
              ctx.strokeRect(6, 6, rw - 12, rh - 12);

              // Halfway line
              ctx.beginPath();
              ctx.moveTo(6, rh / 2);
              ctx.lineTo(rw - 6, rh / 2);
              ctx.stroke();

              // Ball dot
              if (ball.isEnabled()) {
                const bx = ((ball.position.x + 40.96) / 81.92) * (rw - 16) + 8;
                const bz = ((ball.position.z + 51.2) / 102.4) * (rh - 16) + 8;
                ctx.fillStyle = "#FFFFFF";
                ctx.shadowColor = "#38BDF8";
                ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.arc(bx, bz, 3.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
              }

              // Cars dots
              for (const [id, mesh] of cars) {
                if (!mesh.isEnabled()) continue;
                const p = replay.players.find((x) => x.id === id);
                const isBlue = p?.team === 0;
                const cx = ((mesh.position.x + 40.96) / 81.92) * (rw - 16) + 8;
                const cz = ((mesh.position.z + 51.2) / 102.4) * (rh - 16) + 8;

                ctx.fillStyle = isBlue ? "#38BDF8" : "#FB923C";
                ctx.beginPath();
                ctx.arc(cx, cz, id === pid ? 4.5 : 3.5, 0, Math.PI * 2);
                ctx.fill();

                if (id === pid) {
                  ctx.strokeStyle = "#FFFFFF";
                  ctx.lineWidth = 1.5;
                  ctx.stroke();
                }
              }
            }
          }

          scene.render();
        });

        const resize = () => engine.resize();
        window.addEventListener("resize", resize);
        const observer = new ResizeObserver(resize);
        observer.observe(canvasRef.current);

        cleanup = () => {
          observer.disconnect();
          window.removeEventListener("resize", resize);
          scene.dispose();
          engine.dispose();
        };

        setReady(true);
      })
      .catch((e) => setError("3D rendering failed to initialize: " + String(e)));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [replay, showRadar]);

  const currentFrame = replay.frames.reduce(
    (last, f) => (f.time <= time ? f : last),
    replay.frames[0]
  );
  const currentCar = currentFrame?.cars.find((c) => c.player_id === playerId);
  const selectedPlayer = replay.players.find((p) => p.id === playerId);

  const frameStep = (dir: number) => {
    setPlaying(false);
    const frame =
      dir > 0
        ? replay.frames.find((f) => f.time > time + 0.001)
        : replay.frames.filter((f) => f.time < time - 0.001).at(-1);
    onTime(frame?.time ?? (dir > 0 ? end : start));
  };

  const seekRelative = (delta: number) => {
    setPlaying(false);
    onTime(Math.max(start, Math.min(end, time + delta)));
  };

  return (
    <div className="studio-main" aria-label="Replay 3D Studio">
      {/* 3D Arena Surface */}
      <div
        className="arena-wrapper"
        tabIndex={0}
        aria-label="Replay arena canvas. Space to toggle play/pause, left/right arrows to step frames, 1-5 for camera views."
        onKeyDown={(e) => {
          if ((e.target as HTMLElement).closest("input,select,textarea")) return;
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

        {/* 2D Tactical Radar in top-right */}
        {showRadar && (
          <div className="arena-radar-card" title="2D Tactical Radar (Top-Down Field Overview)">
            <div className="radar-header">
              <span>RADAR</span>
              <button
                className="radar-toggle-btn"
                onClick={() => setShowRadar(false)}
                title="Hide Radar"
              >
                ✕
              </button>
            </div>
            <canvas ref={radarCanvasRef} width={120} height={150} className="radar-canvas" />
          </div>
        )}

        {/* HUD: Broadcast Scoreboard and Game Clock */}
        <div className="arena-hud">
          <div className="hud-broadcast-scoreboard">
            <div className="score-side blue">
              <span className="team-tag">BLUE</span>
              <span className="score-num">{replay.summary.blue_score ?? 0}</span>
            </div>

            <div className="score-clock-box">
              <span className="clock-digits">
                {currentFrame?.match_clock_seconds != null
                  ? timeLabel(currentFrame.match_clock_seconds)
                  : timeLabel(time)}
              </span>
              <span className="clock-sub">MATCH CLOCK</span>
            </div>

            <div className="score-side orange">
              <span className="score-num">{replay.summary.orange_score ?? 0}</span>
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
              <div className="telemetry-boost-dial">
                <span className="boost-label">BOOST</span>
                <span className="boost-val">
                  {currentCar?.boost != null ? Math.round(currentCar.boost) : "--"}%
                </span>
                <div className="boost-mini-bar">
                  <div
                    className="boost-mini-fill"
                    style={{
                      width: `${currentCar?.boost != null ? Math.round(currentCar.boost) : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {(!ready || error) && (
          <div className="arena-loading-overlay">
            <Sparkles size={24} className="spinning" color="#38BDF8" />
            <span>{error || "Initializing Broadcast 3D Stadium..."}</span>
          </div>
        )}
      </div>

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
              onTime(Number(e.target.value));
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
                  onClick={() => {
                    setPlaying(false);
                    // Seek with ~3s lead-in
                    onTime(Math.max(start, ev.time - 3.0));
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
              title="Restart from beginning"
              onClick={() => {
                setPlaying(false);
                onTime(start);
              }}
            >
              <RotateCcw size={15} />
            </button>
            <button
              className="icon-btn"
              title="Previous frame (Left Arrow)"
              onClick={() => frameStep(-1)}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-btn primary play-pulse"
              title={playing ? "Pause (Space)" : "Play (Space)"}
              disabled={!ready || !!error}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="icon-btn"
              title="Next frame (Right Arrow)"
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
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Camera Switcher Buttons */}
            <div className="camera-btn-group">
              {[
                { id: "player", label: "Player Chase", icon: Video },
                { id: "ball", label: "Ball Cam", icon: Eye },
                { id: "broadcast", label: "RLCS TV", icon: Tv },
                { id: "top", label: "Tactical 2D", icon: Layers },
                { id: "free", label: "Free Orbit", icon: Compass },
              ].map((c) => {
                const Icon = c.icon;
                const active = camera === c.id;
                return (
                  <button
                    key={c.id}
                    className={`camera-toggle-btn ${active ? "active" : ""}`}
                    onClick={() => setCamera(c.id as any)}
                    title={c.label}
                  >
                    <Icon size={14} />
                    <span>{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
