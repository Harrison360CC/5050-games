import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 393, height: 852 } });
const reqs = [];
p.on("requestfailed", r => reqs.push(["FAIL", r.url().slice(0,90)]));
p.on("response", r => { if (/font|gstatic|googleapis/.test(r.url())) reqs.push([r.status(), r.url().slice(0,90)]); });
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const names = [...document.fonts].map(f => f.family + ":" + f.status);
  const m = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).fontFamily + " | " + getComputedStyle(e).fontSize + " | " + getComputedStyle(e).fontWeight : "missing"; };
  const rect = (sel) => { const e = document.querySelector(sel); if(!e) return "missing"; const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`; };
  return { loaded: names, wm: m(".wm"), pot: m(".pot .n"), potl: m(".pot .l"), nav: m(".nav-b"),
    wmRect: rect(".wm"), potRect: rect(".pot .n"), screenRect: rect("#screen"), canvasRect: rect("#screen canvas"),
    tabsScroll: (()=>{const e=document.querySelector(".tabs"); return e? e.scrollWidth+" vs client "+e.clientWidth : "x";})(),
    silkscreenAvail: document.fonts.check("700 20px Silkscreen"),
    atkinson: document.fonts.check("400 16px 'Atkinson Hyperlegible Next'"),
    plex: document.fonts.check("500 16px 'IBM Plex Mono'"),
  };
});
console.log(JSON.stringify(info, null, 1));
console.log("NET:", reqs.slice(0,12));
await b.close();
