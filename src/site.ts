import { mountGame } from "./games/mount";
import { GAMES } from "./games/registry";
import { mountPod } from "./pod/pod";
import { verify } from "./sim/verify";
import type { Replay } from "./sim/types";
import { api, getProfile, onSession, setAdult, setHandle, signInWith, signInWithEmail, signOut, type Profile } from "./auth/client";

type GameKey = keyof typeof GAMES;
type Section = "games" | "pod" | "shop";

const POTS: Record<GameKey, { cents: number; confirmed: boolean }> = {
  pigeon: { cents: 0, confirmed: false }, rent: { cents: 0, confirmed: false }, slumlord: { cents: 0, confirmed: false },
};
const TOP: Record<GameKey, { handle: string; score: number }[]> = { pigeon: [], rent: [], slumlord: [] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const screen = $("screen"), potEl = $("pot"), topEl = $("top"), emptyEl = $("empty"), modeEl = $("mode"), sheet = $<HTMLFormElement>("signin"), podScreen = $("podscreen"), signinLink = $("signin-link"), status = $("status");

let current: GameKey = "pigeon";
let mode: "practice" | "ranked" = "practice";
let profile: Profile | null = null;
let unmount: (() => void) | null = null;
let podUnmount: (() => void) | null = null;
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
    t.querySelector(".chip-pot")!.textContent = fmt(POTS[g].cents);
    t.setAttribute("aria-selected", String(g === current));
  }
}
function renderPot() {
  const p = POTS[current];
  potEl.querySelector(".n")!.textContent = fmt(p.cents);
  potEl.querySelector(".l")!.textContent = p.confirmed ? "pot · confirmed" : "pot";
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
    for (const g of Object.keys(POTS) as GameKey[]) { const x = p.pots[g]; if (x) POTS[g] = { cents: x.est_pot_cents, confirmed: x.confirmed }; }
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
  unmount = mountGame(screen, GAMES[g], {
    seed: takeSeed,
    onRun,
    target: () => ({ score: TOP[current][0]?.score ?? 0, handle: TOP[current][0]?.handle ?? "", ranked: mode === "ranked" }),
    ready: () => mode !== "ranked" || seedCache.length > 0 || activeRun !== null,
  });
  void refillSeed();
  renderChips(); renderPot(); renderTop();
  void loadLive();
}

function setMode(m: typeof mode) {
  if (m === "ranked" && !profile) { sheet.hidden = false; return; }
  if (m === "ranked" && profile && !profile.is_adult) { sheet.hidden = false; showAdultStep(); return; }
  mode = m;
  seedCache.length = 0; activeRun = null; void refillSeed();
  for (const x of modeEl.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.m === m));
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
  signinLink.textContent = profile ? profile.handle : "sign in";
  if (profile && !profile.is_adult && !sheet.hidden) showAdultStep();
  if (profile?.is_adult && !sheet.hidden) { sheet.hidden = true; setMode("ranked"); }
});
sheet.querySelector("#g-google")!.addEventListener("click", () => signInWith("google").catch((e) => say(e.message)));
sheet.querySelector("#g-discord")!.addEventListener("click", () => signInWith("discord").catch((e) => say(e.message)));
sheet.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = (sheet.querySelector("#email") as HTMLInputElement).value.trim();
  if (!email) return;
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
  if (!profile) { sheet.hidden = false; return; }
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

// ---- nav ----
document.querySelector(".tabs")!.addEventListener("click", (e) => { const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab"); if (t) show(t.dataset.g as GameKey); });
modeEl.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (b) setMode(b.dataset.m as typeof mode); });
document.querySelector(".nav")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".nav-b");
  if (!b) return;
  const s = b.dataset.s as Section;
  for (const x of document.querySelectorAll<HTMLButtonElement>(".nav-b")) x.setAttribute("aria-selected", String(x === b));
  for (const sec of ["games", "pod", "shop"] as Section[]) $("s-" + sec).hidden = sec !== s;
  if (s === "pod" && !podUnmount) {
    podScreen.innerHTML = "";
    podUnmount = mountPod(podScreen, {
      showAd: () => new Promise((res) => {
        const o = document.createElement("div"); o.className = "fakead"; let n = 5;
        o.textContent = `AD PLAYING. ${n}`; podScreen.appendChild(o);
        const t = setInterval(() => { n--; o.textContent = n > 0 ? `AD PLAYING. ${n}` : "AD OVER."; if (n <= 0) { clearInterval(t); setTimeout(() => { o.remove(); res(true); }, 500); } }, 1000);
      }),
    });
  }
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

const streak = bumpStreak();
function paintMeta() {
  const el = document.getElementById("potline");
  if (el) el.innerHTML = `<b>${untilWeekEnd()}</b> · top score when the week closes takes the pot${streak > 1 ? ` · <b>day ${streak}</b> in a row` : ""} · <a href="/rules">how it works</a>`;
  const wk = document.getElementById("wk");
  if (wk) wk.textContent = untilWeekEnd();
}
paintMeta();
setInterval(paintMeta, 60000);

show("pigeon");
void flushOutbox();
window.addEventListener("online", () => void flushOutbox());
