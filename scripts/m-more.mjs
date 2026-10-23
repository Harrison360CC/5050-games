import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
// below the fold, portrait
let ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
let p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html"); await p.waitForTimeout(800);
await p.evaluate(() => window.scrollTo(0, 9999)); await p.waitForTimeout(300);
await p.screenshot({ path: out + "below.png" });
console.log("board header wraps:", await p.evaluate(() => { const h = document.querySelector(".board h2"); return h ? h.getBoundingClientRect().height : null; }));
await ctx.close();
// landscape
ctx = await b.newContext({ viewport: { width: 740, height: 360 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html"); await p.waitForTimeout(800);
await p.screenshot({ path: out + "land.png" });
console.log("landscape canvas:", await p.evaluate(() => { const c = document.querySelector("#screen canvas"); return c ? `${c.clientWidth}x${c.clientHeight}` : null; }));
await p.tap("#screen canvas"); await p.waitForTimeout(500);
console.log("landscape full-bleed:", await p.evaluate(() => { const c = document.querySelector("#screen canvas"); return c ? `${c.clientWidth}x${c.clientHeight}` : null; }));
await p.screenshot({ path: out + "land-play.png" });
await b.close();
