import { plural, type Hud } from "../mount";
import { drawChase, drawDeathCard } from "../hud";
import { FLOOR_H, SL_H, SL_W, VIOLATIONS, type SlumlordState } from "../../sim/slumlord";

const C = { sky: "#8fa3b8", sky2: "#c9d3dc", ground: "#4a4a4a", brick: "#9a5a3c", brick2: "#7d4730", window: "#f2d16b", frame: "#2a2420", text: "#1a1410", paper: "#f5efe0", ok: "#17512f", red: "#c62f2f" };


/* One pool per game. Two thirds of these used to be the same four lines
 * copy-pasted across all three, so three different games felt like one game
 * with three skins, and the shared ones were borrowed meme cadence rather
 * than landlord satire. Kept under 26 characters: fillText is centred with
 * no wrap in a 360px world, so anything longer shears off BOTH edges. */
const DEATH_LINES = [
  "condemned.",
  "the inspector is here.",
  "physics showed up.",
  "structurally optimistic.",
  "that one was load-bearing.",
  "tenants noticed.",
  "reclassified as rubble.",
  "the building said no.",
  "still charging full rent.",
  "all of the violations.",
  "collapsed. rent unchanged.",
  "the drywall gave up.",
];

export function drawSlumlord(ctx: CanvasRenderingContext2D, s: SlumlordState, scale: number, hud: Hud) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = C.sky; ctx.fillRect(0, 0, SL_W, SL_H);

  // camera: always keep the floor you are actually aiming at in the middle of the screen,
  // from the very first drop, not just once the tower is tall
  const activeY = SL_H - 60 - (s.floors.length + 1) * FLOOR_H;
  const cam = Math.max(0, 320 - activeY);

  // ground (filled all the way down so there is never a gap under it)
  ctx.fillStyle = C.ground; ctx.fillRect(0, SL_H - 60 + cam, SL_W, SL_H + 400);

  const drawFloor = (x: number, w: number, y: number, v: number, perfect: boolean, moving: boolean) => {
    ctx.fillStyle = perfect ? C.brick : (moving ? C.brick : C.brick2);
    ctx.fillRect(x, y, w, FLOOR_H);
    ctx.fillStyle = C.frame; ctx.fillRect(x, y, w, 2);
    // windows
    ctx.fillStyle = C.window;
    for (let wx = x + 6; wx + 8 <= x + w - 4; wx += 16) ctx.fillRect(wx, y + 7, 8, 9);
    // violation painted on the side

  };

  s.floors.forEach((f, i) => drawFloor(f.x, f.w, SL_H - 60 - (i + 1) * FLOOR_H + cam, f.v, f.perfect, false));
  if (!s.dead) drawFloor(s.cur.x, s.cur.w, SL_H - 60 - (s.floors.length + 1) * FLOOR_H + cam, s.cur.v, false, true);

  // perfect feedback. The width you win back is the whole point of the game,
  // so say it out loud: a green sliver on the part you regained, plus the streak.
  const topF = s.floors[s.floors.length - 1];
  const below = s.floors[s.floors.length - 2];
  if (topF && below && topF.perfect && topF.w > below.w && !s.dead) {
    const y = SL_H - 60 - s.floors.length * FLOOR_H + cam;
    ctx.fillStyle = C.ok;
    ctx.fillRect(topF.x, y, (topF.w - below.w) / 2, FLOOR_H);
    ctx.fillRect(topF.x + topF.w - (topF.w - below.w) / 2, y, (topF.w - below.w) / 2, FLOOR_H);
  }
  if (s.perfectStreak > 0 && !s.dead) {
    const iy = SL_H - 60 - s.floors.length * FLOOR_H + cam;
    ctx.fillStyle = C.ok; ctx.font = "600 12px 'IBM Plex Mono', monospace"; ctx.textAlign = "left";
    const grew = topF && below && topF.w > below.w;
    ctx.fillText(s.perfectStreak > 1 ? `perfect x${s.perfectStreak}${grew ? " · wider" : ""}` : (grew ? "perfect · wider" : "perfect"), 16, iy - 10);
  }

  // The inspector's clipboard: every floor you land adds its violation to the
  // sky. Fills the dead space and puts the best copy in the product where it
  // can actually be read.
  {
    const list = s.floors.slice(1).slice(-11);
    ctx.textAlign = "left";
    ctx.font = "11px 'IBM Plex Mono', ui-monospace, monospace";
    let y = 140;
    for (let i = 0; i < list.length; i++) {
      const f = list[i]!;
      ctx.fillStyle = `rgba(26,20,16,${0.45 + 0.055 * i})`;
      ctx.fillText(`${VIOLATIONS[f.v] ?? ""}`, 14, y);
      y += 15;
    }
    if (list.length) {
      ctx.fillStyle = "rgba(26,20,16,0.45)";
      ctx.font = "600 10px 'IBM Plex Mono', monospace";
      ctx.fillText("INSPECTION NOTES", 14, 124);
    }
  }

  // HUD
  ctx.fillStyle = C.text; ctx.textAlign = "center";
  ctx.font = "600 40px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillText(String(s.floors.length - 1), SL_W / 2, 80);
  ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "rgba(26,20,16,0.65)"; ctx.fillText(`floors · best ${hud.best}`, SL_W / 2, 102);
  drawChase(ctx, hud, s.floors.length - 1, SL_W, "rgba(26,20,16,0.7)", "#17512f");

  if (!hud.started && hud.firstRun) {
    ctx.fillStyle = C.text; ctx.font = "700 18px Silkscreen, 'IBM Plex Mono', monospace"; ctx.fillText("SLUMLORD", SL_W / 2, 200);
    ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "rgba(26,20,16,0.8)"; ctx.fillText("tap to drop the floor. overhang falls off.", SL_W / 2, 226);
    ctx.fillStyle = C.ok; ctx.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillText("land it dead centre and you win width back.", SL_W / 2, 250);
  }
  if (s.dead) {
    const body = `${plural(s.floors.length - 1, "floor", "floors")}. tap to go again.`;
    const ys = drawDeathCard(ctx, SL_W, 200, DEATH_LINES[hud.seed % DEATH_LINES.length]!, [body, hud.note, hud.sub]);
    let i = 0;
    ctx.fillStyle = C.paper; ctx.font = "700 16px Silkscreen, 'IBM Plex Mono', monospace";
    ctx.fillText(DEATH_LINES[hud.seed % DEATH_LINES.length]!, SL_W / 2, ys[i++]!);
    ctx.font = "13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillText(body, SL_W / 2, ys[i++]!);
    if (hud.note) { ctx.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "#FF8B2E"; ctx.fillText(hud.note, SL_W / 2, ys[i++]!); }
    if (hud.sub) { ctx.font = "12px 'IBM Plex Mono', ui-monospace, monospace"; ctx.fillStyle = "rgba(245,239,224,0.8)"; ctx.fillText(hud.sub, SL_W / 2, ys[i++]!); }
  }
  ctx.restore();
}
