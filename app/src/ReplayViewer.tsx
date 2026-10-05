import React, { useEffect, useRef, useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Maximize2,
  Video,
  Eye,
  Compass,
} from "lucide-react";
import type { ReplayAnalysis, Frame } from "./types";

export const timeLabel = (seconds: number) => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

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
  const stateRef = useRef({ time, playerId, camera: "player" });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [camera, setCamera] = useState<"player" | "ball" | "top" | "free">("player");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

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
          });
        } catch {
          engine = new B.Engine(canvasRef.current, false);
        }

        if (disposed) {
          engine.dispose();
          return;
        }

        const scene = new B.Scene(engine);
        scene.clearColor = new B.Color4(0.05, 0.07, 0.05, 1);

        const view = new B.ArcRotateCamera(
          "camera",
          -Math.PI / 2,
          1.05,
          75,
          new B.Vector3(0, 0, 0),
          scene
        );
        view.attachControl(canvasRef.current, true);
        view.lowerRadiusLimit = 5;
        view.upperRadiusLimit = 180;

        const light = new B.HemisphericLight("light", new B.Vector3(0, 1, 0), scene);
        light.intensity = 0.95;

        const material = (name: string, hex: string) => {
          const m = new B.StandardMaterial(name, scene);
          m.diffuseColor = B.Color3.FromHexString(hex);
          m.specularColor = new B.Color3(0.08, 0.08, 0.08);
          return m;
        };

        const grass = material("turf", "#263529");
        const turfLight = material("turf-light", "#2C3D30");
        const blueMat = material("blue", "#80BCE5");
        const orangeMat = material("orange", "#E6A260");
        const chalkMat = material("chalk", "#D2D8C7");
        const ballMat = material("ball", "#F0EDE1");

        // Pitch ground and alternating lawn stripes
        const ground = B.MeshBuilder.CreateGround("pitch", { width: 81.92, height: 102.4 }, scene);
        ground.material = grass;

        for (let s = 0; s < 10; s++) {
          const strip = B.MeshBuilder.CreateGround(
            `stripe-${s}`,
            { width: 81.92, height: 10.24 },
            scene
          );
          strip.position.set(0, 0.015, -46.08 + s * 10.24);
          strip.material = s % 2 ? grass : turfLight;
        }

        // Field markings
        const drawLine = (name: string, points: [number, number, number][]) => {
          const lineMesh = B.MeshBuilder.CreateLines(
            name,
            { points: points.map((p) => new B.Vector3(...p)) },
            scene
          );
          lineMesh.color = B.Color3.FromHexString("#7A8B74");
          return lineMesh;
        };

        drawLine("bounds", [
          [-40.96, 0.03, -51.2],
          [40.96, 0.03, -51.2],
          [40.96, 0.03, 51.2],
          [-40.96, 0.03, 51.2],
          [-40.96, 0.03, -51.2],
        ]);
        drawLine("halfway", [
          [-40.96, 0.03, 0],
          [40.96, 0.03, 0],
        ]);
        drawLine(
          "center-circle",
          Array.from({ length: 65 }, (_, i) => [
            Math.cos((i / 64) * Math.PI * 2) * 9.1,
            0.03,
            Math.sin((i / 64) * Math.PI * 2) * 9.1,
          ])
        );

        // Goals and backwalls
        for (const side of [-1, 1]) {
          const goalMat = side > 0 ? blueMat : orangeMat;
          for (const x of [-8.93, 8.93]) {
            const post = B.MeshBuilder.CreateCylinder(
              `post-${side}-${x}`,
              { diameter: 0.35, height: 6.43, tessellation: 12 },
              scene
            );
            post.position.set(x, 3.215, side * 51.2);
            post.material = goalMat;
          }
          const crossbar = B.MeshBuilder.CreateBox(
            `crossbar-${side}`,
            { width: 18.2, height: 0.35, depth: 0.35 },
            scene
          );
          crossbar.position.set(0, 6.43, side * 51.2);
          crossbar.material = goalMat;

          const backwall = B.MeshBuilder.CreateBox(
            `backwall-${side}`,
            { width: 81.92, height: 12, depth: 0.25 },
            scene
          );
          backwall.position.set(0, 6, side * 51.5);
          const wMat = material(`wall-${side}`, side > 0 ? "#253545" : "#4A3926");
          wMat.alpha = 0.25;
          backwall.material = wMat;
        }

        // Side boards
        for (const side of [-1, 1]) {
          const sideBoard = B.MeshBuilder.CreateBox(
            `sideboard-${side}`,
            { width: 0.3, height: 8, depth: 102.4 },
            scene
          );
          sideBoard.position.set(side * 41.1, 4, 0);
          const sbMat = material("sideboard-mat", "#435941");
          sbMat.alpha = 0.2;
          sideBoard.material = sbMat;
        }

        // Ball mesh
        const ball = B.MeshBuilder.CreateSphere("ball", { diameter: 1.86, segments: 24 }, scene);
        ball.material = ballMat;

        // Player Car Meshes & Dynamic Billboard Nameplates
        const cars = new Map<string, InstanceType<typeof B.Mesh>>();
        const rubber = material("tires", "#131714");
        const glass = material("glass", "#22353E");
        const rims = material("rims", "#C5D0C6");

        for (const p of replay.players) {
          const car = B.MeshBuilder.CreateBox(
            `car-${p.id}`,
            { width: 2.5, height: 0.65, depth: 1.7 },
            scene
          );
          car.material = p.team === 0 ? blueMat : orangeMat;

          const cabin = B.MeshBuilder.CreateBox(
            `cabin-${p.id}`,
            { width: 1.25, height: 0.45, depth: 1.3 },
            scene
          );
          cabin.parent = car;
          cabin.position.set(-0.1, 0.48, 0);
          cabin.material = glass;

          for (const x of [-0.8, 0.8]) {
            for (const z of [-0.86, 0.86]) {
              const tire = B.MeshBuilder.CreateCylinder(
                `tire-${p.id}-${x}-${z}`,
                { diameter: 0.64, height: 0.32, tessellation: 12 },
                scene
              );
              tire.parent = car;
              tire.rotation.x = Math.PI / 2;
              tire.position.set(x, -0.2, z);
              tire.material = rubber;

              const rim = B.MeshBuilder.CreateCylinder(
                `rim-${p.id}-${x}-${z}`,
                { diameter: 0.31, height: 0.34, tessellation: 12 },
                scene
              );
              rim.parent = tire;
              rim.material = rims;
            }
          }

          // Dynamic 3D Nameplate billboard
          const label = B.MeshBuilder.CreatePlane(`label-${p.id}`, { width: 7.5, height: 1.4 }, scene);
          label.parent = car;
          label.position.y = 2.2;
          label.billboardMode = B.Mesh.BILLBOARDMODE_ALL;

          const texture = new B.DynamicTexture(`name-${p.id}`, { width: 512, height: 96 }, scene, false);
          texture.hasAlpha = true;
          texture.drawText(
            p.name.slice(0, 24),
            null,
            64,
            "700 36px Segoe UI, Inter",
            p.team === 0 ? "#C4E2F9" : "#F8D4AB",
            "rgba(19, 22, 16, 0.82)",
            true
          );

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

          // Ball positioning & interpolation
          if (a.ball) {
            ball.setEnabled(true);
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
          } else {
            ball.setEnabled(false);
          }

          // Cars positioning, rotation, & interpolation
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
            }
          }

          // Camera modes
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
          } else if (cam !== "free") {
            view.mode = B.Camera.PERSPECTIVE_CAMERA;
            const target =
              cam === "ball" ? ball.position : cars.get(pid ?? "")?.position ?? ball.position;
            view.target.copyFrom(target);
            view.beta = 1.05;
            view.radius = cam === "ball" ? 36 : 24;

            if (cam === "player") {
              const pMesh = cars.get(pid ?? "");
              if (pMesh?.rotationQuaternion) {
                const front = new B.Vector3(1, 0, 0).applyRotationQuaternion(pMesh.rotationQuaternion);
                view.alpha = Math.atan2(-front.z, -front.x);
              }
            } else {
              view.alpha = -Math.PI / 2;
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
  }, [replay]);

  const currentFrame = replay.frames.reduce(
    (last, f) => (f.time <= time ? f : last),
    replay.frames[0]
  );
  const currentCar = currentFrame?.cars.find((c) => c.player_id === playerId);

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
        aria-label="Replay arena canvas. Space to toggle play/pause, left/right arrows to step frames, 1-4 for camera views."
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
          } else if (["1", "2", "3", "4"].includes(e.key)) {
            e.preventDefault();
            setCamera((["player", "ball", "top", "free"] as const)[Number(e.key) - 1]);
          }
        }}
      >
        <canvas ref={canvasRef} className="arena-canvas" />

        {/* HUD: Score and Game Clock */}
        <div className="arena-hud">
          <div className="hud-score">
            <span className="score-blue">
              BLUE {replay.summary.blue_score ?? 0}
            </span>
            <span className="score-clock">
              {currentFrame?.match_clock_seconds != null
                ? timeLabel(currentFrame.match_clock_seconds)
                : timeLabel(time)}
            </span>
            <span className="score-orange">
              {replay.summary.orange_score ?? 0} ORANGE
            </span>
          </div>

          <div className="hud-player">
            <span>
              {replay.players.find((p) => p.id === playerId)?.name ?? "Global Perspective"}
            </span>
            <span>
              Boost:{" "}
              <b className="boost-pill">
                {currentCar?.boost != null ? Math.round(currentCar.boost) : "N/A"}
              </b>
            </span>
          </div>
        </div>

        {(!ready || error) && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(23, 26, 21, 0.85)",
              color: error ? "var(--danger)" : "var(--accent)",
              fontWeight: 600,
            }}
          >
            {error || "Preparing 3D Replay Studio..."}
          </div>
        )}
      </div>

      {/* Timeline & Playback Card */}
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
              title="Previous frame"
              onClick={() => frameStep(-1)}
            >
              <SkipBack size={15} />
            </button>
            <button
              className="icon-btn primary"
              title={playing ? "Pause (Space)" : "Play (Space)"}
              disabled={!ready || !!error}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              className="icon-btn"
              title="Next frame"
              onClick={() => frameStep(1)}
            >
              <SkipForward size={15} />
            </button>

            <span
              style={{
                marginLeft: 10,
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text)",
              }}
            >
              {timeLabel(time)} <span style={{ color: "var(--muted)" }}>/ {timeLabel(end)}</span>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Speed selector */}
            <select
              aria-label="Playback Speed"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{
                background: "var(--surface-raised)",
                color: "var(--text)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <option key={s} value={s}>
                  {s}x speed
                </option>
              ))}
            </select>

            {/* Camera selector */}
            <select
              aria-label="Camera Perspective"
              value={camera}
              onChange={(e) => setCamera(e.target.value as any)}
              style={{
                background: "var(--surface-raised)",
                color: "var(--text)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 8px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <option value="player">Player Chase (1)</option>
              <option value="ball">Ball Track (2)</option>
              <option value="top">Overhead Tactics (3)</option>
              <option value="free">Free Camera (4)</option>
            </select>

            <button
              className="icon-btn"
              title="Toggle Fullscreen"
              onClick={() => canvasRef.current?.parentElement?.requestFullscreen()}
            >
              <Maximize2 size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
