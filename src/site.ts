import { mountGame } from "./games/mount";
import { GAMES } from "./games/registry";
import { mountPod } from "./pod/pod";
import { verify } from "./sim/verify";
import type { Replay } from "./sim/types";

type GameKey = keyof typeof GAMES;
type Section = "games" | "pod" | "shop";

// In production these come from GET /pots and GET /leaderboard/:game on the Worker.
const POTS: Record<GameKey, { cents: number; confirmed: boolean }> = {
  pigeon: { cents: 2500, confirmed: false },
  rent: { cents: 2500, confirmed: false },
  slumlord: { cents: 2500, confirmed: false },
};
const TOP: Record<GameKey, { handle: string; score: number }[]> = { pigeon: [], rent: [], slumlord: [] };

const screen = document.getElementById("screen")!;
const potEl = document.getElementById("pot")!;
const topEl = document.getElementById("top")!;
const emptyEl = document.getElementById("empty")!;
const modeEl = document.getElementById("mode")!;
const sheet = document.getElementById("signin")!;
const podScreen = document.getElementById("podscreen")!;

let current: GameKey = "pigeon";
let mode: "practice" | "ranked" = "practice";
let signedIn = false;
let unmount: (() => void) | null = null;
let podUnmount: (() => void) | null = null;
const best: Record<GameKey, number> = { pigeon: 0, rent: 0, slumlord: 0 };

const fmt = (c: number) => "$" + (c / 100).toFixed(2);

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
  potEl.querySelector(".l")!.textContent = "this week's pot · top score Sunday night takes it";
}

function renderTop() {
  const rows = TOP[current];
  topEl.innerHTML = rows.slice(0, 3).map((r, i) => `<li><span class="rank">${i + 1}</span><span>${r.handle}</span><span class="score">${r.score}</span></li>`).join("");
  if (best[current] > 0 && mode === "practice") topEl.innerHTML += `<li class="you"><span class="rank">you</span><span>practice, not counted</span><span class="score">${best[current]}</span></li>`;
  emptyEl.hidden = rows.length > 0 || best[current] > 0;
}

function onRun(replay: Replay, claimed: number) {
  const r = verify(replay);
  if (r.ok && r.score === claimed && claimed > best[current]) best[current] = claimed;
  // ranked: POST /run/finish with the replay. practice: nothing leaves the device.
  renderTop();
}

function show(g: GameKey) {
  current = g;
  unmount?.();
  unmount = mountGame(screen, GAMES[g], { seed: () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, onRun });
  renderChips(); renderPot(); renderTop();
}

function setMode(m: typeof mode) {
  if (m === "ranked" && !signedIn) { sheet.hidden = false; return; }
  mode = m;
  for (const x of modeEl.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x.dataset.m === m));
  renderTop();
}

document.querySelector(".tabs")!.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLButtonElement>(".tab");
  if (t) show(t.dataset.g as GameKey);
});
modeEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (b) setMode(b.dataset.m as typeof mode);
});
document.querySelector(".nav")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".nav-b");
  if (!b) return;
  const s = b.dataset.s as Section;
  for (const x of document.querySelectorAll<HTMLButtonElement>(".nav-b")) x.setAttribute("aria-selected", String(x === b));
  for (const sec of ["games", "pod", "shop"] as Section[]) document.getElementById("s-" + sec)!.hidden = sec !== s;
  if (s === "pod" && !podUnmount) {
    podScreen.innerHTML = "";
    podUnmount = mountPod(podScreen, {
      // Placeholder until H5 Games Ads is approved: a 5s "ad" countdown over the hall.
      showAd: () => new Promise((res) => {
        const o = document.createElement("div"); o.className = "fakead"; let n = 5;
        o.textContent = `AD PLAYING. ${n}`; podScreen.appendChild(o);
        const t = setInterval(() => { n--; o.textContent = n > 0 ? `AD PLAYING. ${n}` : "AD OVER."; if (n <= 0) { clearInterval(t); setTimeout(() => { o.remove(); res(true); }, 500); } }, 1000);
      }),
    });
  }
});

// sign-in sheet: email magic link via Supabase in production; here it just flips the flag.
sheet.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = (sheet.querySelector("input[type=email]") as HTMLInputElement).value.trim();
  const adult = (sheet.querySelector("input[type=checkbox]") as HTMLInputElement).checked;
  if (!email || !adult) return;
  signedIn = true; sheet.hidden = true;
  document.getElementById("signin-link")!.textContent = email.split("@")[0]!;
  setMode("ranked");
});
sheet.querySelector(".close")!.addEventListener("click", () => { sheet.hidden = true; });
document.getElementById("signin-link")!.addEventListener("click", (e) => { e.preventDefault(); if (!signedIn) sheet.hidden = false; });

// complaints. production: POST /complain on the Worker, which emails play@ via Resend.
const complain = document.getElementById("complain")!;
const COPY = {
  karen: { ph: "I would like to speak to the manager.", go: "Speak to the manager", done: "The manager has been informed. The manager is one guy in PEI. He will read it, probably tonight." },
  chad: { ph: "bro this game is rigged", go: "Send it, king", done: "Sent. Respect. One guy in PEI reads these, usually that night." },
};
const whoNow = () => (complain.querySelector("input[name=who]:checked") as HTMLInputElement).value as keyof typeof COPY;
function paintComplaint() {
  const c = COPY[whoNow()];
  (document.getElementById("cbody") as HTMLTextAreaElement).placeholder = c.ph;
  document.getElementById("cgo")!.textContent = c.go;
}
complain.addEventListener("change", paintComplaint);
complain.addEventListener("submit", (e) => {
  e.preventDefault();
  const done = document.getElementById("cdone")!;
  done.textContent = COPY[whoNow()].done; done.hidden = false;
  (document.getElementById("cbody") as HTMLTextAreaElement).value = "";
});
complain.querySelector(".close")!.addEventListener("click", () => { complain.hidden = true; });
document.getElementById("complain-link")!.addEventListener("click", (e) => { e.preventDefault(); complain.hidden = false; paintComplaint(); });

show("pigeon");
