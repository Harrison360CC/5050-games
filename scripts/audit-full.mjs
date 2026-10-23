import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=path.resolve("dist");
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end();}r.writeHead(200,{"content-type":u.endsWith(".html")?"text/html":"text/plain"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const EXE="/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const browser=await chromium.launch({executablePath:EXE,args:["--no-sandbox"]});
const BLOCK=["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"];
async function mk(w,h,dpr){const c=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,isMobile:true,hasTouch:true});const p=await c.newPage();for(const r of BLOCK)await p.route(r,x=>x.abort());return [c,p];}

console.log("######## 1. LAYOUT / CANVAS ACROSS DEVICES ########");
for (const d of [["iPhone 15 Pro",393,852,3],["iPhone SE2",375,667,2],["Pixel 7a",414,896,2.625],["Galaxy A14",360,740,3],["320 narrow",320,568,2],["landscape iPhone",852,393,3]]) {
  const [c,p]=await mk(d[1],d[2],d[3]);
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(700);
  const r=await p.evaluate(()=>{
    const s=document.getElementById("screen"),cv=s.querySelector("canvas");
    const a=s.getBoundingClientRect(),q=cv.getBoundingClientRect();
    const de=document.documentElement;
    const t=[]; for(const sel of [".nav-b",".tab",".mode button",".who",".potline a",".foot a",".board li"]) for(const e of document.querySelectorAll(sel)){const b=e.getBoundingClientRect();t.push({sel,txt:(e.textContent||"").trim().slice(0,12),h:+b.height.toFixed(1),w:+b.width.toFixed(1)});}
    return {ow:de.scrollWidth,cw:de.clientWidth,dh:de.scrollHeight,vh:innerHeight,
      sw:+a.width.toFixed(1),sh:+a.height.toFixed(1),cvw:+q.width.toFixed(1),cvh:+q.height.toFixed(1),
      bx:+(a.width-q.width).toFixed(1),by:+(a.height-q.height).toFixed(1),
      bw:cv.width,bh:cv.height,edpr:+(cv.width/q.width).toFixed(2),ddpr:devicePixelRatio,
      maxh:getComputedStyle(s).maxHeight, t};
  });
  const small=r.t.filter(x=>x.h<44&&x.sel!==".board li");
  console.log(`\n${d[0]} ${d[1]}x${d[2]}@${d[3]}`);
  console.log(` overflowX:${r.ow>r.cw?"YES "+r.ow+">"+r.cw:"no"}  doc ${r.dh} vs vp ${r.vh} (scrolls ${r.dh-r.vh})  #screen max-height=${r.maxh}`);
  console.log(` #screen ${r.sw}x${r.sh}  canvas ${r.cvw}x${r.cvh} css / ${r.bw}x${r.bh} backing = ${(r.bw*r.bh/1e6).toFixed(2)}MP ${(r.bw*r.bh*4/1048576).toFixed(1)}MB`);
  console.log(` DEAD BARS x=${r.bx} y=${r.by}  (${(r.bx/r.sw*100).toFixed(1)}% of stage width)  canvas DPR ${r.edpr} vs device ${r.ddpr}`);
  console.log(` tap targets <44px: ${small.length}  ${small.map(x=>x.sel+'"'+x.txt+'" '+x.h+'x'+x.w.toFixed(0)).join(" | ")}`);
  await c.close();
}

