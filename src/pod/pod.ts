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

const VIEW_W = 168, VIEW_H = 182;   // world units; rendered at integer scale
const PITCH = 70;                   // horizontal distance between pod centres
const FLOOR_Y = 132;                // where the back wall meets the floor
const FEET_Y = 150;                 // the line the player walks along
const DOOR_W = 48, DOOR_TOP = 42, DOOR_H = 72;

interface Pod { id: number; x: number; sign: string; reward: string; open: boolean; gag?: string }

const PODS: Pod[] = [
  { id: 1, x: 42,  sign: "POD 01", reward: "paper crown",  open: true },
  { id: 2, x: 112, sign: "POD 02", reward: "tiny top hat", open: true },
  { id: 3, x: 182, sign: "POD 03", reward: "traffic cone", open: true },
  { id: 4, x: 252, sign: "POD 04", reward: "", open: false, gag: "OUT OF ORDER. HAS BEEN SINCE 2019." },
  { id: 5, x: 322, sign: "POD 05", reward: "", open: false, gag: "A PIGEON IS ASLEEP IN HERE. DO NOT WAKE IT." },
  { id: 6, x: 392, sign: "POD 06", reward: "", open: false, gag: "THIS POD LEADS TO MORE PODS. PLEASE HOLD." },
];
const SCENE_W = 434;

/** Two palettes. The old file was hardcoded dark and was the only surface on
 *  the site that ignored the light theme entirely. */
