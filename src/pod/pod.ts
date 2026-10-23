/**
 * The Loyalty Pod. No score, no pot, no sign-in. Walk the corridor, step into
 * a pod, watch an advert, receive a hat. The hat does nothing. Caps come from
 * AdPolicy.
 *
 * Rebuilt side-on rather than top-down. Three reasons, all of them things the
 * old version got wrong:
 *
 *  - A lit corridor with depth looks like somewhere. Eight-pixel figures seen
 *    from above look like a debug view.
 *  - Walking is now one-dimensional, so the old collision handler that silently
 *    cancelled your walk order the moment you clipped a pod block (`px.tx =
 *    px.x`) has nothing to cancel. That bug, not the speed, is why people tapped
 *    a pod and never arrived.
 *  - All text is drawn AFTER ctx.restore(), at device scale, in the site's real
 *    fonts. The old file drew every string inside ctx.scale(), which is why the
 *    whole surface rendered at about 5.7 CSS px and the billboards sheared off
 *    mid-word.
 *
 * Scale is an integer, always. The old `Math.min(w/W, h/H)` produced 0.949 on a
 * phone, which is what made the pixels mushy.
 */
import { AdPolicy, browserCountStore, AD_RULES } from "../ads/policy";
import { Fx, supportsHaptics } from "../fx/fx";

const VIEW_W = 168, VIEW_H = 182;
/** World units per footstep. The figure is 28 units tall, so this is a stride. */
const STRIDE = 28;   // world units; rendered at integer scale
const PITCH = 70;                   // horizontal distance between pod centres
const FLOOR_Y = 132;                // where the back wall meets the floor
const FEET_Y = 150;                 // the line the player walks along
// DOOR_TOP + DOOR_H lands exactly on FLOOR_Y. At 72 every doorway stopped
// 18 units above the ground with a band of wall under it, which was the
// biggest "laid out by arithmetic" tell in the picture.
const DOOR_W = 48, DOOR_TOP = 42, DOOR_H = 90;

interface Pod { id: number; x: number; sign: string; reward: string; open: boolean; gag?: string }

const PODS: Pod[] = [
  { id: 1, x: 76,  sign: "POD 01", reward: "paper crown",  open: true },
  { id: 2, x: 146, sign: "POD 02", reward: "tiny top hat", open: true },
  { id: 3, x: 216, sign: "POD 03", reward: "traffic cone", open: true },
  { id: 4, x: 286, sign: "POD 04", reward: "", open: false, gag: "OUT OF ORDER. HAS BEEN SINCE 2019." },
  { id: 5, x: 356, sign: "POD 05", reward: "", open: false, gag: "A PIGEON IS ASLEEP IN HERE. DO NOT WAKE IT." },
  { id: 6, x: 426, sign: "POD 06", reward: "", open: false, gag: "THIS POD LEADS TO MORE PODS. PLEASE HOLD." },
];
// Wide enough that the props sit past the walkable range. Before this the
// vending machine covered POD 01's frame and the player clamped to a stop
// standing INSIDE it, with the plant's stems crossing POD 06's label.
const SCENE_W = 510;
const WALK_MIN = 44, WALK_MAX = 438;

/** Two palettes. The old file was hardcoded dark and was the only surface on
 *  the site that ignored the light theme entirely. */