console.log("\n\n######## 2. MODE PILL OVERLAYS THE PLAY FIELD ########");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  const g=await p.evaluate(()=>{
    const m=document.getElementById("mode").getBoundingClientRect();
    const cv=document.querySelector("#screen canvas").getBoundingClientRect();
    return {m:{x:m.x,y:m.y,w:m.width,h:m.height},cv:{x:cv.x,y:cv.y,w:cv.width,h:cv.height},
      overlap:(m.x<cv.x+cv.width&&m.x+m.width>cv.x&&m.y<cv.y+cv.height&&m.y+m.height>cv.y),
      bf:getComputedStyle(document.getElementById("mode")).backdropFilter, z:getComputedStyle(document.getElementById("mode")).zIndex};
  });
  console.log(` mode pill ${g.m.w.toFixed(0)}x${g.m.h.toFixed(0)} at (${g.m.x.toFixed(0)},${g.m.y.toFixed(0)}); canvas at (${g.cv.x.toFixed(0)},${g.cv.y.toFixed(0)}) ${g.cv.w.toFixed(0)}x${g.cv.h.toFixed(0)}`);
  console.log(` OVERLAPS PLAY FIELD: ${g.overlap}  z-index ${g.z}  backdrop-filter: ${g.bf}`);
  console.log(` dead rect = ${(g.m.w*g.m.h).toFixed(0)}px2 = ${(g.m.w*g.m.h/(g.cv.w*g.cv.h)*100).toFixed(1)}% of play field, in the top-left corner`);
  // start a run, then tap the pill, see if ranked state resets
  await p.evaluate(()=>{const cv=document.querySelector("#screen canvas");const r=cv.getBoundingClientRect();cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*0.6,bubbles:true,cancelable:true,pointerType:"touch"}));});
  await p.waitForTimeout(400);
  const before=await p.evaluate(()=>({pressed:[...document.querySelectorAll("#mode button")].map(b=>b.getAttribute("aria-pressed"))}));
  await p.touchscreen.tap(g.m.x+g.m.w*0.8, g.m.y+g.m.h/2); // "Ranked" half
  await p.waitForTimeout(300);
  const after=await p.evaluate(()=>({pressed:[...document.querySelectorAll("#mode button")].map(b=>b.getAttribute("aria-pressed")),sheet:!document.getElementById("signin").hidden}));
  console.log(` tap on pill mid-run: mode before ${JSON.stringify(before.pressed)} after ${JSON.stringify(after.pressed)}; sign-in sheet opened over the live run: ${after.sheet}`);
  await c.close();
}

console.log("\n\n######## 3. CANVAS WORK PER FRAME, PER GAME ########");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(500);
  const instr=()=>{
    window.__inst=(canvas)=>new Promise(res=>{
      const ctx=canvas.getContext("2d"); const counts={}; const orig={};
      const ms=["createLinearGradient","fillRect","fillText","beginPath","fill","stroke","save","restore","measureText","arc","ellipse","translate","rotate","scale","setTransform"];
      for(const m of ms){orig[m]=ctx[m].bind(ctx);counts[m]=0;ctx[m]=function(...a){counts[m]++;return orig[m](...a);} }
      const props=["font","fillStyle","strokeStyle","textAlign","lineWidth"]; const dscs={};
      for(const pr of props){counts[pr+"="]=0;const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),pr);dscs[pr]=d;Object.defineProperty(ctx,pr,{get(){return d.get.call(ctx)},set(v){counts[pr+"="]++;d.set.call(ctx,v)},configurable:true});}
      let n=0; const f=()=>{ if(++n<60) requestAnimationFrame(f); else { for(const m of ms)ctx[m]=orig[m]; for(const pr of props)Object.defineProperty(ctx,pr,dscs[pr]);
        const o={}; for(const k in counts) if(counts[k]) o[k]=+(counts[k]/n).toFixed(1); res(o);} };
      requestAnimationFrame(f);
    });
  };
  await p.evaluate(instr);
  for (const g of ["pigeon","rent","slumlord"]) {
    await p.click(`.tab[data-g="${g}"]`); await p.waitForTimeout(300);
    await p.evaluate(()=>{const cv=document.querySelector("#screen canvas");const r=cv.getBoundingClientRect();for(let i=0;i<4;i++)cv.dispatchEvent(new PointerEvent("pointerdown",{clientX:r.x+r.width/2,clientY:r.y+r.height*0.6,bubbles:true,cancelable:true,pointerType:"touch"}));});
    await p.waitForTimeout(500);
    const r=await p.evaluate(()=>window.__inst(document.querySelector("#screen canvas")));
    console.log(` ${g.padEnd(9)} ${JSON.stringify(r)}`);
  }
  await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(700);
  const pod=await p.evaluate(()=>window.__inst(document.querySelector("#podscreen canvas")));
  console.log(` pod       ${JSON.stringify(pod)}`);
  const podinfo=await p.evaluate(()=>{const cv=document.querySelector("#podscreen canvas");const r=cv.getBoundingClientRect();return {css:[+r.width.toFixed(1),+r.height.toFixed(1)],backing:[cv.width,cv.height],edpr:+(cv.width/r.width).toFixed(2),dpr:devicePixelRatio,imgRender:cv.style.imageRendering};});
  console.log(` pod canvas: CSS ${podinfo.css} backing ${podinfo.backing} effectiveDPR ${podinfo.edpr} (device ${podinfo.dpr}) image-rendering=${podinfo.imgRender}`);
  await c.close();
}

