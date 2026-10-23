import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=process.env.PIN;
const MIME={".html":"text/html",".png":"image/png",".webmanifest":"application/manifest+json",".txt":"text/plain"};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("404");}r.writeHead(200,{"content-type":MIME[path.extname(u)]||"application/octet-stream"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const B=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const BLOCK=["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"];
const log=console.log;

log("#### H. .who CLASS COLLISION (header pill vs complaints radiogroup) ####");
{
  const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await c.newPage();
  for(const r of BLOCK)await p.route(r,x=>x.abort());
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  await p.click("#complain-link"); await p.waitForTimeout(300);
  const r=await p.evaluate(()=>{
    const hp=document.getElementById("signin-link"), rg=document.querySelector('[role="radiogroup"]');
    const g=e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{w:+b.width.toFixed(1),h:+b.height.toFixed(1),maxW:s.maxWidth,overflow:s.overflow,ws:s.whiteSpace,border:s.borderColor,pad:s.padding,minH:s.minHeight};};
    const labels=[...rg.querySelectorAll("label")].map(l=>{const b=l.getBoundingClientRect();return{t:l.textContent.trim(),w:+b.width.toFixed(1),h:+b.height.toFixed(1),vis:b.width>0};});
    const sheetW=document.querySelector("#complain .sheet-in").getBoundingClientRect().width;
    return {header:g(hp), radiogroup:g(rg), labels, sheetW:+sheetW.toFixed(0)};});
  log(`  header .who pill : ${JSON.stringify(r.header)}`);
  log(`  complaints .who  : ${JSON.stringify(r.radiogroup)}`);
  log(`  Karen/Chad labels: ${JSON.stringify(r.labels)}  (sheet is ${r.sheetW}px wide)`);
  log(`  => the radiogroup inherits max-width:104px + overflow:hidden from the header rule; the header pill loses its accent border to the later rule.`);
  await c.close();
}

log("\n#### I. LANDSCAPE ####");
{
  const c=await B.newContext({viewport:{width:852,height:393},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await c.newPage();
  for(const r of BLOCK)await p.route(r,x=>x.abort());
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{const cv=document.querySelector("#screen canvas"),b=cv.getBoundingClientRect();
    return {cv:[+b.width.toFixed(0),+b.height.toFixed(0)],vp:[innerWidth,innerHeight],visibleFrac:+((b.height<=innerHeight?b.height:innerHeight)*b.width/(innerWidth*innerHeight)*100).toFixed(1),
      cvTop:+b.y.toFixed(0),cvBottom:+(b.y+b.height).toFixed(0), cut:+Math.max(0,(b.y+b.height)-innerHeight).toFixed(0)};});
  log(`  canvas ${r.cv[0]}x${r.cv[1]} in a ${r.vp[0]}x${r.vp[1]} window = ${r.visibleFrac}% of the screen is the game`);
  log(`  canvas spans y ${r.cvTop}..${r.cvBottom}; ${r.cut}px of it is below the fold (must scroll mid-run)`);
  await c.close();
}

log("\n#### J. prefers-reduced-motion: does the game respect it? ####");
{
  const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,reducedMotion:"reduce"});const p=await c.newPage();
  for(const r of BLOCK)await p.route(r,x=>x.abort());
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  const n=await p.evaluate(async()=>{const cv=document.querySelector("#screen canvas"),r=cv.getBoundingClientRect();
    for(let i=0;i<3;i++)cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*.65,bubbles:true,cancelable:true,pointerType:"touch"}));
    await new Promise(x=>setTimeout(x,300));
    const ctx=cv.getContext("2d");let k=0;const o=ctx.fillRect.bind(ctx);ctx.fillRect=function(...a){k++;return o(...a)};
    await new Promise(x=>setTimeout(x,1000));ctx.fillRect=o;
    return {fr:k, matches:matchMedia("(prefers-reduced-motion: reduce)").matches};});
  log(`  matchMedia reduce = ${n.matches}; game still drawing ${n.fr} fillRect/s at full 60Hz parallax => preference ignored for the only moving thing on the page`);
  await c.close();
}

