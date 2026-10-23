import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = path.resolve("dist");
const srv = http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)){res.writeHead(404);return res.end();}res.writeHead(200,{"content-type":"text/html"});res.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const ctx = await browser.newContext({ viewport:{width:393,height:852}, deviceScaleFactor:3, isMobile:true, hasTouch:true });
const page = await ctx.newPage();
for (const p of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"]) await page.route(p, r=>r.abort());
await page.goto(U,{waitUntil:"load"}); await page.waitForTimeout(500);

// ---------- 1. dead-bar tap test ----------
const geo = await page.evaluate(()=>{const s=document.getElementById("screen"),c=s.querySelector("canvas");const a=s.getBoundingClientRect(),b=c.getBoundingClientRect();return {sx:a.x,sy:a.y,sw:a.width,sh:a.height,cx:b.x,cw:b.width,cy:b.y,ch:b.height};});
await page.evaluate(()=>{window.__tapcount=0;const c=document.querySelector("#screen canvas");c.addEventListener("pointerdown",()=>window.__tapcount++,true);});
// tap inside the left dead bar (midway between #screen left edge and canvas left edge)
const barX = geo.sx + (geo.cx - geo.sx)/2, midY = geo.sy + geo.sh/2;
await page.touchscreen.tap(barX, midY);
await page.waitForTimeout(150);
const afterBar = await page.evaluate(()=>window.__tapcount);
await page.touchscreen.tap(geo.cx + geo.cw/2, midY);
await page.waitForTimeout(150);
const afterCanvas = await page.evaluate(()=>window.__tapcount);
console.log(`DEAD BAR TAP: #screen=${geo.sw.toFixed(0)}px wide, canvas=${geo.cw.toFixed(0)}px. left bar width ${(geo.cx-geo.sx).toFixed(1)}px`);
console.log(`  tap at x=${barX.toFixed(0)} (inside bar): canvas pointerdown count = ${afterBar}`);
console.log(`  tap at x=${(geo.cx+geo.cw/2).toFixed(0)} (on canvas): count = ${afterCanvas}`);
console.log(`  => ${(2*(geo.cx-geo.sx)/geo.sw*100).toFixed(1)}% of the game area is TAP DEAD`);

// ---------- 2. input->state latency ----------
const lat = await page.evaluate(async ()=>{
  const c=document.querySelector("#screen canvas");
  const r=c.getBoundingClientRect();
  const out=[];
  for(let i=0;i<12;i++){
    await new Promise(res=>requestAnimationFrame(()=>res()));
    const t0=performance.now();
    let seen=null;
    const h=()=>{ seen=performance.now(); };
    c.addEventListener("pointerdown",h,{once:true});
    c.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true,pointerType:"touch"}));
    // wait 2 frames for sim to consume the queued tap
    await new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(()=>res())));
    out.push(+( (seen??t0)-t0).toFixed(2));
  }
  return out;
});
console.log("\nHANDLER dispatch cost ms (synthetic):", lat.join(","));

// ---------- 3. frame cost / allocations ----------
await page.evaluate(()=>{ const c=document.querySelector("#screen canvas"); const r=c.getBoundingClientRect();
  for(let i=0;i<3;i++) c.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height/2,bubbles:true,cancelable:true,pointerType:"touch"}));});
const frames = await page.evaluate(()=>new Promise(res=>{
  const ts=[]; let n=0;
  const f=(t)=>{ ts.push(t); if(++n<150) requestAnimationFrame(f); else res(ts); };
  requestAnimationFrame(f);
}));
const d=[]; for(let i=1;i<frames.length;i++) d.push(frames[i]-frames[i-1]);
d.sort((a,b)=>a-b);
console.log(`\nFRAME intervals over 150 frames: p50=${d[Math.floor(d.length*0.5)].toFixed(2)}ms p95=${d[Math.floor(d.length*0.95)].toFixed(2)}ms max=${d[d.length-1].toFixed(2)}ms`);

