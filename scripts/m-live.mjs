import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(1500);
console.log("pot:", await p.textContent(".potbar .n"));
console.log("potline:", (await p.textContent("#potline")).replace(/\s+/g, " ").trim());
await p.screenshot({ path: out + "live-1.png" });
// play a short run in practice so the death card shows
for (let i = 0; i < 8; i++) { await p.tap("#screen canvas"); await p.waitForTimeout(260); }
await p.waitForTimeout(2500);
await p.screenshot({ path: out + "live-death.png" });
console.log("share visible:", await p.isVisible("#share"), "| label:", await p.textContent("#share").catch(() => "-"));
// ranked toggle: sheet should open AND the toggle should still show practice
await p.tap('.mode button[data-m="ranked"]');
await p.waitForTimeout(600);
console.log("sheet open:", await p.isVisible("#signin"),
  "| practice pressed:", await p.getAttribute('.mode button[data-m="practice"]', "aria-pressed"),
  "| adult box present:", await p.isVisible("#adult-pre"));
await p.screenshot({ path: out + "live-sheet.png" });
console.log("errors:", errs);
await b.close();