console.log("\n\n######## 4. LOOPS THAT NEVER STOP ########");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(500);
  const probe=async (sel,ms)=>p.evaluate(async ([sel,ms])=>{const cv=document.querySelector(sel);if(!cv)return null;const ctx=cv.getContext("2d");let n=0;const o=ctx.fillRect.bind(ctx);ctx.fillRect=function(...a){n++;return o(...a)};await new Promise(r=>setTimeout(r,ms));ctx.fillRect=o;return n;},[sel,ms]);
  console.log(` games visible: #screen fillRect/1s = ${await probe("#screen canvas",1000)}`);
  await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(400);
  console.log(` on LOYALTY tab: #screen (hidden) fillRect/1s = ${await probe("#screen canvas",1000)}  <-- game loop never pauses`);
  console.log(` on LOYALTY tab: pod fillRect/1s = ${await probe("#podscreen canvas",1000)}`);
  await p.click('.nav-b[data-s="shop"]'); await p.waitForTimeout(400);
  console.log(` on SHOP tab:    #screen (hidden) fillRect/1s = ${await probe("#screen canvas",1000)}`);
  console.log(` on SHOP tab:    pod   (hidden) fillRect/1s = ${await probe("#podscreen canvas",1000)}  <-- pod loop never unmounts`);
  const n=await p.evaluate(()=>document.querySelectorAll("canvas").length); console.log(` canvases alive: ${n}`);
  // switching game tabs: does the old mount leak?
  await p.click('.nav-b[data-s="games"]'); await p.waitForTimeout(200);
  for(const g of ["rent","slumlord","pigeon","rent"]) {await p.click(`.tab[data-g="${g}"]`); await p.waitForTimeout(150);}
  console.log(` after 4 game-tab switches: canvases = ${await p.evaluate(()=>document.querySelectorAll("canvas").length)} (unmount works)`);
  await c.close();
}

console.log("\n\n######## 5. dvh RESIZE THRASH (iOS URL bar) ########");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
  await p.evaluate(()=>{window.__rz=0;const cv=document.querySelector("#screen canvas");
    // count backing-store reallocations by watching width writes
    const d=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,"width");
    Object.defineProperty(cv,"width",{get(){return d.get.call(cv)},set(v){window.__rz++;d.set.call(cv,v)},configurable:true});});
  // simulate URL bar collapse/expand: viewport height steps, as Safari animates dvh
  for (const h of [852,840,828,816,804,792,780,792,804,816,828,840,852]) { await p.setViewportSize({width:393,height:h}); await p.waitForTimeout(60); }
  const rz=await p.evaluate(()=>window.__rz);
  const sz=await p.evaluate(()=>{const cv=document.querySelector("#screen canvas");return [cv.width,cv.height];});
  console.log(` 13 viewport-height steps (URL-bar animation) => ${rz} canvas backing-store reallocations, now ${sz}`);
  console.log(` each realloc = ${(sz[0]*sz[1]*4/1048576).toFixed(1)}MB GPU/CPU buffer + a cleared canvas (1 black frame)`);
  await c.close();
}

console.log("\n\n######## 6. CONTRAST ########");
{
  const [c,p]=await mk(393,852,3); await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(400);
  const r=await p.evaluate(()=>{
    const lum=(s)=>{const m=s.match(/[\d.]+/g).map(Number);const f=m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];};
    const bgOf=(e)=>{let n=e;while(n){const b=getComputedStyle(n).backgroundColor;if(b&&!/rgba\(0, 0, 0, 0\)|transparent/.test(b))return b;n=n.parentElement;}return "rgb(255,255,255)";};
    const out=[];
    for(const sel of [".potbar .l",".potline",".nav-b",".tab",".board h2","#wk",".foot",".who",".mode button",".hint"]){
      const e=document.querySelector(sel); if(!e)continue; const cs=getComputedStyle(e);
      const l1=lum(cs.color),l2=lum(bgOf(e)); const cr=(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
      out.push({sel,size:cs.fontSize,weight:cs.fontWeight,ratio:+cr.toFixed(2),fg:cs.color,bg:bgOf(e)});
    } return out;});
  for(const x of r){const need=(parseFloat(x.size)>=18.66||(parseFloat(x.size)>=24))?3:4.5;console.log(` ${x.ratio<need?"FAIL":"pass"} ${x.ratio.toString().padEnd(5)} (need ${need}) ${x.sel.padEnd(14)} ${x.size} w${x.weight} ${x.fg} on ${x.bg}`);}
  await c.close();
}
await browser.close(); srv.close();