// count canvas API churn per frame via proxying
const churn = await page.evaluate(()=>new Promise(res=>{
  const c=document.querySelector("#screen canvas"); const ctx=c.getContext("2d");
  const counts={}; const props=["font","fillStyle","strokeStyle","textAlign"];
  const orig={}; let frames=0;
  for(const m of ["createLinearGradient","fillRect","fillText","beginPath","fill","stroke","save","restore","measureText","arc","ellipse"]){
    orig[m]=ctx[m].bind(ctx); counts[m]=0;
    ctx[m]=function(...a){ counts[m]++; return orig[m](...a); };
  }
  const setters={};
  for(const p of props){ counts[p+"="]=0; const dsc=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),p); setters[p]=dsc;
    Object.defineProperty(ctx,p,{get(){return dsc.get.call(ctx);},set(v){counts[p+"="]++;dsc.set.call(ctx,v);},configurable:true}); }
  const f=()=>{ if(++frames<60) requestAnimationFrame(f); else {
    for(const m in orig) ctx[m]=orig[m];
    for(const p of props) Object.defineProperty(ctx,p,setters[p]);
    const per={}; for(const k in counts) per[k]=+(counts[k]/frames).toFixed(1);
    res(per);
  }};
  requestAnimationFrame(f);
}));
console.log("CANVAS CALLS PER FRAME (pigeon, mid-run):", JSON.stringify(churn));

// ---------- 4. does the loop keep running when the section is hidden? ----------
await page.evaluate(()=>{window.__dc=0; const c=document.querySelector("#screen canvas"); const ctx=c.getContext("2d"); const o=ctx.fillRect.bind(ctx); ctx.fillRect=function(...a){window.__dc++;return o(...a);} ;});
await page.waitForTimeout(500);
const visDraws = await page.evaluate(()=>{const v=window.__dc;window.__dc=0;return v;});
// switch to pod
await page.click('.nav-b[data-s="pod"]');
await page.waitForTimeout(1000);
const hiddenDraws = await page.evaluate(()=>window.__dc);
const nCanvas1 = await page.evaluate(()=>document.querySelectorAll("canvas").length);
// back to games
await page.click('.nav-b[data-s="games"]');
await page.waitForTimeout(300);
const podStillDrawing = await page.evaluate(async ()=>{
  const cs=[...document.querySelectorAll("canvas")];
  const pod=document.querySelector("#podscreen canvas");
  if(!pod) return "no pod canvas";
  let n=0; const ctx=pod.getContext("2d"); const o=ctx.fillRect.bind(ctx); ctx.fillRect=function(...a){n++;return o(...a);};
  await new Promise(r=>setTimeout(r,500)); ctx.fillRect=o;
  return n;
});
console.log(`\nLIFECYCLE: #screen fillRect/500ms while VISIBLE = ${visDraws}`);
console.log(`           #screen fillRect while section HIDDEN (1s on Loyalty Center) = ${hiddenDraws}  ${hiddenDraws>0?"<<< GAME LOOP STILL DRAWING OFFSCREEN":"stops"}`);
console.log(`           canvases in DOM after visiting pod: ${nCanvas1}`);
console.log(`           pod fillRect/500ms after returning to Games (pod hidden) = ${podStillDrawing} ${podStillDrawing>0?"<<< POD LOOP NEVER UNMOUNTS":""}`);

// ---------- 5. hidden tab ----------
await page.evaluate(()=>{window.__dc=0;});
const cdp = await ctx.newCDPSession(page);
// emulate page being backgrounded is awkward; instead measure rAF under visibility override
await page.evaluate(()=>{ Object.defineProperty(document,"visibilityState",{get:()=>"hidden",configurable:true}); document.dispatchEvent(new Event("visibilitychange")); });
await page.waitForTimeout(600);
const afterHidden = await page.evaluate(()=>window.__dc);
console.log(`           fillRect in 600ms after visibilitychange->hidden (rAF not actually throttled in headless): ${afterHidden} (app has no visibilitychange handler of its own)`);

// ---------- 6. selection / callout CSS ----------
const css = await page.evaluate(()=>{
  const q=(s)=>{const e=document.querySelector(s);const c=getComputedStyle(e);return {sel:s,userSelect:c.webkitUserSelect||c.userSelect,touchAction:c.touchAction,touchCallout:c.webkitTouchCallout};};
  return [q("body"),q(".tab"),q(".mode button"),q("#screen"),q("#screen canvas"),q(".pot"),q("html")].concat([{sel:"html overscroll",overscroll:getComputedStyle(document.documentElement).overscrollBehavior}]);
});
console.log("\nTOUCH CSS:"); for(const c of css) console.log("  ", JSON.stringify(c));

// ---------- 7. tick accumulator / pause ----------
const pause = await page.evaluate(async ()=>{
  // start a fresh run then simulate a long rAF gap by checking the clamp math directly on live objects is not reachable;
  // instead verify the observable: freeze rAF for 2s and see if score/state jumped
  return "see note";
});
await browser.close(); srv.close();
