import { plural, type Hud } from "../mount";
import { drawChase, drawDeathCard } from "../hud";
import { PIGEON, WORLD_H, WORLD_W, pigeonY, type PigeonState } from "../../sim/pigeon";

const C = {
  sky: "#1b1f2a",
  sky2: "#2a3042",
  bldg: "#11141c",
  bldgLit: "#f2c14e",
  ground: "#3b2f2f",
  groundTop: "#5a4a3a",
  pigeon: "#8d99ae",
  pigeonDark: "#5c667a",
  beak: "#f4a261",
  eye: "#0b0d12",
  red: "#e63946",
  text: "#f8f9fa",
};


/* One pool per game. Two thirds of these used to be the same four lines
 * copy-pasted across all three, so three different games felt like one game
 * with three skins, and the shared ones were borrowed meme cadence rather
 * than landlord satire. Kept under 26 characters: fillText is centred with
 * no wrap in a 360px world, so anything longer shears off BOTH edges. */
const DEATH_LINES = [
  "splat.",
  "the pigeon has had enough.",
  "gravity, as advertised.",
  "that was a window.",
  "the ledge had plans.",
  "wings are a suggestion.",
  "the city wins again.",
  "landed. wrong way up.",
  "rent's due up here too.",
  "a bird of poor judgment.",
  "down, like the lease.",
  "the sky is not for you.",
];

export function draw(ctx: CanvasRenderingContext2D, s: PigeonState, scale: number, hud: Hud) {
  ctx.save();
  ctx.scale(scale, scale);
  const py = pigeonY(s);

  // sky
  ctx.fillStyle = C.sky;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // background buildings (parallax, derived from tick so it's cheap)
  ctx.fillStyle = "#151924";
  const off = (s.tick * 0.6) % 120;
  for (let i = -1; i < 5; i++) {
    const x = i * 120 - off;
    const h = 160 + ((i * 37) % 90);
    ctx.fillRect(x, PIGEON.GROUND_Y - h, 80, h);
  }

  // obstacle columns = buildings
  for (const gp of s.gaps) {
    ctx.fillStyle = C.bldg;
    ctx.fillRect(gp.x, 0, PIGEON.COL_W, gp.gapY);
    ctx.fillRect(gp.x, gp.gapY + gp.gapH, PIGEON.COL_W, PIGEON.GROUND_Y - gp.gapY - gp.gapH);
    // lit windows
    ctx.fillStyle = C.bldgLit;
    for (let y = 14; y < gp.gapY - 10; y += 22) {
      ctx.fillRect(gp.x + 10, y, 8, 10);
      ctx.fillRect(gp.x + 32, y, 8, 10);
    }
    for (let y = gp.gapY + gp.gapH + 14; y < PIGEON.GROUND_Y - 10; y += 22) {
      ctx.fillRect(gp.x + 10, y, 8, 10);
      ctx.fillRect(gp.x + 32, y, 8, 10);
    }
    // ledge edges
    ctx.fillStyle = C.red;
    ctx.fillRect(gp.x - 3, gp.gapY - 6, PIGEON.COL_W + 6, 6);
    ctx.fillRect(gp.x - 3, gp.gapY + gp.gapH, PIGEON.COL_W + 6, 6);
  }

  // ground
  ctx.fillStyle = C.groundTop;
  ctx.fillRect(0, PIGEON.GROUND_Y, WORLD_W, 6);
  ctx.fillStyle = C.ground;
  ctx.fillRect(0, PIGEON.GROUND_Y + 6, WORLD_W, WORLD_H - PIGEON.GROUND_Y);

  // pigeon
  const px = PIGEON.PIGEON_X;
  const tilt = Math.max(-0.5, Math.min(0.9, s.vy * 0.08)) + (py - s.y) * 0.012;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(tilt);
  ctx.fillStyle = C.pigeon;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  // wing
  ctx.fillStyle = C.pigeonDark;
  const flap = s.vy < -2 ? -6 : 3;
  ctx.beginPath();
  ctx.ellipse(-3, flap, 9, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // head
  ctx.fillStyle = C.pigeon;
  ctx.beginPath();
  ctx.arc(12, -6, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.beak;
  ctx.beginPath();
  ctx.moveTo(18, -6);
  ctx.lineTo(25, -4);
  ctx.lineTo(18, -2);
  ctx.fill();
  ctx.fillStyle = C.eye;
  ctx.beginPath();
  ctx.arc(14, -8, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // drunk X eye when dead
  if (s.dead) {
    ctx.strokeStyle = C.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(11, -11); ctx.lineTo(17, -5);
    ctx.moveTo(17, -11); ctx.lineTo(11, -5);
    ctx.stroke();
  }
  ctx.restore();

  // HUD
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.font = "600 40px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillText(String(s.score), WORLD_W / 2, 80);
  ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = "rgba(248,249,250,0.6)";
  ctx.fillText(`best ${hud.best}`, WORLD_W / 2, 102);
  drawChase(ctx, hud, s.score, WORLD_W, "rgba(248,249,250,0.75)", "#FF8B2E");

  if (!hud.started && hud.firstRun) {
    ctx.fillStyle = C.text;
    ctx.font = "700 18px Silkscreen, 'IBM Plex Mono', monospace";
    ctx.fillText("DRUNK PIGEON", WORLD_W / 2, 190);
    ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = "rgba(248,249,250,0.8)";
    ctx.fillText("tap to flap. it gets worse.", WORLD_W / 2, 216);
  }
  if (s.dead) {
    const body = `${plural(s.score, "gap", "gaps")}. tap to go again.`;
    // `${s.gaps.length} buildings` used to follow this: it counted the gap
    // objects still alive on screen, not buildings passed, so a one-gap run
    // read "1 buildings". Wrong number, wrong plural, on a screen people
    // screenshot.
    const flew = `${(s.tick / 60).toFixed(1)}s in the air.`;
    const ys = drawDeathCard(ctx, WORLD_W, 240, DEATH_LINES[hud.seed % DEATH_LINES.length]!, [body, flew, hud.note, hud.sub]);
    let i = 0;
    ctx.fillStyle = C.text; ctx.font = "700 16px Silkscreen, 'IBM Plex Mono', monospace";
    ctx.fillText(DEATH_LINES[hud.seed % DEATH_LINES.length]!, WORLD_W / 2, ys[i++]!);
    ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = "rgba(248,249,250,0.8)"; ctx.fillText(body, WORLD_W / 2, ys[i++]!);
    ctx.fillStyle = "rgba(248,249,250,0.65)"; ctx.fillText(flew, WORLD_W / 2, ys[i++]!);
    if (hud.note) { ctx.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "#FF8B2E"; ctx.fillText(hud.note, WORLD_W / 2, ys[i++]!); }
    if (hud.sub) { ctx.font = "12px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "rgba(248,249,250,0.75)"; ctx.fillText(hud.sub, WORLD_W / 2, ys[i++]!); }
  }

  ctx.restore();
}