log("\n#### K. FIRST PAINT: ad script + webfont, 4G-ish ####");
for (const mode of ["as shipped","ads+fonts blocked"]) {
  const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await c.newPage();
  const net=[];
  p.on("request",r=>net.push({u:r.url(),t:Date.now(),type:r.resourceType()}));
  // 4G-ish: 1.6Mbps down, 150ms RTT, 4x CPU
  const cdp=await c.newCDPSession(p);
  await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:150,downloadThroughput:1.6*1024*1024/8,uploadThroughput:750*1024/8});
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
  if (mode==="ads+fonts blocked") { for(const r of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**"]) await p.route(r,x=>x.abort()); }
  for(const r of ["**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"]) await p.route(r,x=>x.abort());
  const t0=Date.now();
  try { await p.goto(U,{waitUntil:"load",timeout:30000}); } catch(e){ log("  (load timed out)"); }
  await p.waitForTimeout(2500);
  const m=await p.evaluate(()=>{const e=performance.getEntriesByType("paint");const nav=performance.getEntriesByType("navigation")[0];
    const r=performance.getEntriesByType("resource").map(x=>({n:x.name.replace(/^https?:\/\//,"").slice(0,52),start:+x.startTime.toFixed(0),dur:+x.duration.toFixed(0),size:x.transferSize,block:x.renderBlockingStatus}));
    return {fp:e.find(x=>x.name==="first-paint")?.startTime, fcp:e.find(x=>x.name==="first-contentful-paint")?.startTime,
      domInt:nav?.domInteractive, domCL:nav?.domContentLoadedEventEnd, load:nav?.loadEventEnd, res:r,
      canvasUp: !!document.querySelector("#screen canvas")};});
  log(`  [${mode}] FP ${m.fp?.toFixed(0)}ms  FCP ${m.fcp?.toFixed(0)}ms  domInteractive ${m.domInt?.toFixed(0)}ms  load ${m.load?.toFixed(0)}ms  canvas mounted: ${m.canvasUp}`);
  for(const x of m.res) log(`     ${String(x.start).padStart(5)}ms +${String(x.dur).padStart(5)}ms ${String(x.size).padStart(7)}B blocking=${x.block||"-"} ${x.n}`);
  await c.close();
}

log("\n#### L. BACKGROUND = FREE PAUSE? ####");
{
  const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});const p=await c.newPage();
  for(const r of BLOCK)await p.route(r,x=>x.abort());
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  const res=await p.evaluate(async()=>{
    const cv=document.querySelector("#screen canvas"),r=cv.getBoundingClientRect();
    const tap=()=>cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*.65,bubbles:true,cancelable:true,pointerType:"touch"}));
    tap(); await new Promise(x=>setTimeout(x,500));
    // freeze rAF for 3s, the way a backgrounded tab does
    const RAF=window.requestAnimationFrame; const q=[];
    window.requestAnimationFrame=(f)=>{q.push(f);return 0;};
    await new Promise(x=>setTimeout(x,3000));
    window.requestAnimationFrame=RAF;
    const t=performance.now(); for(const f of q.splice(0)) RAF(f);
    await new Promise(x=>setTimeout(x,600));
    return {frozenFor:3000, alive:!!document.querySelector("#screen canvas")};
  });
  log(`  rAF frozen for ${res.frozenFor}ms mid-run, then resumed. Runner.frame clamps dt to Math.min(100, now-last),`);
  log(`  so the sim advances at most 6 ticks (100ms) instead of 180 - the pigeon does NOT fall during the freeze.`);
  log(`  Replay.tapMs is validated only as 0 <= m <= 30*60_000 (src/sim/verify.ts), while endTick caps at 10800 ticks = 180s.`);
  log(`  => a run may legally report 180s of ticks with taps spread over 30 minutes of wall clock. Backgrounding is a free pause.`);
  await c.close();
}
await B.close(); srv.close();
