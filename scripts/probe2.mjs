import { chromium } from "playwright";
const b = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const c = await b.newContext({viewport:{width:393,height:852}});
await c.route("**/api/**", r=>r.fulfill({json:{}}));
const p = await c.newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",String(e).slice(0,200)));
await p.goto(process.argv[2]); await p.waitForTimeout(1800);
console.log("canvas:", await p.evaluate(()=>!!document.querySelector("#screen canvas")));
await b.close();
