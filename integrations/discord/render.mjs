// Actual recorded positions only; this is a schematic clip, not game capture.
import { chromium } from "../../app/node_modules/@playwright/test/index.mjs";
export async function renderClip(
  analysis,
  event,
  outDir,
  playerId = analysis.players[0]?.id,
) {
  const start = Math.max(
    analysis.frames[0]?.time ?? 0,
    (event?.time ?? analysis.frames.find((f) => f.live_play)?.time ?? 0) - 3,
  );
  const stop = Math.min(analysis.frames.at(-1)?.time ?? start, start + 6);
  if (stop - start < 0.2) return null;
  const frames = analysis.frames
    .filter((f) => f.time >= start && f.time <= stop)
    .map((f) => ({
      time: f.time,
      cars: f.cars.map((c) => ({ id: c.player_id, position: c.position })),
      ball: f.ball?.position,
      clock: f.match_clock_seconds,
      ot: f.overtime,
    }));
  if (!frames.length) return null;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 800, height: 600 },
    });
    await page.setContent('<canvas width="800" height="600"></canvas>');
    const bytes = await page.evaluate(
      async ({ frames, players, start, stop, playerId }) => {
        const canvas = document.querySelector("canvas"),
          ctx = canvas.getContext("2d");
        const recorder = new MediaRecorder(canvas.captureStream(15), {
            mimeType: "video/webm;codecs=vp8",
          }),
          chunks = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const finished = new Promise((resolve) => {
          recorder.onstop = async () =>
            resolve(
              Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
            );
        });
        let index = 0;
        const draw = (t) => {
          while (index + 1 < frames.length && frames[index + 1].time <= t)
            index++;
          const f = frames[index];
          ctx.fillStyle = "#12232e";
          ctx.fillRect(0, 0, 800, 600);
          ctx.strokeStyle = "#668291";
          ctx.lineWidth = 2;
          ctx.strokeRect(40, 55, 720, 500);
          ctx.beginPath();
          ctx.moveTo(400, 55);
          ctx.lineTo(400, 555);
          ctx.stroke();
          ctx.fillStyle = "#edf7fc";
          ctx.font = "20px sans-serif";
          ctx.fillText(
            `AntiRL reconstructed replay · ${t.toFixed(1)}s · clock ${f?.clock ?? "Unknown"}${f?.ot ? " OT" : ""}`,
            24,
            30,
          );
          if (!f || f.time > t || t - f.time > 0.5) {
            ctx.fillText("Telemetry gap", 300, 300);
            return;
          }
          const dot = (p, color, r) => {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(
              400 + (p[1] / 10240) * 720,
              305 - (p[0] / 8192) * 500,
              r,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          };
          for (const car of f.cars) {
            dot(
              car.position,
              players.find((p) => p.id === car.id)?.team === 0
                ? "#5db6ff"
                : "#ffae57",
              9,
            );
            if (car.id === playerId) {
              const x = 400 + (car.position[1] / 10240) * 720,
                y = 305 - (car.position[0] / 8192) * 500;
              ctx.strokeStyle = "#fff";
              ctx.beginPath();
              ctx.arc(x, y, 14, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = "#fff";
              ctx.font = "14px sans-serif";
              ctx.fillText(
                players.find((p) => p.id === playerId)?.name.slice(0, 16) ??
                  "Selected player",
                Math.min(650, x + 16),
                y + 4,
              );
            }
          }
          if (f.ball) dot(f.ball, "#f6f7e6", 6);
        };
        draw(start);
        recorder.start();
        const begun = performance.now();
        await new Promise((resolve) => {
          const tick = () => {
            const time = Math.min(
              stop,
              start + (performance.now() - begun) / 1000,
            );
            draw(time);
            if (time >= stop) resolve();
            else requestAnimationFrame(tick);
          };
          tick();
        });
        recorder.stop();
        return finished;
      },
      { frames, players: analysis.players, start, stop, playerId },
    );
    await page.screenshot({ path: `${outDir}/clip-frame.png` });
    const { writeFile } = await import("node:fs/promises");
    const path = `${outDir}/clip.webm`;
    await writeFile(path, Buffer.from(bytes));
    return path;
  } finally {
    await browser.close();
  }
}
