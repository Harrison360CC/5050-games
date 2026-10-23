/**
 * The Loyalty Center. No score, no pot, no sign-in. Walk into a pod, watch an
 * ad (via the same adBreak reward hook the games use; placeholder until H5 is
 * live), get a hat. Caps come from AdPolicy. Tile map is 24x20 at 16px, drawn
 * at integer scale for crisp pixels. Dystopian vending hall, no neon.
 */
import { AdPolicy, browserCountStore, AD_RULES } from "../ads/policy";

const T = 16, COLS = 22, ROWS = 20;
const W = COLS * T, H = ROWS * T;

// 0 floor, 1 wall, 2 queue tape, 3 pod (door tile), 4 vending, 5 cooler, 6 billboard
const MAP = [
  "1111111111111111111111",
  "1666661000000001666661",
  "1000000000000000000001",
  "1000000000000000000001",
  "1033000033000033000001",
  "1022000022000022000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1033000033000033000001",
  "1022000022000022000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1000000000000000000001",
  "1400000000000000000051",
  "1400000000000000000051",
  "1000000000000000000001",
  "1111111111111111111111",
];

interface Pod { id: number; x: number; y: number; w: number; h: number; sign: string; reward: string; open: boolean; gag?: string }

const PODS: Pod[] = [
  { id: 1, x: 2, y: 4, w: 2, h: 1, sign: "POD 01", reward: "paper crown", open: true },
  { id: 2, x: 8, y: 4, w: 2, h: 1, sign: "POD 02", reward: "tiny top hat", open: true },
  { id: 3, x: 14, y: 4, w: 2, h: 1, sign: "POD 03", reward: "traffic cone", open: true },
  { id: 4, x: 2, y: 9, w: 2, h: 1, sign: "POD 04", reward: "", open: false, gag: "OUT OF ORDER. HAS BEEN SINCE 2019." },
  { id: 5, x: 8, y: 9, w: 2, h: 1, sign: "POD 05", reward: "", open: false, gag: "A PIGEON IS ASLEEP IN HERE. DO NOT WAKE IT." },
  { id: 6, x: 14, y: 9, w: 2, h: 1, sign: "POD 06", reward: "", open: false, gag: "THIS POD LEADS TO MORE PODS. PLEASE HOLD." },
];

const BILLBOARDS = [
  "SCIENTISTS REVEAL THE SECRET TO $3.40",
  "GRR MONDAYS. (PAYOUT DAY)",
  "HOW MUCH DID THE WINNER GET? ONE WORD: HUMBLING",
  "WELCOME, VALUED ASSET",
];

const PAL = { floor: "#26282a", floor2: "#32363a", wall: "#15161a", tape: "#8f9a3a", pod: "#44484d", podLit: "#FF8B2E", vend: "#4a3b2f", cooler: "#5f7d8c", board: "#15161a", ink: "#ECEAE4", muted: "#A5A29B", skin: "#e8b48f", suit: "#5a5d66", tube: "#d8dcc8" };