const DARK = {
  ceil: "#15181e", wall: "#3d434d", wallLo: "#2f343d", rail: "#525a67", scuff: "#464d58",
  floor: "#15181c", floorLo: "#23272e", gloss: "#39404a", horizon: "#0c0e12",
  door: "#0d0f13", frame: "#5b6474", jamb: "#1a1d23",
  lit: "#FF8B2E", dead: "#6b5c4e", tube: "#FFF8E2", glow: "255,236,190",
  ink: "#F2F0EA", muted: "#AEB3BC", plate: "#4a515d",
  doorInk: "#D4CFC2", doorLit: "#FFA14A",
  skin: "#eebb94", suit: "#6e7789", suitHi: "#8993a6", shoe: "#1d2026",
  vend: "#4d4134", cool: "#56708a", plant: "#3c5a44",
};
const LIGHT = {
  ceil: "#bfbaad", wall: "#eae6dc", wallLo: "#dcd8cd", rail: "#b4afa2", scuff: "#d2cdc0",
  floor: "#a39e90", floorLo: "#8f8a7c", gloss: "#bdb8aa", horizon: "#7d786b",
  door: "#2e2b25", frame: "#9a9589", jamb: "#4e4a41",
  lit: "#B84A00", dead: "#9a9183", tube: "#FFF8E0", glow: "255,214,140",
  ink: "#1A1A1A", muted: "#5F5D58", plate: "#cac5b8",
  doorInk: "#D4CFC2", doorLit: "#FFA14A",
  skin: "#c98f63", suit: "#6d7483", suitHi: "#848c9c", shoe: "#2a2c31",
  vend: "#8a7963", cool: "#7d97a8", plant: "#5c7a60",
};
type Pal = typeof DARK;

const HAT_ORDER = ["paper crown", "tiny top hat", "traffic cone"];

