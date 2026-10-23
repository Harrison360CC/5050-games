import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(800);
// play a bit, then measure frame intervals
for (let i = 0; i < 6; i++) { await p.tap("#screen canvas"); await p.waitForTimeout(250); }
const r = await p.evaluate(() => new Promise(res => {
  const ts = []; let n = 0;
  const f = (t) => { ts.push(t); if (++n < 120) requestAnimationFrame(f); else {
    const d = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
    res({ frames: d.length, p50: +d[Math.floor(d.length/2)].toFixed(2), p95: +d[Math.floor(d.length*0.95)].toFixed(2), max: +d[d.length-1].toFixed(2),
          mem: performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : null });
  }};
  requestAnimationFrame(f);
}));
console.log("frame intervals ms:", JSON.stringify(r));
await b.close();
