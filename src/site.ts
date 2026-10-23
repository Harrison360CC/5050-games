import { mountGame } from "./games/mount";
import { GAMES } from "./games/registry";
import { mountPod } from "./pod/pod";
import { verify } from "./sim/verify";
import type { Replay } from "./sim/types";
import { api, getProfile, onSession, setAdult, setHandle, signInWith, signInWithEmail, signOut, type Profile } from "./auth/client";

type GameKey = keyof typeof GAMES;
type Section = "games" | "pod" | "shop";

const POTS: Record<GameKey, { cents: number; confirmed: boolean; loaded: boolean }> = {
  pigeon: { cents: 0, confirmed: false, loaded: false }, rent: { cents: 0, confirmed: false, loaded: false }, slumlord: { cents: 0, confirmed: false, loaded: false },
};
const TOP: Record<GameKey, { handle: string; score: number }[]> = { pigeon: [], rent: [], slumlord: [] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screen = $("screen"), potEl = $("pot"), topEl = $("top"), emptyEl = $("empty"), modeEl = $("mode"), sheet = $<HTMLFormElement>("signin"), podScreen = $("podscreen"), signinLink = $("signin-link"), status = $("status");

let current: GameKey = "pigeon";
let mode: "practice" | "ranked" = "practice";
let profile: Profile | null = null;
let unmount: (() => void) | null = null;
let pod: ReturnType<typeof mountPod> | null = null;
let adCancel: (() => void) | null = null;
let announceT = 0;
let activeRun: { runId: string; seed: number } | null = null;
const best: Record<GameKey, number> = { pigeon: 0, rent: 0, slumlord: 0 };

const fmt = (c: number) => "$" + (c / 100).toFixed(2);

/** Ms until the week closes (Monday 00:00 UTC). The deadline is the reason to
 *  come back before Sunday, so it is on screen rather than buried in the rules. */
function untilWeekEnd(): string {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = end.getUTCDay() || 7;                 // Mon=1..Sun=7
  end.setUTCDate(end.getUTCDate() + (8 - dow));     // next Monday 00:00 UTC
  const ms = end.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h left`;
  if (h >= 1) return `${h}h ${Math.floor((ms % 3600000) / 60000)}m left`;
  return `${Math.max(1, Math.floor(ms / 60000))}m left`;
}

/** Days in a row you have shown up. Kept on the device; no account, no email. */
function bumpStreak(): number {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem("5050.lastDay");
    let n = Number(localStorage.getItem("5050.streak") || 0);
    if (last === today) return n || 1;
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    n = last === y ? n + 1 : 1;
    localStorage.setItem("5050.lastDay", today);
    localStorage.setItem("5050.streak", String(n));
    return n;
  } catch { return 1; }
}
const say = (m: string, ms = 3500) => { status.textContent = m; status.hidden = !m; if (ms) setTimeout(() => { if (status.textContent === m) status.hidden = true; }, ms); };

function renderChips() {
  for (const t of document.querySelectorAll<HTMLButtonElement>(".tab")) {
    const g = t.dataset.g as GameKey;
    t.querySelector(".chip-pot")!.textContent = POTS[g].loaded ? fmt(POTS[g].cents) : "$\u2014.\u2014";
    t.setAttribute("aria-selected", String(g === current));
  }
}
function renderPot() {
  const p = POTS[current];
  const n = potEl.querySelector(".n") as HTMLElement;
  // The markup ships "$—.—" rather than "$0.00". A giant orange $0.00 on every
  // cold load reads as a dead product, and the catch around the fetch meant a
  // failed call left it there permanently. The honest small number is the
  // brand; zero is not. Only a real figure clears the pending state.
  if (p.loaded) { n.textContent = fmt(p.cents); n.removeAttribute("data-state"); }
  // "pot" alone, on a number the rules call an estimate that can move DOWN, is
  // the chrome misleading people the rules were careful not to.
  potEl.querySelector(".l")!.textContent = p.confirmed ? "pot · final" : "pot · estimate";
}
function renderTop() {
  const rows = TOP[current];
  topEl.innerHTML = rows.slice(0, 3).map((r, i) => `<li><span class="rank">${i + 1}</span><span>${esc(r.handle)}</span><span class="score">${r.score}</span></li>`).join("");
  if (best[current] > 0 && mode === "practice") topEl.innerHTML += `<li class="you"><span class="rank">you</span><span>practice, not counted</span><span class="score">${best[current]}</span></li>`;
  emptyEl.hidden = rows.length > 0 || best[current] > 0;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function loadLive() {
  try {
    const p = await api<{ pots: Record<string, { est_pot_cents: number; confirmed: boolean }> }>("/pots");
    for (const g of Object.keys(POTS) as GameKey[]) { const x = p.pots[g]; if (x) POTS[g] = { cents: x.est_pot_cents, confirmed: x.confirmed, loaded: true }; }
  } catch {}
  try {
    const lb = await api<{ rows: { handle: string; score: number }[] }>("/leaderboard/" + current);
    TOP[current] = lb.rows;
  } catch {}
  renderChips(); renderPot(); renderTop();
}

// ---- runs ----
// Each ranked run gets its own server-issued seed + runId. We prefetch one so
// the next run starts instantly, but the ACTIVE run is only set when a seed is
// actually handed to the game (seed()), never when the prefetch returns.
type SeedEntry = { runId: string | null; seed: number };
const seedCache: SeedEntry[] = [];
let pendingSeed: Promise<void> | null = null;
const randomSeed = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

async function fetchSeed(): Promise<SeedEntry> {
  if (mode === "ranked" && profile) {
    try {
      const r = await api<{ runId: string; seed: number; course?: number }>("/run/start", { game: current });
      if (r.course) say(`ranked course ${r.course}. everyone gets the same one.`, 2500);
      return { runId: r.runId, seed: r.seed };
    } catch (e) {
      say(`ranked unavailable: ${(e as Error).message}. playing practice.`);
      setMode("practice");
    }
  }
  return { runId: null, seed: randomSeed() };
}
async function refillSeed() {
  if (pendingSeed || seedCache.length) return;
  pendingSeed = fetchSeed().then((e) => { seedCache.push(e); }).finally(() => { pendingSeed = null; });
  await pendingSeed;
}
function takeSeed(): number {
  const e = seedCache.shift() ?? { runId: null, seed: randomSeed() };
  activeRun = e.runId ? { runId: e.runId, seed: e.seed } : null;
  void refillSeed();
  return e.seed;
}

/** Unsent ranked runs, kept on disk until the server confirms them. A dropped
 *  connection used to lose the run outright: it existed only in memory. */
const OUTBOX = "5050.outbox";
type Pending = { runId: string; replay: Replay };
const outbox = (): Pending[] => { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } };
const setOutbox = (v: Pending[]) => { try { localStorage.setItem(OUTBOX, JSON.stringify(v.slice(-20))); } catch {} };

async function submitRun(p: Pending): Promise<boolean> {
  try {
    const res = await api<{ ok: boolean; score?: number; reason?: string }>("/run/finish", p);
    if (res.ok) { say(`ranked: ${res.score} verified.`); await loadLive(); }
    else say(`ranked run rejected: ${res.reason}`);
    return true; // the server answered, so stop holding on to it either way
  } catch (e) {
    const m = (e as Error).message || "";
    // A refusal is an answer; only a transport failure is worth retrying.
    if (/rejected|already|expired|boundary|bad run id|faster/i.test(m)) { say(`ranked run rejected: ${m}`); return true; }
    say("couldn't reach the server. holding your run and retrying.", 6000);
    return false;
  }
}
async function flushOutbox() {
  const q = outbox();
  if (!q.length) return;
  const left: Pending[] = [];
  for (const p of q) if (!(await submitRun(p))) left.push(p);
  setOutbox(left);
}

async function onRun(replay: Replay, claimed: number) {
  const r = verify(replay);
  offerShare(claimed);
  if (r.ok && r.score === claimed && claimed > best[current]) best[current] = claimed;
  if (activeRun && replay.seed === activeRun.seed) {
    const run = activeRun; activeRun = null;
    const p: Pending = { runId: run.runId, replay };
    setOutbox([...outbox(), p]);
    if (await submitRun(p)) setOutbox(outbox().filter((x) => x.runId !== p.runId));
  } else if (mode === "ranked") {
    say("that run wasn't ranked (no server seed). next one is.");
  }
  renderTop();
}

function show(g: GameKey) {
  current = g;
  unmount?.();
  seedCache.length = 0; activeRun = null;
  shareBtn.hidden = true;
  document.body.classList.remove("playing");
  unmount = mountGame(screen, GAMES[g], {
    seed: takeSeed,
    onRun,
    target: () => {
      const rows = TOP[current];
      const me = profile ? rows.findIndex((r) => r.handle === profile!.handle) : -1;
      return {
        score: rows[0]?.score ?? 0,
        handle: rows[0]?.handle ?? "",
        ranked: mode === "ranked",
        rank: me >= 0 ? me + 1 : undefined,
        closes: untilWeekEnd().replace(" left", ""),
      };
    },
    ready: () => mode !== "ranked" || seedCache.length > 0 || activeRun !== null,
    onStart: () => document.body.classList.add("playing"),
  });
  void refillSeed();
  renderChips(); renderPot(); renderTop();
  void loadLive();
}

function paintMode() {
  for (const x of modeEl.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.m === mode));
}
/**
 * Any sheet opened while the game is full-bleed drops you back to the normal
 * page first. A modal over an edge-to-edge canvas has nothing behind it to
 * orient you, and on mobile it read as the Ranked button being broken.
 */
function openSheet(prep?: () => void) {
  document.body.classList.remove("playing");
  prep?.();
  sheet.hidden = false;
}
function setMode(m: typeof mode) {
  // Open the sheet but leave the toggle showing the mode you are ACTUALLY in,
  // otherwise pressing Ranked looks like a button that did nothing.
  if (m === "ranked" && !profile) { openSheet(); paintMode(); return; }
  if (m === "ranked" && profile && !profile.is_adult) { openSheet(showAdultStep); paintMode(); return; }
  mode = m;
  seedCache.length = 0; activeRun = null; void refillSeed();
  paintMode();
  renderTop();
}

// ---- auth ui ----
function showAdultStep() {
  sheet.querySelector(".step-login")!.setAttribute("hidden", "");
  sheet.querySelector(".step-adult")!.removeAttribute("hidden");
}
function showLoginStep() {
  sheet.querySelector(".step-login")!.removeAttribute("hidden");
  sheet.querySelector(".step-adult")!.setAttribute("hidden", "");
}
onSession(async () => {
  profile = await getProfile();
  // Apply the age confirmation they already gave before the provider hop.
  if (profile && !profile.is_adult) {
    let pre = false;
    try { pre = localStorage.getItem("5050.adult") === "1"; } catch {}
    if (pre) { await setAdult(); profile = await getProfile(); }
  }
  signinLink.textContent = profile ? profile.handle : "sign in";
  if (profile && !profile.is_adult && !sheet.hidden) showAdultStep();
  if (profile?.is_adult && !sheet.hidden) { sheet.hidden = true; setMode("ranked"); }
});
/** Age is confirmed BEFORE the provider hop, so nobody comes back from Google
 *  to a second form. The box is remembered and applied once the session lands. */
const adultPre = sheet.querySelector("#adult-pre") as HTMLInputElement;
const gateMsg = sheet.querySelector("#gate-msg") as HTMLElement;
function gateOk(): boolean {
  if (adultPre.checked) { try { localStorage.setItem("5050.adult", "1"); } catch {} gateMsg.hidden = true; return true; }
  // Not say(). The toast lives in the page behind a fixed, scrimmed sheet, so
  // this explanation rendered under the dimming layer half a screen above the
  // button that was just pressed, and the most important control in the
  // product read as a dead button.
  gateMsg.textContent = "Tick the 18+ box first. It's the one rule we can't bend.";
  gateMsg.hidden = false;
  adultPre.focus();
  return false;
}
sheet.querySelector("#g-google")!.addEventListener("click", () => { if (gateOk()) signInWith("google").catch((e) => say(e.message)); });
sheet.querySelector("#g-discord")!.addEventListener("click", () => { if (gateOk()) signInWith("discord").catch((e) => say(e.message)); });
sheet.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (sheet.querySelector("#email") as HTMLInputElement).value.trim();
  if (!email) return;
  if (!gateOk()) return;
  try { await signInWithEmail(email); say("link sent. check your email, then come back here.", 8000); sheet.hidden = true; }
  catch (err) { say((err as Error).message); }
});
sheet.querySelector("#adult-ok")!.addEventListener("click", async () => {
  const cb = sheet.querySelector("#adult") as HTMLInputElement;
  if (!cb.checked) return;
  await setAdult(); profile = await getProfile();
  sheet.hidden = true; showLoginStep(); setMode("ranked");
});
sheet.querySelector(".close")!.addEventListener("click", () => { sheet.hidden = true; showLoginStep(); });
const account = $<HTMLFormElement>("account");
const nick = account.querySelector("#nick") as HTMLInputElement;
signinLink.addEventListener("click", (e) => {
  e.preventDefault();
  if (!profile) { openSheet(); return; }
  const locked = profile.handle_locked;
  nick.value = profile.handle; nick.disabled = locked; $("nick-save").hidden = locked;
  $("nick-h").textContent = locked ? `You are ${profile.handle}.` : "Your nickname.";
  $("nick-p").textContent = locked ? "That's locked in. One per customer, no changes. Complain if you must." : "Picked at random so nobody's real name ends up on a leaderboard. You get one change, ever, so pick well. Letters, numbers, underscores, 3 to 20.";
  account.hidden = false; if (!locked) nick.focus();
});
account.addEventListener("submit", async (e) => {
  e.preventDefault();
  const want = nick.value.trim();
  if (want === profile?.handle) { account.hidden = true; return; }
  const err = await setHandle(want);
  if (err) { say(err); return; }
  profile = await getProfile(); signinLink.textContent = profile?.handle ?? "sign in";
  account.hidden = true; say(`you are now ${want}.`); void loadLive();
});
account.querySelector("#signout")!.addEventListener("click", async () => {
  await signOut(); profile = null; signinLink.textContent = "sign in"; account.hidden = true; setMode("practice");
});
account.querySelector(".close")!.addEventListener("click", () => { account.hidden = true; });

/**
 * Sound and haptics toggles. Haptics are disabled outright on any device with
 * no navigator.vibrate, which is every iPhone: there is no web haptics API on
 * iOS, so offering a switch that cannot do anything would be a lie.
 */
function paintFx() {
  if (!pod) return;
  const sb = $("fx-sound"), hb = $("fx-haptics");
  sb.setAttribute("aria-pressed", String(pod.fx.prefs.sound));
  sb.textContent = `SOUND: ${pod.fx.prefs.sound ? "ON" : "OFF"}`;
  if (!pod.hasHaptics) {
    (hb as HTMLButtonElement).disabled = true;
    hb.removeAttribute("aria-pressed");
    hb.textContent = "HAPTICS: N/A";
    hb.setAttribute("aria-label", "Haptics unavailable: this browser has no vibration API");
    return;
  }
  hb.setAttribute("aria-pressed", String(pod.fx.prefs.haptics));
  hb.textContent = `HAPTICS: ${pod.fx.prefs.haptics ? "ON" : "OFF"}`;
}
$("fx-sound").addEventListener("click", () => { if (!pod) return; pod.fx.unlock(); pod.fx.setSound(!pod.fx.prefs.sound); if (pod.fx.prefs.sound) { pod.fx.hum(true); pod.fx.tick(); } paintFx(); });
$("fx-haptics").addEventListener("click", () => { if (!pod) return; pod.fx.setHaptics(!pod.fx.prefs.haptics); if (pod.fx.prefs.haptics) pod.fx.buzz(25); paintFx(); });

// ---- nav ----
document.querySelector(".tabs")!.addEventListener("click", (e) => { const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab"); if (t) show(t.dataset.g as GameKey); });
modeEl.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (b) setMode(b.dataset.m as typeof mode); });
document.querySelector(".nav")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".nav-b");
  if (!b) return;
  const s = b.dataset.s as Section;
  for (const x of document.querySelectorAll<HTMLButtonElement>(".nav-b")) x.setAttribute("aria-selected", String(x === b));
  for (const sec of ["games", "pod", "shop"] as Section[]) $("s-" + sec).hidden = sec !== s;
  if (s === "pod" && !pod) {
    podScreen.innerHTML = "";
    const line = $("pod-say");
    pod = mountPod(podScreen, {
      say: (m) => {
        line.textContent = m;
        // Debounced. A polite live region queues, so eight hat-cycle taps in
        // 1.4s produced roughly 30 seconds of uninterruptible speech. A burst
        // now collapses to one announcement of the final state.
        clearTimeout(announceT);
        announceT = window.setTimeout(() => { $("pod-announce").textContent = m; }, 700);
      },
      // The placeholder used to own nothing: leaving the tab mid-advert left
      // its setInterval running, so seven seconds later, sitting on GAMES, you
      // had been granted the hat and charged one of three daily views for an
      // advert nobody watched. Resolving "completed" without the network's own
      // callback is also precisely what gets a publisher flagged, and this
      // shape is what the real AdSense unit will be dropped into.
      showAd: () => {
        const o = document.createElement("div"); o.className = "fakead"; let n = 5;
        o.textContent = `AD PLAYING. ${n}`; podScreen.appendChild(o);
        let settle: (v: boolean) => void = () => {};
        let t = 0, done = 0;
        const stop = (ok: boolean) => { clearInterval(t); clearTimeout(done); o.remove(); settle(ok); };
        const promise = new Promise<boolean>((res) => {
          settle = res;
          t = window.setInterval(() => {
            n--; o.textContent = n > 0 ? `AD PLAYING. ${n}` : "AD OVER.";
            if (n <= 0) { clearInterval(t); done = window.setTimeout(() => stop(true), 500); }
          }, 1000);
        });
        adCancel = () => stop(false);
        void promise.then(() => { adCancel = null; });
        return promise;
      },
    });
    paintFx();
  }
  // The pod runs a render loop and an AudioContext. Leaving it mounted behind a
  // hidden section is how the old build leaked a permanent rAF chain per visit.
  if (s !== "pod" && pod) { adCancel?.(); adCancel = null; pod.destroy(); pod = null; }
  // Leaving the Games tab never unmounted the game, so mountGame's loop kept
  // running at 60Hz behind a hidden section -- stepping physics for a game
  // nobody was playing and reading canvas.offsetParent every frame, which
  // turns into a forced synchronous layout the moment anything else dirties
  // the DOM. That is the exact bug the pod rewrite was meant to end, sitting
  // in the surface NEXT to it.
  if (s !== "games") { unmount?.(); unmount = null; }
  else if (!unmount) show(current);
});

// ---- complaints ----
const complain = $<HTMLFormElement>("complain");
const COPY = {
  karen: { ph: "I would like to speak to the manager.", go: "Speak to the manager", done: "The manager has been informed. The manager is one guy in PEI. He will read it, probably tonight." },
  chad: { ph: "bro this game is rigged", go: "Send it, king", done: "Sent. Respect. One guy in PEI reads these, usually that night." },
};
const whoNow = () => (complain.querySelector("input[name=who]:checked") as HTMLInputElement).value as keyof typeof COPY;
function paintComplaint() { const c = COPY[whoNow()]; (complain.querySelector("#cbody") as HTMLTextAreaElement).placeholder = c.ph; $("cgo").textContent = c.go; }
complain.addEventListener("change", paintComplaint);
complain.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (complain.querySelector("#cemail") as HTMLInputElement).value.trim();
  const body = (complain.querySelector("#cbody") as HTMLTextAreaElement).value.trim();
  try { await api("/complain", { who: whoNow(), email, body }); } catch {}
  const done = $("cdone"); done.textContent = COPY[whoNow()].done; done.hidden = false;
  (complain.querySelector("#cbody") as HTMLTextAreaElement).value = "";
});
complain.querySelector(".close")!.addEventListener("click", () => { complain.hidden = true; });
$("complain-link").addEventListener("click", (e) => { e.preventDefault(); complain.hidden = false; paintComplaint(); });

const shareBtn = $<HTMLButtonElement>("share");
/** The only distribution channel here is somebody's group chat. */
function offerShare(score: number) {
  if (score <= 0) { shareBtn.hidden = true; return; }
  const name = ({ pigeon: "Drunk Pigeon", rent: "Rent's Due", slumlord: "Slumlord" } as Record<string, string>)[current] ?? current;
  const text = `${score} on ${name}. ${mode === "ranked" ? "beat me before Sunday" : "beat that"}: play5050games.com`;
  shareBtn.textContent = `share your ${score}`;
  shareBtn.hidden = false;
  shareBtn.onclick = async () => {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      say("copied. go ruin someone's evening.");
    } catch { /* they changed their mind, which is allowed */ }
  };
}

$("exit").addEventListener("click", () => document.body.classList.remove("playing"));

// Sheets had exactly one exit: a 25x28 close button that, with a soft keyboard
// up on a small phone, was pushed off the top of the screen along with the
// heading. A backdrop tap and Escape are the two things every user already
// tries, and neither did anything.
for (const id of ["signin", "account", "complain"]) {
  const el = document.getElementById(id);
  el?.addEventListener("pointerdown", (e) => { if (e.target === el) el.hidden = true; });
}
window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = document.querySelector<HTMLElement>(".sheet:not([hidden])");
  if (open) { open.hidden = true; e.preventDefault(); }
});

const streak = bumpStreak();
function paintMeta() {
  const el = document.getElementById("potline");
  if (el) el.innerHTML = `<b>${untilWeekEnd()}</b> · top score takes the pot${streak > 1 ? ` · <b>day ${streak}</b> in a row` : ""}<br><a href="/rules">how it works</a> · <a href="/ledger">every payout, ever</a>`;
  const wk = document.getElementById("wk");
  if (wk) wk.textContent = untilWeekEnd();
}
paintMeta();
setInterval(paintMeta, 60000);

show("pigeon");
void flushOutbox();
window.addEventListener("online", () => void flushOutbox());
window.addEventListener("pageshow", (e) => { if ((e as PageTransitionEvent).persisted) { void loadLive(); void flushOutbox(); paintMeta(); } });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { void flushOutbox(); paintMeta(); } });
