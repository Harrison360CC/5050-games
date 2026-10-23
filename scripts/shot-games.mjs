import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 400, height: 760 }, deviceScaleFactor: 2 });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(900);
// pigeon: flap at a steady rhythm so we see sway + columns
for (let i = 0; i < 14; i++) { await p.click("#screen canvas"); await p.waitForTimeout(260); }
await p.screenshot({ path: out + "g-pigeon.png" });
await p.click('.tab[data-g="rent"]'); await p.waitForTimeout(400);
for (let i = 0; i < 10; i++) { await p.click("#screen canvas"); await p.waitForTimeout(600); }
await p.screenshot({ path: out + "g-rent.png" });
await p.click('.tab[data-g="slumlord"]'); await p.waitForTimeout(400);
for (let i = 0; i < 7; i++) { await p.click("#screen canvas"); await p.waitForTimeout(520); }
await p.screenshot({ path: out + "g-slum.png" });
console.log("errors:", errs);
await b.close();
