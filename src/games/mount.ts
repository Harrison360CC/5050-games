import type { Replay, Sim } from "../sim/types";
import { Runner } from "./runner";

/** What the renderer is told about the run, beyond the sim state. */
export interface Hud { best: number; started: boolean; seed: number; target: number; leader: string; ranked: boolean; waiting: boolean; note: string; sub: string; firstRun: boolean }

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
  target?: () => { score: number; handle: string; ranked: boolean; rank?: number; closes?: string };
  /** False while a ranked course is still being fetched. Taps are ignored
   *  until it is true, so a ranked run can never start without a server seed
   *  and silently turn out not to count. */
  ready?: () => boolean;
  /** Fires the first time a run actually starts, so the shell can get out of
   *  the way. The world stays 360x640 for everyone; it just gets more screen. */
  onStart?: () => void;
}): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  // `pan-y` until a run is actually live, so a vertical swipe on the menu
  // scrolls the page instead of being eaten. With `none` here from the start,
  // the canvas covered the whole viewport below the nav and the first thing a
  // curious visitor does -- a short exploratory swipe -- launched a fullscreen
  // run instead of showing them what the site is. Once the run is live we want
  // `none`, because then every pixel is the game and a scroll is a misfire.
  container.style.touchAction = "pan-y";
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", `${def.sim.id}: tap or press space to play`);
  canvas.tabIndex = 0;
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const key = `${def.sim.id}.best`;

  let runner = new Runner(def.sim, opts.seed());
  let best = Number(lsGet(key) ?? 0);
  let scale = 1;
  let submitted = false;
  let alive = true;
  let note = "";
  let firstRun = true;
  let announced = false;

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
    if (runner.dead) { runner = new Runner(def.sim, opts.seed()); submitted = false; note = ""; firstRun = false;
      return; }
    runner.tap();
  }
  // e.repeat guard: OS key-repeat fires ~30Hz, which would otherwise record a
  // tap pattern no human produces and get the run thrown out.
  function onKey(e: KeyboardEvent) {
    if (e.repeat || (e.code !== "Space" && e.code !== "ArrowUp")) return;
    // Typing into the complaints box -- the only support channel here -- used
    // to swallow every space AND start a run behind the open modal.
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (document.querySelector(".sheet:not([hidden])")) return;
    onTap(e);
  }

  /**
   * While a run is live, a press acts on `pointerdown`: that is the lowest
   * latency the browser offers and the game is twitchy enough to feel the
   * difference. Everywhere else -- the idle menu, the death screen -- we wait
   * for `pointerup` and require the finger to have stayed put, so a drag
   * scrolls or does nothing rather than starting or restarting a run.
   *
   * This does not weaken verification. Taps are recorded as tick indices from
   * the start of the run, so the discrimination happens strictly before the
   * sim exists, and it makes the recorded input more human-shaped, not less.
   */
  const TAP_SLOP = 10;   // px of travel still counted as a tap
  const TAP_TIME = 500;  // ms before a press stops counting as a tap
  let down: { x: number; y: number; t: number } | null = null;
  function live() { return runner.started && !runner.dead; }
  function onDown(e: PointerEvent) {
    if (live()) { onTap(e); down = null; return; }
    down = { x: e.clientX, y: e.clientY, t: e.timeStamp };
  }
  function onUp(e: PointerEvent) {
    const d = down; down = null;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > TAP_SLOP || Math.abs(e.clientY - d.y) > TAP_SLOP) return;
    if (e.timeStamp - d.t > TAP_TIME) return;
    onTap(e);
  }
  // Bound to the container, not the canvas. `aspect-ratio` letterboxes the
  // canvas inside the stage, so on a 393x852 phone 18% of the screen was the
  // same colour as the sky and swallowed taps -- including the bottom band
  // where a thumb naturally rests. `.exit` and `.mode` are siblings of the
  // container, not children, so nothing bubbles in from them.
  container.addEventListener("pointerdown", onDown);
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointercancel", () => { down = null; });
  window.addEventListener("keydown", onKey);

  function loop(now: number) {
    if (!alive) return;
    // Rising edge of "a run is live", not a once-per-mount latch. Latched, it
    // meant that after the exit button or any sheet dropped `body.playing`,
    // nothing could put it back and every later run played in a canvas
    // clipped by ~70px. Resetting when the run ends also means a deliberate
    // exit mid-run is respected: you only go full-bleed again on a new run.
    const liveNow = runner.started && !runner.dead;
    if (liveNow && !announced) { announced = true; opts.onStart?.(); }
    if (!liveNow) announced = false;
    const want = document.body.classList.contains("playing") ? "none" : "pan-y";
    if (container.style.touchAction !== want) container.style.touchAction = want;
    // Nothing to draw while the tab is in the background. Saves battery and
    // stops the tick accumulator building up a catch-up burst on return.
    // Death has to be submitted even if the app went to the background on the
    // frame it happened, so check that BEFORE bailing out of drawing.
    if (document.hidden || canvas.offsetParent === null) {
      runner.frame(now);
      if (runner.dead && !submitted) { submitted = true; opts.onRun(runner.replay(), runner.score); }
      requestAnimationFrame(loop);
      return;
    }
    runner.frame(now);
    if (runner.dead && !submitted) {
      submitted = true;
      const t = opts.target?.();
      note = deathNote(runner.score, best, t?.ranked ? t.score : 0);
      if (runner.score > best) { best = runner.score; lsSet(key, String(best)); }
      opts.onRun(runner.replay(), runner.score);
    }
    const t = opts.target?.() ?? { score: 0, handle: "", ranked: false };
    const waiting = !(opts.ready?.() ?? true);
    const sub = waiting ? "getting your course…"
      : !t.ranked ? "practice. this one does not count."
      : t.closes ? `${t.rank ? ordinal(t.rank) + " this week · " : ""}pot closes in ${t.closes}` : "";
    container.classList.toggle("live", runner.started && !runner.dead);
    // The death screen is full-bleed too, and everything the shell wanted to
    // show at that exact moment -- the share button, the "ranked: 7 verified."
    // toast -- was hidden under `body.playing`. So the one moment a player
    // feels like sharing was the one moment they could not.
    document.body.classList.toggle("dead", runner.dead);
    def.draw(ctx, runner.state, scale, { best, started: runner.started, seed: runner.seed, target: t.score, leader: t.handle, ranked: t.ranked, waiting, note, sub, firstRun });
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

/**
 * The line under "you died". A near miss is the whole reason anyone taps again,
 * so say exactly how near it was rather than just restating the score.
 */
function deathNote(score: number, best: number, target: number): string {
  if (target > 0 && score > target) return "that is the score to beat. for now.";
  if (score > best && best > 0) return `new best by ${score - best}.`;
  if (score === best && best > 0) return "matched your best. tiebreak is going again.";
  if (score > 0 && best === 0) return "that is your best. admittedly a low bar.";
  if (target > 0 && target - score <= Math.max(3, Math.round(target * 0.12))) return `${target - score + 1} more and the lead is yours.`;
  if (best > 0 && best - score > 0 && best - score <= 2) return `${best - score} off your best. go again.`;
  return "";
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]!);
}

/** "1 days" is the kind of thing people screenshot to mock you. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
