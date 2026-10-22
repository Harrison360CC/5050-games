import { mountGame } from "./games/mount";
import { GAMES } from "./games/registry";
import { mountPod } from "./pod/pod";
import { verify } from "./sim/verify";
import type { Replay } from "./sim/types";
import { api, getProfile, onSession, setAdult, signInWith, signInWithEmail, signOut, type Profile } from "./auth/client";

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
  potEl.querySelector(".n")!.innerHTML = `${fmt(p.cents)}<small>${p.confirmed ? "confirmed" : "est."}</small>`;
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
async function seedForRun(): Promise<number> {
  if (mode === "ranked" && profile) {
    try {
      const r = await api<{ runId: string; seed: number }>("/run/start", { game: current });
      activeRun = r; return r.seed;
    } catch (e) {
      say(`ranked unavailable: ${(e as Error).message}. playing practice.`);
      setMode("practice");
    }
  }
  activeRun = null;
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

async function onRun(replay: Replay, claimed: number) {
  const r = verify(replay);
  if (r.ok && r.score === claimed && claimed > best[current]) best[current] = claimed;
  if (activeRun && replay.seed === activeRun.seed) {
    const run = activeRun; activeRun = null;
    try {
      const res = await api<{ ok: boolean; score?: number; reason?: string }>("/run/finish", { runId: run.runId, replay });
      if (res.ok) { say(`ranked: ${res.score} verified.`); await loadLive(); }
      else say(`ranked run rejected: ${res.reason}`);
    } catch (e) { say(`couldn't submit: ${(e as Error).message}`); }
  }
  renderTop();
}

// seed is requested lazily: mountGame calls seed() per run, so we pre-fetch for ranked
let pendingSeed: Promise<number> | null = null;
function show(g: GameKey) {
  current = g;
  unmount?.();
  pendingSeed = null;
  unmount = mountGame(screen, GAMES[g], {
    seed: () => { const s = seedCache.shift(); void refillSeed(); return s ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0); },
    onRun,
  });
  void refillSeed();
  renderChips(); renderPot(); renderTop();
  void loadLive();
}
const seedCache: number[] = [];
async function refillSeed() {
  if (pendingSeed || seedCache.length) return;
  pendingSeed = seedForRun();
  seedCache.push(await pendingSeed);
  pendingSeed = null;
}

function setMode(m: typeof mode) {
  if (m === "ranked" && !profile) { sheet.hidden = false; return; }
  if (m === "ranked" && profile && !profile.is_adult) { sheet.hidden = false; showAdultStep(); return; }
  mode = m;
  seedCache.length = 0; void refillSeed();
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
signinLink.addEventListener("click", async (e) => {
  e.preventDefault();
  if (!profile) { sheet.hidden = false; return; }
  if (confirmOut()) { await signOut(); profile = null; signinLink.textContent = "sign in"; setMode("practice"); }
});
const confirmOut = () => { const t = signinLink.dataset.armed; if (t) { delete signinLink.dataset.armed; return true; } signinLink.dataset.armed = "1"; say("tap your name again to sign out.", 2500); setTimeout(() => delete signinLink.dataset.armed, 2500); return false; };

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

show("pigeon");
