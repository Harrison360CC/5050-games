import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=process.env.PIN;
const MIME={".html":"text/html",".png":"image/png",".webmanifest":"application/manifest+json",".txt":"text/plain",".js":"text/javascript",".css":"text/css"};
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end("404");}r.writeHead(200,{"content-type":MIME[path.extname(u)]||"application/octet-stream"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const B=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const BLOCK=["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"];
async function mk(w,h,dpr,block=true){const c=await B.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});const p=await c.newPage();const errs=[];p.on("pageerror",e=>errs.push("PAGEERROR: "+e.message.slice(0,120)));if(block)for(const r of BLOCK)await p.route(r,x=>x.abort());return [c,p,errs];}
const log=(...a)=>console.log(...a);

log("#### A. LAYOUT + CANVAS (pinned build) ####");
for (const d of [["iPhone 15 Pro",393,852,3],["iPhone SE2",375,667,2],["Pixel 7a",414,896,2.625],["Galaxy A14",360,740,3],["320 narrow",320,568,2],["landscape",852,393,3]]) {
  const [c,p,errs]=await mk(d[1],d[2],d[3]);
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(800);
  const r=await p.evaluate(()=>{
    const s=document.getElementById("screen"),cv=s&&s.querySelector("canvas");
    if(!cv) return {broken:true};
    const a=s.getBoundingClientRect(),q=cv.getBoundingClientRect(),de=document.documentElement;
    const t=[];for(const sel of [".nav-b",".tab",".mode button",".who",".potline a",".foot a"])for(const e of document.querySelectorAll(sel)){const b=e.getBoundingClientRect();t.push({sel,txt:(e.textContent||"").trim().slice(0,11),h:+b.height.toFixed(1),w:+b.width.toFixed(1)});}
    return {ow:de.scrollWidth,cw:de.clientWidth,dh:de.scrollHeight,vh:innerHeight,
      sw:+a.width.toFixed(1),sh:+a.height.toFixed(1),sy:+a.y.toFixed(0),
      cvw:+q.width.toFixed(1),cvh:+q.height.toFixed(1),bx:+(a.width-q.width).toFixed(1),
      bw:cv.width,bh:cv.height,edpr:+(cv.width/q.width).toFixed(2),ddpr:devicePixelRatio,
      maxh:getComputedStyle(s).maxHeight,t};
  });
  if(r.broken){log(`\n${d[0]}: NO CANVAS MOUNTED`,errs);await c.close();continue;}
  const small=r.t.filter(x=>x.h<44);
  log(`\n${d[0]} ${d[1]}x${d[2]}@${d[3]}  max-height=${r.maxh}`);
  log(`  overflow-x: ${r.ow>r.cw?"YES "+r.ow+">"+r.cw:"none"} | doc ${r.dh} vs viewport ${r.vh} => page scrolls ${r.dh-r.vh}px | stage top at y=${r.sy}`);
  log(`  stage ${r.sw}x${r.sh} | canvas CSS ${r.cvw}x${r.cvh} | backing ${r.bw}x${r.bh} = ${(r.bw*r.bh/1e6).toFixed(2)}MP ${(r.bw*r.bh*4/1048576).toFixed(1)}MB`);
  log(`  letterbox bars x=${r.bx}px (${(r.bx/r.sw*100).toFixed(1)}% of stage) | canvas DPR ${r.edpr} vs device ${r.ddpr}${r.edpr<r.ddpr?"  <-- SOFT on this screen":""}`);
  log(`  tap targets under 44px: ${small.length}/${r.t.length}  ${small.map(x=>`${x.sel}"${x.txt}"=${x.h}x${x.w.toFixed(0)}`).join(" ")}`);
  if(errs.length)log("  ERRORS:",errs);
  await c.close();
}