export function mountPod(container: HTMLElement, opts: {
  showAd: (pod: { id: number; reward: string }) => Promise<boolean>;
  /** Where the prose goes. DOM, in real fonts, never inside the canvas. */
  say: (msg: string) => void;
}): { destroy(): void; fx: Fx; hasHaptics: boolean } {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  canvas.style.imageRendering = "pixelated";
  canvas.style.touchAction = "pan-y";   // a vertical swipe still scrolls the page
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "Loyalty Pod corridor. Tap a pod to walk to it.");
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const policy = new AdPolicy(browserCountStore("5050.ads"));
  const fx = new Fx();

  let pal: Pal = DARK;
  let scale = 2;
  let alive = true, onScreen = true, raf = 0, wakeUntil = 0, last = 0;
  let busy = false;
  let flickerAt = 0, flickerUntil = 0;
  const rm = matchMedia("(prefers-reduced-motion: reduce)");
  let reduceMotion = rm.matches;
  const onRM = () => { reduceMotion = rm.matches; wake(60); };
  rm.addEventListener("change", onRM);
  const me = { x: 84, tx: 84, face: 1, step: 0, walking: false };
  let cam = 0;
  let target: Pod | null = null;   // the pod this walk was aimed at, if any
  let hats: string[] = [];
  let wearing = 0;
  try { hats = JSON.parse(localStorage.getItem("5050.hats") || "[]"); } catch {}

  function readTheme() {
    const dark = !matchMedia("(prefers-color-scheme: light)").matches
      || document.documentElement.dataset.theme === "dark";
    pal = document.documentElement.dataset.theme === "light" ? LIGHT : dark ? DARK : LIGHT;
  }
  readTheme();
  const mq = matchMedia("(prefers-color-scheme: light)");
  const onTheme = () => { readTheme(); wake(60); };
  mq.addEventListener("change", onTheme);

  function resize() {
    const w = container.clientWidth || 336;
    scale = Math.max(2, Math.floor(w / VIEW_W));           // integer, always
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW_W * scale * dpr;
    canvas.height = VIEW_H * scale * dpr;
    canvas.style.width = `${VIEW_W * scale}px`;
    canvas.style.height = `${VIEW_H * scale}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    wake(60);
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  /** Keep the render loop alive for a while. Idle costs zero frames. */
  function wake(ms: number) {
    wakeUntil = performance.now() + ms;
    if (!raf && alive && onScreen && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
  }

  const podAt = (wx: number) => PODS.find((p) => wx >= p.x - DOOR_W / 2 && wx <= p.x + DOOR_W / 2);

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    fx.unlock(); fx.hum(true);
    if (busy) return;
    const r = canvas.getBoundingClientRect();
    const wx = ((e.clientX - r.left) / r.width) * VIEW_W + cam;
    const wy = ((e.clientY - r.top) / r.height) * VIEW_H;

    // Tapping yourself cycles the hat you are wearing. Costs nothing, and the
    // old 6x2 orange rectangle was the single most complained-about reward on
    // the site partly because you could never see it properly.
    if (hats.length > 1 && Math.abs(wx - me.x) < 12 && wy > 110) {
      wearing = (wearing + 1) % hats.length;
      fx.tick(); fx.buzz(25);
      opts.say(`NOW WEARING: ${hats[wearing]!.toUpperCase()}. IT STILL DOES NOTHING.`);
      wake(400); return;
    }

    // Pod catch zones cover 72% of the corridor, and arrival used to consult
    // podAt() regardless of where you tapped -- so tapping bare floor walked
    // you into a pod and spent one of three daily rewarded ads.
    const p = wy < FLOOR_Y ? podAt(wx) : undefined;
    target = p ?? null;
    me.tx = Math.max(WALK_MIN, Math.min(WALK_MAX, p ? p.x : wx));
    me.face = me.tx < me.x ? -1 : 1;
    me.walking = true;
    fx.tick(); fx.buzz(20);
    wake(9000);
  }, { passive: false });

  async function enter(p: Pod) {
    if (busy) return;
    busy = true; me.walking = false;
    if (!p.open) { fx.doorLocked(); opts.say(p.gag!); busy = false; wake(300); return; }
    // Off-play gate. The old code asked canOfferRewarded(), whose run-pacing
    // rules refused the first pod of every session, so nobody ever got in.
    if (!policy.canOfferRewardedOffPlay()) {
      fx.denied();
      opts.say(`PODS CLOSED FOR THE NIGHT. ${AD_RULES.MAX_REWARDED_PER_DAY} A DAY. COME BACK TOMORROW, ASSET.`);
      busy = false; wake(300); return;
    }
    // Deliberately NOT policy.rewardedOffered(): that only sets
    // lastRewardedOfferRun, which is on-play pacing state. Writing it from an
    // off-play surface made walking into a pod suppress the in-game rewarded
    // offer for up to two subsequent runs. The daily cap is enforced by
    // canOfferRewardedOffPlay() reading the counter that rewardedCompleted()
    // increments, so nothing is lost by leaving the pacing state alone.
    fx.doorOpen();
    opts.say(`ENTERING ${p.sign}. THE ADVERT IS SHORT. THE HAT IS FOREVER.`);
    wake(600);
    const ok = await opts.showAd({ id: p.id, reward: p.reward });
    if (ok) {
      policy.rewardedCompleted();
      if (!hats.includes(p.reward)) { hats.push(p.reward); wearing = hats.length - 1; }
      try { localStorage.setItem("5050.hats", JSON.stringify(hats)); } catch {}
      fx.reward();
      opts.say(`YOU GOT: ${p.reward.toUpperCase()}. IT DOES NOTHING. THANK YOU FOR YOUR LOYALTY.`);
    } else {
      fx.abandon();
      opts.say("YOU LEFT EARLY. NO HAT. THE POD UNDERSTANDS.");
    }
    busy = false; wake(900);
  }

  // ---------------------------------------------------------------- drawing

  function drawScene(now: number) {
    const flick = reduceMotion ? 1 : (now < flickerUntil ? (Math.sin(now * 0.9) > 0.1 ? 1 : 0.55) : 1);
    const c0 = Math.round(cam);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-c0, 0);
    // Every full-width rect overdraws by a unit. Drawing them at `cam` while
    // translating by `round(cam)` left a sub-pixel sliver of bare page showing
    // down one edge of the canvas on every camera ease.
    const X = c0 - 1, FW = VIEW_W + 2;

    ctx.fillStyle = pal.ceil;   ctx.fillRect(X, 0, FW, 26);
    ctx.fillStyle = pal.wall;   ctx.fillRect(X, 26, FW, 82);
    ctx.fillStyle = pal.wallLo; ctx.fillRect(X, 108, FW, FLOOR_Y - 108);
    ctx.fillStyle = pal.rail;   ctx.fillRect(X, 106, FW, 2);

    ctx.fillStyle = pal.scuff;
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % SCENE_W, y = 30 + ((i * 53) % 70), w = 3 + ((i * 7) % 11);
      if (x > cam - 20 && x < cam + VIEW_W + 20) ctx.fillRect(x, y, w, 1);
    }

    // FLOOR FIRST. It used to be filled after the light pools and the pod
    // spill, opaquely, which erased every one of them: the floor measured
    // exactly pal.floor under a lamp, under an open pod and in shadow alike.
    ctx.fillStyle = pal.floor;   ctx.fillRect(X, FLOOR_Y, FW, VIEW_H - FLOOR_Y);
    ctx.fillStyle = pal.horizon; ctx.fillRect(X, FLOOR_Y, FW, 2);      // hard contact line
    ctx.fillStyle = pal.gloss;   ctx.fillRect(X, FLOOR_Y + 2, FW, 2);
    // Horizontal seams read as a floor receding. The old vertical streaks read
    // as fence boards and had their own parallax, so the ground crawled.
    ctx.fillStyle = pal.floorLo;
    for (const dy of [7, 14, 24, 37, 52]) ctx.fillRect(X, FLOOR_Y + dy, FW, 1);

    // Light is ADDED, not washed over. Compositing near-white onto a blue-grey
    // wall desaturated it, which is why the cones looked like plaster columns.
    ctx.globalCompositeOperation = "lighter";
    for (const p of PODS) {
      const tx = p.x;                                    // lamp over its own door
      if (tx < cam - 70 || tx > cam + VIEW_W + 70) continue;
      const g = ctx.createRadialGradient(tx, 18, 6, tx, 18, 128);
      g.addColorStop(0, `rgba(${pal.glow},${0.20 * flick})`);
      g.addColorStop(0.45, `rgba(${pal.glow},${0.06 * flick})`);
      g.addColorStop(1, `rgba(${pal.glow},0)`);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tx - 16, 18); ctx.lineTo(tx + 16, 18);
      ctx.lineTo(tx + 44, FLOOR_Y + 14); ctx.lineTo(tx - 44, FLOOR_Y + 14);
      ctx.closePath(); ctx.clip();
      ctx.fillStyle = g; ctx.fillRect(tx - 52, 10, 104, VIEW_H);
      ctx.restore();
    }
    ctx.globalCompositeOperation = "source-over";

    for (const p of PODS) {
      const tx = p.x;
      if (tx < cam - 70 || tx > cam + VIEW_W + 70) continue;
      ctx.fillStyle = pal.ceil; ctx.fillRect(tx - 20, 12, 40, 7);
      ctx.globalAlpha = flick;
      ctx.fillStyle = pal.tube; ctx.fillRect(tx - 17, 14, 34, 3);
      ctx.globalAlpha = 0.5 * flick; ctx.fillRect(tx - 19, 13, 38, 5);
      ctx.globalAlpha = 1;
    }

    for (const p of PODS) {
      if (p.x < cam - 70 || p.x > cam + VIEW_W + 70) continue;
      const x = p.x - DOOR_W / 2;
      ctx.fillStyle = pal.frame; ctx.fillRect(x - 3, DOOR_TOP - 3, DOOR_W + 6, DOOR_H + 3);
      ctx.fillStyle = pal.jamb;  ctx.fillRect(x - 1, DOOR_TOP - 1, DOOR_W + 2, DOOR_H + 1);
      ctx.fillStyle = pal.door;  ctx.fillRect(x, DOOR_TOP, DOOR_W, DOOR_H);
      ctx.fillStyle = `rgba(0,0,0,${pal === DARK ? 0.35 : 0.14})`;
      ctx.fillRect(x + 4, DOOR_TOP + 4, DOOR_W - 8, DOOR_H - 4);
      ctx.fillStyle = pal.plate; ctx.fillRect(x + 4, DOOR_TOP - 15, DOOR_W - 8, 12);

      if (p.open) {
        // The open/closed tell lives on the DOORWAY, not the 4px lamp. In light
        // theme a lit lamp measured 1.68:1 against a dead one, which is not
        // classifiable at 8 CSS px; a lit doorway is 1.6:1 over 96x136.
        const inner = ctx.createLinearGradient(0, DOOR_TOP, 0, DOOR_TOP + DOOR_H);
        inner.addColorStop(0, `rgba(255,139,46,${0.26 * flick})`);
        inner.addColorStop(0.55, `rgba(255,139,46,${0.12 * flick})`);
        inner.addColorStop(1, "rgba(255,139,46,0.04)");
        ctx.fillStyle = inner; ctx.fillRect(x + 4, DOOR_TOP + 4, DOOR_W - 8, DOOR_H - 4);
        // a lamp, not an orange sticky note
        const lg = ctx.createRadialGradient(p.x, DOOR_TOP + 8, 1, p.x, DOOR_TOP + 8, 17);
        lg.addColorStop(0, `rgba(255,186,110,${0.60 * flick})`);
        lg.addColorStop(0.30, `rgba(255,139,46,${0.26 * flick})`);
        lg.addColorStop(1, "rgba(255,139,46,0)");
        ctx.fillStyle = lg; ctx.fillRect(p.x - 17, DOOR_TOP - 9, 34, 34);
        ctx.fillStyle = "#FFD9A8"; ctx.fillRect(p.x - 1, DOOR_TOP + 7, 2, 2);
        // spill on the floor, which now survives because the floor is already down
        const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, VIEW_H);
        fg.addColorStop(0, `rgba(255,139,46,${0.11 * flick})`);
        fg.addColorStop(1, "rgba(255,139,46,0)");
        ctx.fillStyle = fg; ctx.fillRect(p.x - 28, FLOOR_Y + 2, 56, VIEW_H - FLOOR_Y);
      } else {
        ctx.fillStyle = pal.dead; ctx.fillRect(p.x - 2, DOOR_TOP + 6, 4, 4);
      }
    }

    prop(22, "vend"); prop(466, "plant"); prop(488, "cool");
    drawMe(now, flick);
    ctx.restore();
  }

  function prop(x: number, kind: "vend" | "cool" | "plant") {
    if (x < cam - 40 || x > cam + VIEW_W + 40) return;
    if (kind === "vend") {
      ctx.fillStyle = pal.vend; ctx.fillRect(x - 11, 78, 22, 54);
      ctx.fillStyle = pal.jamb; ctx.fillRect(x - 8, 82, 16, 30);
      ctx.fillStyle = pal.lit;  ctx.fillRect(x - 6, 86, 3, 4); ctx.fillRect(x + 1, 86, 3, 4);
      ctx.fillStyle = pal.dead; ctx.fillRect(x - 6, 94, 3, 4);
    } else if (kind === "cool") {
      ctx.fillStyle = pal.cool; ctx.fillRect(x - 7, 86, 14, 20);
      ctx.fillStyle = pal.frame; ctx.fillRect(x - 6, 106, 12, 26);
    } else {
      ctx.fillStyle = pal.frame; ctx.fillRect(x - 5, 118, 10, 14);
      ctx.fillStyle = pal.plant;
      for (const [dx, dy, h] of [[-4, 104, 16], [0, 99, 20], [4, 106, 14]] as const)
        ctx.fillRect(x + dx, dy, 2, h);
    }
  }

  function drawMe(now: number, flick: number) {
    const phase = Math.floor(me.step / STRIDE) % 2;
    const bob = me.walking ? phase : 0;
    // Round the DIFFERENCE, not both terms. Rounding me.x and cam separately
    // made the on-screen position non-monotonic: the figure hitched 2px
    // backward ~13 times a second, and worse on a faster phone, because a
    // smaller per-frame delta lets the rounding flip dominate.
    const camR = Math.round(cam);
    const x = camR + Math.round(me.x - cam), y = FEET_Y + bob;
    // Contact shadow pinned to the floor. Bobbing it with the body cancelled
    // the only cue that a footfall happened; it widens instead.
    ctx.fillStyle = `rgba(0,0,0,${pal === DARK ? 0.4 : 0.18})`;
    ctx.beginPath(); ctx.ellipse(x, FEET_Y + 1, bob ? 8 : 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    // legs: an integer scissor on BOTH sides. The old version moved one leg by
    // stride*0.3, so it sat on a fractional pixel forever on a surface whose
    // entire premise is integer-scaled pixel art.
    ctx.fillStyle = pal.shoe;
    const stride = me.walking ? (phase ? 2 : -2) : 0;
    ctx.fillRect(x - 4 - stride, y - 8, 3, 8);
    ctx.fillRect(x + 1 + stride, y - 8, 3, 8);
    // body
    ctx.fillStyle = pal.suit;   ctx.fillRect(x - 5, y - 20, 10, 14);
    ctx.fillStyle = pal.suitHi; ctx.fillRect(x - 5, y - 20, 10, 2);
    // head
    ctx.fillStyle = pal.skin; ctx.fillRect(x - 4, y - 28, 8, 8);
    ctx.fillStyle = pal.shoe; ctx.fillRect(x + (me.face > 0 ? 1 : -3), y - 26, 2, 2);
    if (hats.length) drawHat(hats[Math.min(wearing, hats.length - 1)]!, x, y - 28, flick);
  }

  /** Hats, drawn big enough to actually see. The old one was 6x2 pixels. */
  function drawHat(name: string, x: number, headTop: number, flick: number) {
    // Two passes: an inflated silhouette in a contrasting value, then the hat
    // itself. The top hat measured 1.45:1 against the dark lower wall and the
    // paper crown 1.06:1 against the light one, and the head always sits there,
    // so without this each hat is invisible in one of the two themes. A plain
    // rectangle behind the head reads as a grey box, hence the silhouette.
    for (const pass of [0, 1]) {
      const halo = pass === 0;
      ctx.fillStyle = pal === DARK ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.34)";
      const R = (rx: number, ry: number, rw: number, rh: number, col?: string) => {
        if (halo) ctx.fillRect(rx - 1, ry - 1, rw + 2, rh + 2);
        else { if (col) ctx.fillStyle = col; ctx.fillRect(rx, ry, rw, rh); }
      };
      hatShape(name, x, headTop, R);
    }
  }

  /** The three hats, as rect calls so the halo pass can inflate each one. */
  function hatShape(
    name: string, x: number, headTop: number,
    R: (rx: number, ry: number, rw: number, rh: number, col?: string) => void,
  ) {
    if (name === "paper crown") {
      R(x - 5, headTop - 4, 10, 4, "#E9D27A");
      for (let i = 0; i < 3; i++) R(x - 5 + i * 4, headTop - 7, 2, 3, "#E9D27A");
    } else if (name === "tiny top hat") {
      R(x - 5, headTop - 2, 10, 2, "#15161a");
      R(x - 3, headTop - 8, 6, 6, "#15161a");
      R(x - 3, headTop - 4, 6, 1, "#8a2f2f");
    } else {
      R(x - 5, headTop - 2, 10, 2, "#E2641E");
      R(x - 3, headTop - 5, 6, 3, "#E2641E");
      R(x - 2, headTop - 8, 4, 3, "#E2641E");
      R(x - 3, headTop - 5, 6, 1, "#F2F0EA");
    }
  }

  /**
   * Text pass. Runs AFTER ctx.restore(), so sizes are real CSS pixels in the
   * site's own fonts, not world units squeezed through a 2x transform.
   */
  function drawText() {
    const sx = (wx: number) => (wx - cam) * scale;
    ctx.textAlign = "center";
    const edge = VIEW_W * scale;
    const fits = (t: string, cx: number) => { const w = ctx.measureText(t).width / 2; return cx - w >= 2 && cx + w <= edge - 2; };
    for (const p of PODS) {
      const cx = sx(p.x);
      if (cx < -90 || cx > edge + 90) continue;
      ctx.fillStyle = pal.ink;
      ctx.font = `700 ${Math.max(11, 6 * scale)}px Silkscreen, 'IBM Plex Mono', monospace`;
      // Cull by whether the label FITS, not by a world-unit margin. A pod 60
      // units past the viewport still drew its label centred off-canvas, so
      // the first paint showed a bare "TR" hanging at the right edge.
      if (fits(p.sign, cx)) ctx.fillText(p.sign, cx, (DOOR_TOP - 6) * scale);
      // doorInk/doorLit, not pal.muted/pal.lit: the doorway is dark in BOTH
      // themes, so page-coloured text measured 2.3:1 on it in light mode.
      ctx.fillStyle = p.open ? pal.doorLit : pal.doorInk;
      ctx.font = `${Math.max(11, 5.5 * scale)}px 'IBM Plex Mono', ui-monospace, monospace`;
      const label = p.open ? p.reward.toUpperCase() : "CLOSED";
      if (fits(label, cx)) ctx.fillText(label, cx, (DOOR_TOP + 46) * scale);
    }
  }

  function loop(now: number) {
    if (!alive) { raf = 0; return; }                       // alive FIRST, always
    if (document.hidden || !onScreen) { raf = 0; return; } // and never reschedule
    const dt = Math.min(50, now - last); last = now;

    if (me.walking && !busy) {
      const d = me.tx - me.x;
      if (Math.abs(d) > 1.2) {
        // Ease into the stop over the last stride. Arriving was a dead halt in
        // a single frame, and then the trailing camera dragged you backward.
        const ease = Math.min(1, Math.max(0.35, Math.abs(d) / 12));
        const sp = 0.1 * dt * ease;
        const before = Math.floor(me.step / STRIDE);
        const moved = Math.min(sp, Math.abs(d));
        me.x += Math.sign(d) * moved;
        me.face = d < 0 ? -1 : 1;
        // Distance, not elapsed time. The old 130ms counter fired 7.7 footsteps
        // a second, which is past a sprint, and 33 of them to cross the hall.
        me.step += moved;
        if (Math.floor(me.step / STRIDE) !== before) fx.step();
      } else {
        me.x = me.tx; me.walking = false;
        const p = target; target = null;
        if (p) void enter(p);
      }
    }
    // camera eases to keep the player centred, clamped to the corridor
    const want = Math.max(0, Math.min(SCENE_W - VIEW_W, me.x - VIEW_W / 2));
    // Exponential, not a per-frame fraction: the old form settled 28% faster
    // and framed the figure 8.6 CSS px differently at 20Hz than at 144Hz,
    // which is backwards -- the worse device got the tighter camera.
    cam += (want - cam) * (1 - Math.exp(-dt / 70));
    if (Math.abs(want - cam) < 0.2) cam = want;

    if (now > flickerAt && now > flickerUntil) {
      flickerUntil = reduceMotion ? 0 : now + 90 + Math.random() * 120;
      flickerAt = now + 2200 + Math.random() * 3500;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawScene(now);
    drawText();

    const resting = !me.walking && !busy && Math.abs(want - cam) < 0.2 && now > flickerUntil;
    if (resting && now > wakeUntil) { raf = 0; return; }   // idle costs zero frames
    raf = requestAnimationFrame(loop);
  }

  const io = new IntersectionObserver(([e]) => {
    onScreen = !!e?.isIntersecting;
    if (!onScreen) { fx.suspend(); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else { fx.resume(); wake(1200); }
  }, { threshold: 0.01 });
  io.observe(canvas);

  const onVis = () => {
    if (document.hidden) { fx.suspend(); if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    else { fx.resume(); wake(1200); }
  };
  document.addEventListener("visibilitychange", onVis);

  wake(2000);

  return {
    hasHaptics: supportsHaptics(),
    fx,
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect(); io.disconnect();
      mq.removeEventListener("change", onTheme);
      rm.removeEventListener("change", onRM);
      document.removeEventListener("visibilitychange", onVis);
      fx.destroy();
      canvas.remove();
    },
  };
}
