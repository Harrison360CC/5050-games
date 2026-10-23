import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [name, w, h, dpr] of [["se", 375, 667, 2], ["i15", 393, 852, 3]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", e => errs.push(String(e)));
  await p.goto("file:///home/claude/5050-games/dist/index.html");
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}m-${name}-fold.png` });
  // scroll to see what's below
  await p.evaluate(() => window.scrollTo(0, 9999));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}m-${name}-bottom.png` });
  const m = await p.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
    canvas: (() => { const c = document.querySelector("#screen canvas"); return c ? { w: c.clientWidth, h: c.clientHeight, bw: c.width, bh: c.height } : null; })(),
    screenBox: (() => { const s = document.getElementById("screen"); const r = s.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })(),
  }));
  console.log(name, JSON.stringify(m), "errors:", errs.length);
  await ctx.close();
}
await b.close();
