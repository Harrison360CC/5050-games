import { FLOOR_H, SL_H, SL_W, VIOLATIONS, type SlumlordState } from "../../sim/slumlord";

const C = { sky: "#8fa3b8", sky2: "#c9d3dc", ground: "#4a4a4a", brick: "#9a5a3c", brick2: "#7d4730", window: "#f2d16b", frame: "#2a2420", text: "#1a1410", paper: "#f5efe0", ok: "#2e8b57", red: "#c62f2f" };

const DEATH_LINES = [
  "condemned.",
  "the inspector has questions.",
  "physics showed up.",
  "i'm so sorry.",
  "while they're out partying btw.",
  "write it down. scrib doon.",
];

export function drawSlumlord(ctx: CanvasRenderingContext2D, s: SlumlordState, scale: number, hud: { best: number; started: boolean; seed: number }) {
  ctx.save();
  ctx.scale(scale, scale);
  const g = ctx.createLinearGradient(0, 0, 0, SL_H);
  g.addColorStop(0, C.sky); g.addColorStop(1, C.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SL_W, SL_H);

  // camera: keep the top of the tower around y=300 once it's tall
  const towerTop = SL_H - 60 - s.floors.length * FLOOR_H;
  const cam = Math.max(0, 300 - towerTop);

  // ground
  ctx.fillStyle = C.ground; ctx.fillRect(0, SL_H - 60 + cam, SL_W, 60);

  const drawFloor = (x: number, w: number, y: number, v: number, perfect: boolean, moving: boolean) => {
    ctx.fillStyle = perfect ? C.brick : (moving ? C.brick : C.brick2);
    ctx.fillRect(x, y, w, FLOOR_H);
    ctx.fillStyle = C.frame; ctx.fillRect(x, y, w, 2);
    // windows
    ctx.fillStyle = C.window;
    for (let wx = x + 6; wx + 8 <= x + w - 4; wx += 16) ctx.fillRect(wx, y + 7, 8, 9);
    // violation painted on the side
    if (w > 70) { ctx.fillStyle = C.paper; ctx.font = "9px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(VIOLATIONS[v] ?? "", x + w / 2, y + 15); }
  };

  s.floors.forEach((f, i) => drawFloor(f.x, f.w, SL_H - 60 - (i + 1) * FLOOR_H + cam, f.v, f.perfect, false));
  if (!s.dead) drawFloor(s.cur.x, s.cur.w, SL_H - 60 - (s.floors.length + 1) * FLOOR_H + cam, s.cur.v, false, true);

  // inspector thumbs up on perfect streak
  if (s.perfectStreak > 0 && !s.dead) {
    const ix = 20, iy = SL_H - 60 - (s.floors.length) * FLOOR_H + cam;
    ctx.fillStyle = C.frame; ctx.fillRect(ix, iy - 26, 10, 18); ctx.fillStyle = "#e8b48f"; ctx.fillRect(ix + 1, iy - 34, 8, 8);
    ctx.fillStyle = C.ok; ctx.font = "bold 12px system-ui"; ctx.textAlign = "left"; ctx.fillText(s.perfectStreak > 1 ? `perfect x${s.perfectStreak}` : "perfect", ix + 14, iy - 20);
  }

  // HUD
  ctx.fillStyle = C.text; ctx.textAlign = "center";
  ctx.font = "bold 48px system-ui, sans-serif"; ctx.fillText(String(s.floors.length - 1), SL_W / 2, 80);
  ctx.font = "14px system-ui, sans-serif"; ctx.fillStyle = "rgba(26,20,16,0.65)"; ctx.fillText(`floors · best ${hud.best}`, SL_W / 2, 102);

  if (!hud.started) {
    ctx.fillStyle = C.text; ctx.font = "bold 22px system-ui, sans-serif"; ctx.fillText("SLUMLORD", SL_W / 2, 200);
    ctx.font = "15px system-ui, sans-serif"; ctx.fillStyle = "rgba(26,20,16,0.8)"; ctx.fillText("tap to drop the floor. overhang falls off.", SL_W / 2, 226);
  }
  if (s.dead) {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(30, 200, SL_W - 60, 140);
    ctx.fillStyle = C.paper; ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText(DEATH_LINES[hud.seed % DEATH_LINES.length]!, SL_W / 2, 245);
    ctx.font = "15px system-ui, sans-serif";
    ctx.fillText(`${s.floors.length - 1} floors. tap to go again.`, SL_W / 2, 280);
  }
  ctx.restore();
}
