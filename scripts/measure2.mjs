import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [w,h] of [[375,667],[360,740],[393,852]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2, isMobile:true, hasTouch:true, colorScheme:"dark" });
  const p = await ctx.newPage();
  await p.goto("file:///home/claude/5050-games/dist/index.html");
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const t = document.querySelector(".tabs");
    const tabs = [...document.querySelectorAll(".tab")].map(e=>{const b=e.getBoundingClientRect();return {txt:e.textContent.trim(),x:Math.round(b.x),right:Math.round(b.right)};});
    const links=[...document.querySelectorAll(".links a")].map(e=>{const b=e.getBoundingClientRect();return {t:e.textContent,right:Math.round(b.right)};});
    const pod=document.querySelector("#podscreen");
    return { tabsClient:t.clientWidth, tabsScroll:t.scrollWidth, tabs, links, innerW:innerWidth,
      appW: Math.round(document.querySelector(".app").getBoundingClientRect().width) };
  });
  console.log(w+"x"+h, JSON.stringify(r));
  // pod canvas overflow
  await p.locator('.nav-b[data-s="pod"]').click(); await p.waitForTimeout(900);
  console.log("  pod:", JSON.stringify(await p.evaluate(()=>{
    const c=document.querySelector("#podscreen canvas"), s=document.querySelector("#podscreen");
    return {canvasW:c?.width, cssW:c?Math.round(c.getBoundingClientRect().width):null, cssH:c?Math.round(c.getBoundingClientRect().height):null, contW:s.clientWidth, contH:s.clientHeight, docScrollW:document.documentElement.scrollWidth, innerW:innerWidth};
  })));
  await ctx.close();
}
await b.close();
