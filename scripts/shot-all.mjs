import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const errs = []; p.on("pageerror", e => errs.push(String(e)));
await p.goto("file:///home/claude/5050/dist/index.html"); await p.waitForTimeout(800);
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
// rent: tap a few times
await p.click('.tab[data-g="rent"]'); await p.waitForTimeout(300);
for (let i = 0; i < 6; i++) { await p.click("#screen canvas"); await p.waitForTimeout(400); }
await p.screenshot({ path: out + "rent.png" });
await p.click('.tab[data-g="slumlord"]'); await p.waitForTimeout(300);
for (let i = 0; i < 5; i++) { await p.click("#screen canvas"); await p.waitForTimeout(500); }
await p.screenshot({ path: out + "slum.png" });
await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(600);
await p.screenshot({ path: out + "pod.png" });
await p.click('.nav-b[data-s="games"]'); await p.click('.mode button[data-m="ranked"]'); await p.waitForTimeout(300);
await p.screenshot({ path: out + "signin.png" });
await p.click('#signin .close'); await p.click('#complain-link'); await p.waitForTimeout(300);
await p.screenshot({ path: out + "complain.png" });
console.log("errors:", errs);
await b.close();
