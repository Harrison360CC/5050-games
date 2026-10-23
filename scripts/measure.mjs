import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await b.newContext({ viewport:{width:375,height:667}, deviceScaleFactor:2, isMobile:true, hasTouch:true, colorScheme:"dark" });
const p = await ctx.newPage();
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(2000);
await p.locator('#mode button[data-m="ranked"]').click();
await p.waitForTimeout(400);
console.log(JSON.stringify(await p.evaluate(() => {
  const r = (s) => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x)}; };
  return { sheetIn:r(".sheet-in"), google:r("#g-google"), discord:r("#g-discord"), email:r("#email"), send:r("#signin .go"),
    stepLoginDisplay: getComputedStyle(document.querySelector(".step-login")).display,
    sheetInDisplay: getComputedStyle(document.querySelector(".sheet-in")).display,
    topLinks: r(".links"), topRow: r(".top"), tabsScrollW: document.querySelector(".tabs").scrollWidth, tabsClientW: document.querySelector(".tabs").clientWidth,
    podCanvas: null };
}), null, 1));
await ctx.close(); await b.close();
