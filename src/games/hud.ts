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
    ctx.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillText("getting your course…", worldW / 2, 126);
    return;
  }
  if (!hud.ranked || hud.target <= 0) return;
  ctx.textAlign = "center";
  if (score > hud.target) {
    ctx.fillStyle = accent;
    ctx.font = "600 13px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillText(`TOP OF THE WEEK · +${score - hud.target}`, worldW / 2, 126);
    return;
  }
  const need = hud.target - score + 1;
  ctx.fillStyle = ink;
  ctx.font = "12px 'IBM Plex Mono', ui-monospace, monospace";
  const who = hud.leader ? `${hud.leader} ` : "";
  ctx.fillText(`${who}leads with ${hud.target} · ${need} to go`, worldW / 2, 126);
}

/**
 * The death card: one plate sized to fit every line it holds.
 *
 * It used to be sized from the headline alone, clamped to the world width, and
 * the headline was drawn at 20px Silkscreen with `textAlign: "center"` and no
 * wrap. Four of the nine lines were wider than the 360px world, so roughly a
 * third of all runs ended with the punchline sheared off BOTH edges
 * ("while they're out partying btw." measured 407px). The plate also changed
 * width run to run, and on Pigeon the sub-line was drawn 8px below the plate's
 * bottom edge, landing unbacked on the parallax buildings.
 *
 * Returns the y of the headline so each game can keep its own vertical anchor.
 */
export function drawDeathCard(
  ctx: CanvasRenderingContext2D,
  worldW: number,
  top: number,
  head: string,
  rest: (string | undefined)[],
  scrim = "rgba(0,0,0,0.75)",
): number[] {
  const lines = rest.filter((l): l is string => !!l);
  const HEAD = "700 16px Silkscreen, 'IBM Plex Mono', monospace";
  const BODY = "13px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.font = HEAD;
  let wMax = ctx.measureText(head).width;
  ctx.font = BODY;
  for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);
  const w = Math.min(worldW - 16, Math.max(248, wMax + 32));
  const h = 30 + 24 + lines.length * 22;
  ctx.fillStyle = scrim;
  ctx.fillRect((worldW - w) / 2, top, w, h);
  // y positions: headline, then one per body line, all inside the plate.
  const ys = [top + 32];
  for (let i = 0; i < lines.length; i++) ys.push(top + 32 + 24 + i * 22);
  return ys;
}