const DARK = {
  ceil: "#15181e", wall: "#3d434d", wallLo: "#2f343d", rail: "#525a67", scuff: "#464d58",
  floor: "#363b44", floorLo: "#272b32", gloss: "#4a515d",
  door: "#0d0f13", frame: "#5b6474", jamb: "#1a1d23",
  lit: "#FF8B2E", dead: "#6b5c4e", tube: "#FFF8E2", glow: "255,236,190",
  ink: "#F2F0EA", muted: "#AEB3BC", plate: "#4a515d",
  skin: "#eebb94", suit: "#6e7789", suitHi: "#8993a6", shoe: "#1d2026",
  vend: "#4d4134", cool: "#56708a", plant: "#3c5a44",
};
const LIGHT = {
  ceil: "#bfbaad", wall: "#eae6dc", wallLo: "#dcd8cd", rail: "#b4afa2", scuff: "#d2cdc0",
  floor: "#d2cec2", floorLo: "#c2beb2", gloss: "#e6e2d6",
  door: "#2e2b25", frame: "#9a9589", jamb: "#4e4a41",
  lit: "#B84A00", dead: "#9a9183", tube: "#FFF8E0", glow: "255,214,140",
  ink: "#1A1A1A", muted: "#5F5D58", plate: "#cac5b8",
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
  const me = { x: 84, tx: 84, face: 1, step: 0, walking: false };
  let cam = 0;
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
      fx.tick(); fx.buzz(8);
      opts.say(`NOW WEARING: ${hats[wearing]!.toUpperCase()}. IT STILL DOES NOTHING.`);
      wake(400); return;
    }

    const p = wy < FLOOR_Y ? podAt(wx) : undefined;
    me.tx = Math.max(16, Math.min(SCENE_W - 16, p ? p.x : wx));
    me.face = me.tx < me.x ? -1 : 1;
    me.walking = true;
    fx.tick();
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
    policy.rewardedOffered();
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
    const flick = now < flickerUntil ? (Math.sin(now * 0.9) > 0.1 ? 1 : 0.55) : 1;
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-Math.round(cam), 0);

    // ceiling
    ctx.fillStyle = pal.ceil; ctx.fillRect(cam, 0, VIEW_W, 26);
    // back wall, two values with a dado rail
    ctx.fillStyle = pal.wall;   ctx.fillRect(cam, 26, VIEW_W, 82);
    ctx.fillStyle = pal.wallLo; ctx.fillRect(cam, 108, VIEW_W, FLOOR_Y - 108);
    ctx.fillStyle = pal.rail;   ctx.fillRect(cam, 106, VIEW_W, 2);

    // wall scuffs, deterministic so they never shimmer
    ctx.fillStyle = pal.scuff;
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % SCENE_W, y = 30 + ((i * 53) % 70), w = 3 + ((i * 7) % 11);
      if (x > cam - 20 && x < cam + VIEW_W + 20) ctx.fillRect(x, y, w, 1);
    }

    // fluorescent tubes + the light they throw
    for (let i = 0; i < 7; i++) {
      const tx = 20 + i * PITCH;
      if (tx < cam - 60 || tx > cam + VIEW_W + 60) continue;
      const g = ctx.createLinearGradient(0, 16, 0, FLOOR_Y);
      g.addColorStop(0, `rgba(${pal.glow},${0.30 * flick})`);
      g.addColorStop(1, `rgba(${pal.glow},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(tx - 16, 18); ctx.lineTo(tx + 16, 18);
      ctx.lineTo(tx + 40, FLOOR_Y); ctx.lineTo(tx - 40, FLOOR_Y);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = pal.ceil; ctx.fillRect(tx - 20, 12, 40, 7);
      ctx.globalAlpha = flick;
      ctx.fillStyle = pal.tube; ctx.fillRect(tx - 17, 14, 34, 3);
      ctx.globalAlpha = 0.5 * flick;
      ctx.fillRect(tx - 19, 13, 38, 5);               // bloom around the tube
      ctx.globalAlpha = 1;
      // the pool it throws on the floor
      const fp = ctx.createLinearGradient(0, FLOOR_Y, 0, VIEW_H);
      fp.addColorStop(0, `rgba(${pal.glow},${0.16 * flick})`);
      fp.addColorStop(1, `rgba(${pal.glow},0)`);
      ctx.fillStyle = fp; ctx.fillRect(tx - 44, FLOOR_Y, 88, VIEW_H - FLOOR_Y);
    }

    // pods
    for (const p of PODS) {
      if (p.x < cam - 70 || p.x > cam + VIEW_W + 70) continue;
      const x = p.x - DOOR_W / 2;
      ctx.fillStyle = pal.frame; ctx.fillRect(x - 3, DOOR_TOP - 3, DOOR_W + 6, DOOR_H + 3);
      ctx.fillStyle = pal.jamb;  ctx.fillRect(x - 1, DOOR_TOP - 1, DOOR_W + 2, DOOR_H + 1);
      ctx.fillStyle = pal.door;  ctx.fillRect(x, DOOR_TOP, DOOR_W, DOOR_H);
      // recessed inner shadow so the door reads as a doorway, not a sticker
      ctx.fillStyle = `rgba(0,0,0,${pal === DARK ? 0.35 : 0.14})`;
      ctx.fillRect(x + 4, DOOR_TOP + 4, DOOR_W - 8, DOOR_H - 4);
      // sign plate above the door
      ctx.fillStyle = pal.plate; ctx.fillRect(x + 4, DOOR_TOP - 15, DOOR_W - 8, 12);
      // status lamp
      const on = p.open;
      ctx.fillStyle = on ? pal.lit : pal.dead;
      ctx.fillRect(p.x - 2, DOOR_TOP + 6, 4, 4);
      if (on) {
        ctx.fillStyle = `rgba(255,139,46,${0.34 * flick})`;
        ctx.fillRect(p.x - 10, DOOR_TOP + 1, 20, 14);
        // spill on the floor under an open pod
        const fg = ctx.createLinearGradient(0, FLOOR_Y, 0, VIEW_H);
        fg.addColorStop(0, `rgba(255,139,46,${0.24 * flick})`);
        fg.addColorStop(1, "rgba(255,139,46,0)");
        ctx.fillStyle = fg; ctx.fillRect(p.x - 26, FLOOR_Y, 52, VIEW_H - FLOOR_Y);
      }
    }

    // floor, with a gloss band that catches the ceiling lights
    ctx.fillStyle = pal.floor; ctx.fillRect(cam, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
    ctx.fillStyle = pal.gloss; ctx.fillRect(cam, FLOOR_Y, VIEW_W, 3);
    ctx.fillStyle = pal.floorLo;
    for (let i = 0; i < 40; i++) {
      const x = i * 24 - ((cam * 0.5) % 24);
      ctx.fillRect(cam + x, FLOOR_Y + 10, 1, VIEW_H - FLOOR_Y - 10);
    }

    // props at the ends of the corridor
    prop(14, "vend"); prop(SCENE_W - 16, "cool"); prop(SCENE_W - 46, "plant");

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
    const bob = me.walking ? (Math.floor(me.step / 130) % 2) : 0;
    const x = Math.round(me.x), y = FEET_Y + bob;
    // contact shadow, so the figure stands on the floor instead of floating
    ctx.fillStyle = `rgba(0,0,0,${pal === DARK ? 0.4 : 0.18})`;
    ctx.beginPath(); ctx.ellipse(x, y + 1, 9, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.fillStyle = pal.shoe;
    const stride = me.walking ? (Math.floor(me.step / 130) % 2 ? 3 : -3) : 1;
    ctx.fillRect(x - 4, y - 7, 3, 7); ctx.fillRect(x + 1 + stride * 0.3, y - 7, 3, 7);
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
    if (name === "paper crown") {
      ctx.fillStyle = "#E9D27A";
      ctx.fillRect(x - 5, headTop - 4, 10, 4);
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 5 + i * 4, headTop - 7, 2, 3);
    } else if (name === "tiny top hat") {
      ctx.fillStyle = "#15161a";
      ctx.fillRect(x - 5, headTop - 2, 10, 2);
      ctx.fillRect(x - 3, headTop - 8, 6, 6);
      ctx.fillStyle = "#8a2f2f"; ctx.fillRect(x - 3, headTop - 4, 6, 1);
    } else {
      ctx.fillStyle = "#E2641E";
      ctx.fillRect(x - 5, headTop - 2, 10, 2);
      ctx.fillRect(x - 3, headTop - 5, 6, 3);
      ctx.fillRect(x - 2, headTop - 8, 4, 3);
      ctx.fillStyle = "#F2F0EA"; ctx.fillRect(x - 3, headTop - 5, 6, 1);
    }
  }

  /**
   * Text pass. Runs AFTER ctx.restore(), so sizes are real CSS pixels in the
   * site's own fonts, not world units squeezed through a 2x transform.
   */
  function drawText() {
    const sx = (wx: number) => (wx - cam) * scale;
    ctx.textAlign = "center";
    for (const p of PODS) {
      if (p.x < cam - 60 || p.x > cam + VIEW_W + 60) continue;
      ctx.fillStyle = pal.ink;
      ctx.font = `700 ${Math.max(11, 6 * scale)}px Silkscreen, 'IBM Plex Mono', monospace`;
      ctx.fillText(p.sign, sx(p.x), (DOOR_TOP - 6) * scale);
      ctx.fillStyle = p.open ? pal.lit : pal.muted;
      ctx.font = `${Math.max(11, 5.5 * scale)}px 'IBM Plex Mono', ui-monospace, monospace`;
      const label = p.open ? p.reward.toUpperCase() : "CLOSED";
      ctx.fillText(label, sx(p.x), (DOOR_TOP + DOOR_H - 10) * scale);
    }
  }

  function loop(now: number) {
    if (!alive) { raf = 0; return; }                       // alive FIRST, always
    if (document.hidden || !onScreen) { raf = 0; return; } // and never reschedule
    const dt = Math.min(50, now - last); last = now;

    if (me.walking && !busy) {
      const d = me.tx - me.x;
      if (Math.abs(d) > 1.2) {
        const sp = 0.1 * dt;                               // was 0.055, "slightly too slow"
        const beforeStep = Math.floor(me.step / 130);
        me.x += Math.sign(d) * Math.min(sp, Math.abs(d));
        me.face = d < 0 ? -1 : 1;
        me.step += dt;
        if (Math.floor(me.step / 130) !== beforeStep) fx.step();
      } else {
        me.x = me.tx; me.walking = false;
        const p = podAt(me.x);
        if (p) void enter(p);
      }
    }
    // camera eases to keep the player centred, clamped to the corridor
    const want = Math.max(0, Math.min(SCENE_W - VIEW_W, me.x - VIEW_W / 2));
    cam += (want - cam) * Math.min(1, dt / 120);
    if (Math.abs(want - cam) < 0.2) cam = want;

    if (now > flickerAt && now > flickerUntil) {
      flickerUntil = now + 90 + Math.random() * 120;
      flickerAt = now + 5000 + Math.random() * 9000;
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
      document.removeEventListener("visibilitychange", onVis);
      fx.destroy();
      canvas.remove();
    },
  };
}