log("\n\n#### B. MODE PILL ON TOP OF THE PLAY FIELD ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(700);
  const g=await p.evaluate(()=>{const m=document.getElementById("mode").getBoundingClientRect(),cv=document.querySelector("#screen canvas").getBoundingClientRect();
    return{mx:m.x,my:m.y,mw:m.width,mh:m.height,cx:cv.x,cy:cv.y,cw:cv.width,ch:cv.height,
      overlap:m.x<cv.x+cv.width&&m.x+m.width>cv.x&&m.y<cv.y+cv.height&&m.y+m.height>cv.y,
      bf:getComputedStyle(document.getElementById("mode")).backdropFilter,z:getComputedStyle(document.getElementById("mode")).zIndex};});
  log(`  pill ${g.mw.toFixed(0)}x${g.mh.toFixed(0)} at (${g.mx.toFixed(0)},${g.my.toFixed(0)}); canvas (${g.cx.toFixed(0)},${g.cy.toFixed(0)}) ${g.cw.toFixed(0)}x${g.ch.toFixed(0)}`);
  log(`  overlaps the play field: ${g.overlap} | z-index ${g.z} | backdrop-filter: ${g.bf}`);
  log(`  => ${(g.mw*g.mh/(g.cw*g.ch)*100).toFixed(1)}% of the tap surface, in the corner, is not a tap-to-flap`);
  await p.evaluate(()=>{const cv=document.querySelector("#screen canvas"),r=cv.getBoundingClientRect();for(let i=0;i<2;i++)cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*.65,bubbles:true,cancelable:true,pointerType:"touch"}));});
  await p.waitForTimeout(500);
  const pre=await p.evaluate(()=>[...document.querySelectorAll("#mode button")].map(b=>b.getAttribute("aria-pressed")));
  await p.touchscreen.tap(g.mx+g.mw*0.78,g.my+g.mh/2);
  await p.waitForTimeout(400);
  const post=await p.evaluate(()=>({m:[...document.querySelectorAll("#mode button")].map(b=>b.getAttribute("aria-pressed")),sheet:!document.getElementById("signin").hidden}));
  log(`  tap on the pill DURING a live run: mode ${JSON.stringify(pre)} -> ${JSON.stringify(post.m)}; sign-in sheet thrown over the running game: ${post.sheet}`);
  await c.close();
}

log("\n\n#### C. PER-FRAME CANVAS WORK (post gradient-cache fix) ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  await p.evaluate(()=>{window.__inst=(cv)=>new Promise(res=>{const ctx=cv.getContext("2d"),cn={},og={};
    const ms=["createLinearGradient","fillRect","fillText","beginPath","fill","stroke","save","restore","measureText","arc","ellipse","translate","rotate"];
    for(const m of ms){og[m]=ctx[m].bind(ctx);cn[m]=0;ctx[m]=function(...a){cn[m]++;return og[m](...a)}}
    const pr=["font","fillStyle","strokeStyle","textAlign"],ds={};
    for(const x of pr){cn[x+"="]=0;const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),x);ds[x]=d;Object.defineProperty(ctx,x,{get(){return d.get.call(ctx)},set(v){cn[x+"="]++;d.set.call(ctx,v)},configurable:true})}
    let n=0;const f=()=>{if(++n<60)requestAnimationFrame(f);else{for(const m of ms)ctx[m]=og[m];for(const x of pr)Object.defineProperty(ctx,x,ds[x]);const o={};for(const k in cn)if(cn[k])o[k]=+(cn[k]/n).toFixed(1);res(o)}};requestAnimationFrame(f)})});
  for (const g of ["pigeon","rent","slumlord"]) {
    await p.click(`.tab[data-g="${g}"]`); await p.waitForTimeout(300);
    await p.evaluate(()=>{const cv=document.querySelector("#screen canvas"),r=cv.getBoundingClientRect();for(let i=0;i<4;i++)cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*.65,bubbles:true,cancelable:true,pointerType:"touch"}));});
    await p.waitForTimeout(600);
    log(`  ${g.padEnd(9)} ${JSON.stringify(await p.evaluate(()=>window.__inst(document.querySelector("#screen canvas"))))}`);
  }
  await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(800);
  log(`  pod       ${JSON.stringify(await p.evaluate(()=>window.__inst(document.querySelector("#podscreen canvas"))))}`);
  log(`  pod canvas ${JSON.stringify(await p.evaluate(()=>{const cv=document.querySelector("#podscreen canvas"),r=cv.getBoundingClientRect();return{css:[+r.width.toFixed(0),+r.height.toFixed(0)],backing:[cv.width,cv.height],effDPR:+(cv.width/r.width).toFixed(2),devDPR:devicePixelRatio,imageRendering:cv.style.imageRendering}}))}`);
  await c.close();
}

log("\n\n#### D. LOOPS THAT KEEP BURNING ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  const probe=(sel,ms)=>p.evaluate(async([s,m])=>{const cv=document.querySelector(s);if(!cv)return "absent";const ctx=cv.getContext("2d");let n=0;const o=ctx.fillRect.bind(ctx);ctx.fillRect=function(...a){n++;return o(...a)};await new Promise(r=>setTimeout(r,m));ctx.fillRect=o;return n;},[sel,ms]);
  log(`  GAMES visible    : game fillRect/1s = ${await probe("#screen canvas",1000)}`);
  await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(500);
  log(`  on LOYALTY       : game (display:none) fillRect/1s = ${await probe("#screen canvas",1000)}`);
  log(`  on LOYALTY       : pod  fillRect/1s = ${await probe("#podscreen canvas",1000)}`);
  await p.click('.nav-b[data-s="shop"]'); await p.waitForTimeout(500);
  log(`  on SHOP          : game (hidden) fillRect/1s = ${await probe("#screen canvas",1000)}`);
  log(`  on SHOP          : pod  (hidden) fillRect/1s = ${await probe("#podscreen canvas",1000)}`);
  log(`  canvases alive   : ${await p.evaluate(()=>document.querySelectorAll("canvas").length)}`);
  // document.hidden path
  await p.click('.nav-b[data-s="games"]'); await p.waitForTimeout(300);
  await p.evaluate(()=>{Object.defineProperty(document,"hidden",{get:()=>true,configurable:true});Object.defineProperty(document,"visibilityState",{get:()=>"hidden",configurable:true});document.dispatchEvent(new Event("visibilitychange"));});
  log(`  document.hidden=true: game fillRect/1s = ${await probe("#screen canvas",1000)} (their new guard)`);
  log(`  document.hidden=true: pod  fillRect/1s = ${await probe("#podscreen canvas",1000)} (pod has NO such guard)`);
  await c.close();
}

