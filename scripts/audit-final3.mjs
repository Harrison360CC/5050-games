import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=process.env.PIN;
const MIME={".html":"text/html",".png":"image/png",".webmanifest":"application/manifest+json",".txt":"text/plain"};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("404");}r.writeHead(200,{"content-type":MIME[path.extname(u)]||"application/octet-stream"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const B=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p=await c.newPage();
for(const r of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"])await p.route(r,x=>x.abort());
await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(700);
const sample=()=>p.evaluate(()=>{const cv=document.querySelector("#screen canvas");const ctx=cv.getContext("2d");
  const top=ctx.getImageData(Math.floor(cv.width/2),4,1,1).data, mid=ctx.getImageData(Math.floor(cv.width/2),Math.floor(cv.height*0.3),1,1).data;
  return {top:[...top].join(","),mid:[...mid].join(",")};});
console.log("#### M. CACHED GRADIENT ACROSS CONTEXTS (canvas is recreated on every game-tab switch) ####");
console.log("  pigeon, first mount   sky top/mid RGBA:", JSON.stringify(await sample()));
for (const g of ["rent","slumlord","pigeon"]) { await p.click(`.tab[data-g="${g}"]`); await p.waitForTimeout(400);
  console.log(`  after switching to ${g.padEnd(9)} sky top/mid RGBA:`, JSON.stringify(await sample())); }
console.log("  (pigeon sky should be 27,31,42 -> 42,48,66. A transparent/black result would mean the stale-context gradient silently failed.)");

console.log("\n#### N. CRISPNESS ON A 3x SCREEN ####");
const cr=await p.evaluate(()=>{const cv=document.querySelector("#screen canvas"),b=cv.getBoundingClientRect();
  const pod=document.querySelector("#podscreen canvas");
  return {game:{cssW:+b.width.toFixed(1),backW:cv.width,ratio:+(cv.width/b.width).toFixed(3)},dpr:devicePixelRatio,
    idealBacking:Math.round(b.width*devicePixelRatio), shortfallPct:+((1-cv.width/(b.width*devicePixelRatio))*100).toFixed(1)};});
console.log(`  game canvas: ${cr.game.cssW}css -> ${cr.game.backW}px backing (${cr.game.ratio}x). Device is ${cr.dpr}x, so a crisp buffer would be ${cr.idealBacking}px.`);
console.log(`  => ${cr.shortfallPct}% fewer device pixels than the screen can show; 48px score text and 13-15px HUD text are resampled.`);
await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(800);
const pd=await p.evaluate(()=>{const cv=document.querySelector("#podscreen canvas"),b=cv.getBoundingClientRect();
  return {css:[+b.width.toFixed(1),+b.height.toFixed(1)],back:[cv.width,cv.height],ratio:+(cv.width/b.width).toFixed(3),dpr:devicePixelRatio,
    tilePx:+(b.width/22).toFixed(3), integerTiles:Number.isInteger(+(b.width/22/16).toFixed(6))};});
console.log(`  pod canvas: ${pd.css} css -> ${pd.back} backing (${pd.ratio}x) on a ${pd.dpr}x device. image-rendering:pixelated.`);
console.log(`  pod tile = ${pd.tilePx}css px for a 16px source tile => scale ${(pd.tilePx/16).toFixed(4)}, integer: ${pd.integerTiles}`);
console.log("  => every 16px tile is resampled to a fractional size at 1x and then blown up 3x by the compositor.");

console.log("\n#### O. TAP SURFACE OF THE FOOTER / CHROME ####");
await p.click('.nav-b[data-s="games"]'); await p.waitForTimeout(300);
const tt=await p.evaluate(()=>{const o=[];for(const e of document.querySelectorAll("a,button")){const b=e.getBoundingClientRect();if(b.width===0)continue;
  o.push({t:(e.textContent||e.getAttribute("aria-label")||"").trim().slice(0,16)||e.id,h:+b.height.toFixed(1),w:+b.width.toFixed(1),cls:e.className.split(" ")[0]});}return o;});
const bad=tt.filter(x=>x.h<44);
console.log(`  ${bad.length} of ${tt.length} visible controls are under the 44px minimum:`);
for(const x of bad) console.log(`    ${String(x.h).padStart(5)}px x ${String(x.w.toFixed(0)).padStart(4)}px  .${x.cls}  "${x.t}"`);
await B.close(); srv.close();
