import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/shots2/";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

const pots = { week: "2026-W44", pots: {
  pigeon: { seed_cents: 169, ads_cents: 241, merch_cents: 0, rollover_cents: 680, est_pot_cents: 1090, confirmed: false },
  rent:   { seed_cents: 169, ads_cents: 88,  merch_cents: 412, rollover_cents: 0, est_pot_cents: 669, confirmed: false },
  slumlord:{seed_cents: 169, ads_cents: 31,  merch_cents: 0, rollover_cents: 0, est_pot_cents: 200, confirmed: false } },
  entries: [
    { date:"2026-10-22", game:"all", kind:"note", cents:0, note:"Site went live. AdSense review requested." },
    { date:"2026-10-23", game:"pigeon", kind:"ads", cents:482, note:"" },
    { date:"2026-10-24", game:"rent", kind:"merch", cents:824, note:"2 mugs" },
    { date:"2026-10-25", game:"pigeon", kind:"rollover", cents:680, note:"wk43 unclaimed" },
    { date:"2026-10-26", game:"slumlord", kind:"payout", cents:340, note:"paid @gravel_dad" },
    { date:"2026-10-26", game:"all", kind:"seed", cents:507, note:"" } ] };
const lb = (g) => ({ week:"2026-W44", rows: [
  { handle:"gravel_dad", score: g==="pigeon"?47:g==="rent"?31:22, finished_at:"2026-10-26T10:00:00Z" },
  { handle:"wet_toast_91", score: g==="pigeon"?44:g==="rent"?29:19, finished_at:"2026-10-26T11:00:00Z" },
  { handle:"anna_from_hr", score: g==="pigeon"?38:g==="rent"?24:17, finished_at:"2026-10-26T12:00:00Z" },
  { handle:"zzz", score: 3, finished_at:"2026-10-26T13:00:00Z" } ] });
const plays = { week:"2026-W44", plays: [
  { game:"pigeon", score:47, at:new Date(Date.now()-120000).toISOString(), handle:"gravel_dad", rank:1 },
  { game:"rent", score:29, at:new Date(Date.now()-3600000).toISOString(), handle:"wet_toast_91", rank:2 },
  { game:"slumlord", score:17, at:new Date(Date.now()-7200000).toISOString(), handle:"anna_from_hr", rank:3 },
  { game:"pigeon", score:3, at:new Date(Date.now()-86400000).toISOString(), handle:"zzz", rank:null } ] };

for (const cs of ["dark","light"]) {
  const c = await b.newContext({ viewport:{width:393,height:852}, colorScheme: cs, deviceScaleFactor:2 });
  await c.route("**/api/pots", r => r.fulfill({ json: pots }));
  await c.route("**/api/plays", r => r.fulfill({ json: plays }));
  await c.route("**/api/leaderboard/*", r => r.fulfill({ json: lb(r.request().url().split("/").pop()) }));
  const p = await c.newPage();
  await p.goto("file:///home/claude/5050-games/dist/index.html"); await p.waitForTimeout(1600);
  await p.screenshot({ path: `${OUT}${cs}-app-populated.png`, fullPage: true });
  await p.goto("file:///home/claude/5050-games/dist/ledger.html"); await p.waitForTimeout(1400);
  await p.screenshot({ path: `${OUT}${cs}-ledger-populated.png`, fullPage: true });
  await p.goto("file:///home/claude/5050-games/dist/rules.html"); await p.waitForTimeout(1000);
  await p.screenshot({ path: `${OUT}${cs}-rules-top.png` });
  await c.close();
}
await b.close(); console.log("ok");
