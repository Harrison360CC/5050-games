import type { Replay, Sim } from "../sim/types";
import { Runner } from "./runner";

/** What the renderer is told about the run, beyond the sim state. */
export interface Hud { best: number; started: boolean; seed: number; target: number; leader: string; ranked: boolean; waiting: boolean }

export interface GameDef<S> {
  sim: Sim<S>;
  worldW: number;
  worldH: number;
  draw: (ctx: CanvasRenderingContext2D, s: S, scale: number, hud: Hud) => void;
}

/**
 * Mounts a game into a container: canvas, resize, input, loop. On death hands
 * the Replay to onRun. Returns an unmount function so tabs can switch cleanly.
 */
export function mountGame<S>(container: HTMLElement, def: GameDef<S>, opts: {
  seed: () => number;
  onRun: (replay: Replay, claimedScore: number) => void;
  /** The score to beat this week, and who holds it. Read fresh every frame. */
  target?: () => { score: number; handle: string; ranked: boolean };
  /** False while a ranked course is still being fetched. Taps are ignored
   *  until it is true, so a ranked run can never start without a server seed
   *  and silently turn out not to count. */
  ready?: () => boolean;
}): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const key = `${def.sim.id}.best`;

  let runner = new Runner(def.sim, opts.seed());
  let best = Number(lsGet(key) ?? 0);
  let scale = 1;
  let submitted = false;
  let alive = true;

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    scale = Math.min(w / def.worldW, h / def.worldH);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(def.worldW * scale * dpr);
    canvas.height = Math.floor(def.worldH * scale * dpr);
    canvas.style.width = `${def.worldW * scale}px`;
    canvas.style.height = `${def.worldH * scale}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function onTap(e: Event) {
    e.preventDefault();
    if (opts.ready && !opts.ready()) return; // still fetching a ranked course
    if (runner.dead) { runner = new Runner(def.sim, opts.seed()); submitted = false; return; }
    runner.tap();
  }
  // e.repeat guard: OS key-repeat fires ~30Hz, which would otherwise record a
  // tap pattern no human produces and get the run thrown out.
  function onKey(e: KeyboardEvent) { if (!e.repeat && (e.code === "Space" || e.code === "ArrowUp")) onTap(e); }
  canvas.addEventListener("pointerdown", onTap);
  window.addEventListener("keydown", onKey);

  function loop(now: number) {
    if (!alive) return;
    runner.frame(now);
    if (runner.dead && !submitted) {
      submitted = true;
      if (runner.score > best) { best = runner.score; lsSet(key, String(best)); }
      opts.onRun(runner.replay(), runner.score);
    }
    const t = opts.target?.() ?? { score: 0, handle: "", ranked: false };
    const waiting = !(opts.ready?.() ?? true);
    def.draw(ctx, runner.state, scale, { best, started: runner.started, seed: runner.seed, target: t.score, leader: t.handle, ranked: t.ranked, waiting });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return () => {
    alive = false;
    ro.disconnect();
    window.removeEventListener("keydown", onKey);
    canvas.remove();
  };
}

function lsGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} }
