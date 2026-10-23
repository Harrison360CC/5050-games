import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
const p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html"); await p.waitForTimeout(800);
await p.tap('.tab[data-g="slumlord"]'); await p.waitForTimeout(400);
for (let i = 0; i < 9; i++) { await p.tap("#screen canvas"); await p.waitForTimeout(430); }
await p.screenshot({ path: out + "slum-sky.png" });
await b.close();