log("\n\n#### E. dvh RESIZE THRASH (iOS URL bar) ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(700);
  await p.evaluate(()=>{window.__rz=0;const cv=document.querySelector("#screen canvas");const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,"width");Object.defineProperty(cv,"width",{get(){return d.get.call(cv)},set(v){window.__rz++;d.set.call(cv,v)},configurable:true});});
  for (const h of [852,844,836,828,820,812,804,796,788,796,812,828,844,852]) { await p.setViewportSize({width:393,height:h}); await p.waitForTimeout(50); }
  const rz=await p.evaluate(()=>window.__rz), sz=await p.evaluate(()=>{const cv=document.querySelector("#screen canvas");return[cv.width,cv.height]});
  log(`  14 viewport-height steps (one URL-bar animation) => ${rz} canvas backing-store reallocations`);
  log(`  each one throws away and re-allocates ${(sz[0]*sz[1]*4/1048576).toFixed(1)}MB and clears the canvas to transparent for a frame`);
  await c.close();
}

log("\n\n#### F. FRAME TIMING + HEAP ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  await p.evaluate(()=>{const cv=document.querySelector("#screen canvas"),r=cv.getBoundingClientRect();for(let i=0;i<3;i++)cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*.65,bubbles:true,cancelable:true,pointerType:"touch"}));});
  const fr=await p.evaluate(()=>new Promise(res=>{const t=[];let n=0;const f=(x)=>{t.push(x);if(++n<240)requestAnimationFrame(f);else res(t)};requestAnimationFrame(f)}));
  const d=[];for(let i=1;i<fr.length;i++)d.push(fr[i]-fr[i-1]);d.sort((a,b)=>a-b);
  log(`  240 frames: p50 ${d[d.length>>1].toFixed(2)}ms p95 ${d[Math.floor(d.length*.95)].toFixed(2)}ms max ${d[d.length-1].toFixed(2)}ms (headless, no GPU - treat as a floor)`);
  const cdp=await c.newCDPSession(p); await cdp.send("Performance.enable");
  const m=(await cdp.send("Performance.getMetrics")).metrics.reduce((a,x)=>(a[x.name]=x.value,a),{});
  log(`  JSHeapUsedSize ${(m.JSHeapUsedSize/1048576).toFixed(1)}MB / total ${(m.JSHeapTotalSize/1048576).toFixed(1)}MB | Nodes ${m.Nodes} | LayoutCount ${m.LayoutCount} | RecalcStyleCount ${m.RecalcStyleCount}`);
  await c.close();
}

log("\n\n#### G. CONTRAST ####");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(500);
  for (const scheme of ["dark","light"]) {
    await p.emulateMedia({colorScheme:scheme}); await p.waitForTimeout(200);
    const r=await p.evaluate(()=>{
      const lum=s=>{const m=s.match(/[\d.]+/g).map(Number);const f=m.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*f[0]+.7152*f[1]+.0722*f[2]};
      const bg=e=>{let n=e;while(n){const b=getComputedStyle(n).backgroundColor;if(b&&!/rgba\(0, 0, 0, 0\)|transparent/.test(b))return b;n=n.parentElement}return "rgb(255,255,255)"};
      const o=[];for(const s of [".potbar .l",".potline",".nav-b",".tab",".board h2 span","#wk",".foot a",".who",".mode button",".hint"]){const e=document.querySelector(s);if(!e)continue;const cs=getComputedStyle(e);const r=(Math.max(lum(cs.color),lum(bg(e)))+.05)/(Math.min(lum(cs.color),lum(bg(e)))+.05);o.push({s,px:parseFloat(cs.fontSize),w:cs.fontWeight,r:+r.toFixed(2)})}return o});
    log(`  --- ${scheme} ---`);
    for(const x of r){const need=(x.px>=24||(x.px>=18.66&&+x.w>=700))?3:4.5;log(`   ${x.r<need?"FAIL":"pass"} ${String(x.r).padEnd(5)} need ${need}  ${x.s.padEnd(15)} ${x.px}px w${x.w}`);}
  }
  await c.close();
}
await B.close(); srv.close();