export function mountPod(container: HTMLElement, opts: {
  /** Called when the player enters an open pod. Resolve true when the ad completed. Placeholder today. */
  showAd: (pod: { id: number; reward: string }) => Promise<boolean>;
}): () => void {
  const canvas = document.createElement("canvas");
  canvas.style.display = "block"; canvas.style.touchAction = "none"; canvas.style.imageRendering = "pixelated";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d")!;
  const policy = new AdPolicy(browserCountStore("5050.ads"));

  let scale = 1;
  const px = { x: 11 * T, y: 15 * T, tx: 11 * T, ty: 15 * T, face: 1, step: 0 };
  let msg = "WELCOME TO THE LOYALTY CENTER, VALUED ASSET. TAP TO WALK.";
  let msgUntil = Infinity;
  let busy = false;
  let hats: string[] = [];
  try { hats = JSON.parse(localStorage.getItem("5050.hats") || "[]"); } catch {}
  let alive = true;

  function resize() {
    // No floor of 1: on a 375px phone the container is narrower than the map,
    // and refusing to scale down pushed the canvas out past the page gutter.
    const s = Math.min(container.clientWidth / W, container.clientHeight / H);
    scale = s;
    canvas.width = W * s; canvas.height = H * s;
    canvas.style.width = `${W * s}px`; canvas.style.height = `${H * s}px`;
    ctx.imageSmoothingEnabled = false;
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  const tile = (c: number, r: number) => (MAP[r]?.[c] ?? "1");
  const walkable = (x: number, y: number) => {
    const c = Math.floor(x / T), r = Math.floor(y / T);
    const t = tile(c, r);
    return t === "0" || t === "2" || t === "3";
  };

  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (busy) return;
    const rect = canvas.getBoundingClientRect();
    px.tx = ((e.clientX - rect.left) / rect.width) * W;
    px.ty = ((e.clientY - rect.top) / rect.height) * H;
    say("", 0);
  });

  function say(m: string, ms: number) { msg = m; msgUntil = ms ? performance.now() + ms : Infinity; }

  async function enter(p: Pod) {
    if (busy) return;
    busy = true;
    px.tx = px.x; px.ty = px.y + T; // step back out
    if (!p.open) { say(p.gag!, 2600); busy = false; return; }
    // Off-play gate: the run-pacing rules in canOfferRewarded refused the
    // first pod of every session, so nobody has ever seen an ad in here.
    if (!policy.canOfferRewardedOffPlay()) {
      say(`PODS CLOSED FOR THE NIGHT. ${AD_RULES.MAX_REWARDED_PER_DAY} A DAY. COME BACK TOMORROW, ASSET.`, 3000);
      busy = false; return;
    }
    policy.rewardedOffered();
    say(`ENTERING ${p.sign}. THE AD IS 30 SECONDS. THE HAT IS FOREVER.`, 0);
    const ok = await opts.showAd({ id: p.id, reward: p.reward });
    if (ok) {
      policy.rewardedCompleted();
      if (!hats.includes(p.reward)) hats.push(p.reward);
      try { localStorage.setItem("5050.hats", JSON.stringify(hats)); } catch {}
      say(`YOU GOT: ${p.reward.toUpperCase()}. IT DOES NOTHING. THANK YOU FOR YOUR LOYALTY.`, 3500);
    } else {
      say("YOU LEFT EARLY. NO HAT. THE POD UNDERSTANDS.", 2600);
    }
    busy = false;
  }

  let last = 0;
  function loop(now: number) {
    if (document.hidden || canvas.offsetParent === null) { requestAnimationFrame(loop); return; }
    if (!alive) return;
    const dt = Math.min(50, now - last); last = now;
    // walk toward target
    const dx = px.tx - px.x, dy = px.ty - px.y, d = Math.hypot(dx, dy);
    if (d > 1 && !busy) {
      const sp = 0.055 * dt; // slightly too slow, on purpose
      const nx = px.x + (dx / d) * Math.min(sp, d), ny = px.y + (dy / d) * Math.min(sp, d);
      if (walkable(nx, py(px.y))) px.x = nx; else px.tx = px.x;
      if (walkable(px.x, py(ny))) px.y = ny; else px.ty = px.y;
      px.face = dx < 0 ? -1 : 1; px.step += dt;
      // pod door?
      const c = Math.floor(px.x / T), r = Math.floor(py(px.y) / T);
      if (tile(c, r) === "3") { const p = PODS.find((q) => c >= q.x && c < q.x + q.w && r === q.y); if (p) enter(p); }
    }
    draw(now);
    requestAnimationFrame(loop);
  }
  const py = (y: number) => y + 6; // feet

  function draw(now: number) {
    ctx.save(); ctx.scale(scale, scale);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const t = tile(c, r), x = c * T, y = r * T;
      ctx.fillStyle = (c + r) % 2 ? PAL.floor : PAL.floor2; ctx.fillRect(x, y, T, T);
      if (t === "1") { ctx.fillStyle = PAL.wall; ctx.fillRect(x, y, T, T); }
      if (t === "2") { ctx.fillStyle = PAL.tape; ctx.fillRect(x, y + 7, T, 2); }
      if (t === "4") { ctx.fillStyle = PAL.vend; ctx.fillRect(x, y, T, T); ctx.fillStyle = PAL.podLit; ctx.fillRect(x + 4, y + 3, 8, 6); }
      if (t === "5") { ctx.fillStyle = PAL.cooler; ctx.fillRect(x + 4, y + 2, 8, 12); }
      if (t === "6") { ctx.fillStyle = PAL.board; ctx.fillRect(x, y, T, T); }
    }
    // fluorescent tubes
    ctx.fillStyle = PAL.tube; for (let c = 2; c < COLS - 2; c += 6) ctx.fillRect(c * T, 2 * T + 2, 4 * T, 1);
    // billboards text
    ctx.fillStyle = PAL.muted; ctx.font = "6px monospace"; ctx.textAlign = "left";
    ctx.fillText(BILLBOARDS[Math.floor(now / 4000) % BILLBOARDS.length]!, T + 2, T + 10);
    ctx.fillText(BILLBOARDS[(Math.floor(now / 4000) + 2) % BILLBOARDS.length]!, 16 * T + 2, T + 10);
    // pods
    for (const p of PODS) {
      const x = p.x * T, y = p.y * T;
      ctx.fillStyle = PAL.pod; ctx.fillRect(x, y - T, p.w * T, 2 * T);
      ctx.fillStyle = p.open ? PAL.podLit : "#55524c"; ctx.fillRect(x + p.w * T / 2 - 1, y - 8, 2, 2);
      ctx.fillStyle = PAL.ink; ctx.font = "6px monospace"; ctx.textAlign = "center";
      ctx.fillText(p.sign, x + p.w * T / 2, y - 10);
      ctx.fillStyle = PAL.muted; ctx.fillText(p.open ? p.reward.toUpperCase() : "CLOSED", x + p.w * T / 2, y + 12);
    }
    // player
    const bob = Math.floor(px.step / 180) % 2;
    ctx.fillStyle = PAL.suit; ctx.fillRect(px.x - 4, px.y - 6 + bob, 8, 10);
    ctx.fillStyle = PAL.skin; ctx.fillRect(px.x - 3, px.y - 12 + bob, 6, 6);
    ctx.fillStyle = PAL.ink; ctx.fillRect(px.x + (px.face > 0 ? 1 : -2), px.y - 10 + bob, 1, 1);
    if (hats.length) { ctx.fillStyle = PAL.podLit; ctx.fillRect(px.x - 3, px.y - 14 + bob, 6, 2); }
    // message bar
    if (msg && now < msgUntil) {
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.fillRect(0, H - 22, W, 22);
      ctx.fillStyle = PAL.ink; ctx.font = "7px monospace"; ctx.textAlign = "center";
      wrap(ctx, msg, W / 2, H - 13, W - 12, 8);
    }
    ctx.restore();
  }
  requestAnimationFrame(loop);
  return () => { alive = false; ro.disconnect(); canvas.remove(); };
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  const words = text.split(" "); let line = "", lines: string[] = [];
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
