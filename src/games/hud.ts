import type { Hud } from "./mount";

/**
 * The chase line. In ranked, you always know exactly what you have to beat and
 * by how much, and the moment you pass it the HUD says so. A leaderboard you
 * can only read between runs is a scoreboard; this makes it a race.
 */
export function drawChase(
  ctx: CanvasRenderingContext2D,
  hud: Hud,
  score: number,
  worldW: number,
  ink: string,
  accent: string,
) {
  if (hud.waiting) {
    ctx.textAlign = "center";
    ctx.fillStyle = accent;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("getting your course…", worldW / 2, 126);
    return;
  }
  if (!hud.ranked || hud.target <= 0) return;
  ctx.textAlign = "center";
  if (score > hud.target) {
    ctx.fillStyle = accent;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText(`TOP OF THE WEEK · +${score - hud.target}`, worldW / 2, 126);
    return;
  }
  const need = hud.target - score + 1;
  ctx.fillStyle = ink;
  ctx.font = "13px system-ui, sans-serif";
  const who = hud.leader ? `${hud.leader} ` : "";
  ctx.fillText(`${who}leads with ${hud.target} · ${need} to go`, worldW / 2, 126);
}
