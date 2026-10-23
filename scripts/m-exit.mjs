import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(700);
await p.tap("#screen canvas"); await p.waitForTimeout(400);
console.log("playing:", await p.evaluate(() => document.body.classList.contains("playing")));
await p.tap("#exit"); await p.waitForTimeout(400);
console.log("after exit:", await p.evaluate(() => document.body.classList.contains("playing")),
  "| nav visible:", await p.isVisible(".nav"), "| canvas w:", await p.evaluate(() => document.querySelector("#screen canvas").clientWidth));
// switching game tab while playing should also restore
await p.tap("#screen canvas"); await p.waitForTimeout(300);
await p.evaluate(() => document.body.classList.contains("playing"));
await p.tap('.tab[data-g="rent"]'); await p.waitForTimeout(400);
console.log("after tab switch:", await p.evaluate(() => document.body.classList.contains("playing")), "| nav visible:", await p.isVisible(".nav"));
await b.close();
