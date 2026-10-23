import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", e => console.log("ERR", e.message));
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(800);
console.log("before:", await p.evaluate(() => document.body.className));
await p.tap("#screen canvas");
await p.waitForTimeout(700);
console.log("after :", await p.evaluate(() => document.body.className));
console.log(await p.evaluate(() => {
  const sc = document.getElementById("screen"), st = document.querySelector(".stage");
  return JSON.stringify({ screen: getComputedStyle(sc).maxHeight, stagePos: getComputedStyle(st).position,
    stageBox: st.getBoundingClientRect().height, screenBox: sc.getBoundingClientRect().width });
}));
await b.close();
