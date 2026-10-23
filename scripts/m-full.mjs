import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [n, w, h] of [["se", 375, 667], ["i15", 393, 852], ["droid", 360, 740]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.goto("file:///home/claude/5050-games/dist/index.html");
  await p.waitForTimeout(800);
  await p.tap("#screen canvas"); await p.waitForTimeout(500);
  const m = await p.evaluate(() => { const c = document.querySelector("#screen canvas"); return { w: c.clientWidth, h: c.clientHeight, pct: Math.round(100 * (c.clientWidth * c.clientHeight) / (innerWidth * innerHeight)) }; });
  console.log(n, JSON.stringify(m));
  await p.screenshot({ path: `${out}full-${n}.png` });
  await ctx.close();
}
await b.close();
