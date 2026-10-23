import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(800);
// expose the replay the client would send
await p.evaluate(() => { window.__caught = null; });
await p.addInitScript(() => {});
// play with human-ish irregular timing until death
for (let i = 0; i < 40; i++) {
  await p.tap("#screen canvas");
  await p.waitForTimeout(140 + Math.floor(Math.random() * 180));
  const dead = await p.evaluate(() => !!document.querySelector("#share") && !document.getElementById("share").hidden);
  if (dead && i > 4) break;
}
await p.waitForTimeout(600);
const out = await p.evaluate(() => {
  const raw = localStorage.getItem("5050.outbox");
  return raw;
});
console.log("outbox (should be empty in practice):", out);
await b.close();
