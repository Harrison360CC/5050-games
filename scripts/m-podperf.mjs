import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{b=fs.readFileSync(path.join(root,u));}catch{r.writeHead(404);r.end("x");return;} r.writeHead(200);r.end(b);}).listen(8093);
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const p=await ctx.newPage();
await p.addInitScript(()=>{
  window.__raf=0; const R=window.requestAnimationFrame;
  window.requestAnimationFrame=(cb)=>{window.__raf++;return R(cb);};
  window.__fr=0; const FR=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(...a){window.__fr++;return FR.apply(this,a);};
});
await p.goto("http://localhost:8093/"); await p.waitForTimeout(1200);
let bad=0; const ok=(c,m)=>{ if(!c) bad++; console.log(`  ${c?"OK  ":"FAIL"} ${m}`); };

// 1. sit on the Loyalty Pod: the GAMES loop must be gone
await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(1800);
let a=await p.evaluate(()=>({r:window.__raf,f:window.__fr}));
await p.waitForTimeout(3000);
let b=await p.evaluate(()=>({r:window.__raf,f:window.__fr}));
const idleRaf=(b.r-a.r)/3, idleFr=(b.f-a.f)/3;
ok(idleRaf<5, `on the Loyalty Pod, idle: ${idleRaf.toFixed(0)} rAF/s, ${idleFr.toFixed(0)} fillRect/s (was ~60 rAF/s from the games loop)`);

// 2. during the advert the pod must stop drawing
const box=await p.locator("#podscreen canvas").boundingBox();
await p.touchscreen.tap(Math.round(box.x+box.width*0.45), Math.round(box.y+box.height*0.45));
await p.waitForTimeout(2200);
const adUp=await p.evaluate(()=>!!document.querySelector(".fakead"));
a=await p.evaluate(()=>({r:window.__raf,f:window.__fr}));
await p.waitForTimeout(1500);
b=await p.evaluate(()=>({r:window.__raf,f:window.__fr}));
const adFr=(b.f-a.f)/1.5;
ok(adUp, "advert overlay is up");
ok(adFr<40, `during the advert: ${adFr.toFixed(0)} fillRect/s (was ~4500/s drawing a corridor nobody can see)`);

// 3. leaving mid-advert must not grant the hat or spend a view
await p.evaluate(()=>{localStorage.removeItem("5050.hats");localStorage.removeItem("5050.ads");});
await p.tap('.nav-b[data-s="games"]'); await p.waitForTimeout(600);
await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(900);
const box2=await p.locator("#podscreen canvas").boundingBox();
await p.touchscreen.tap(Math.round(box2.x+box2.width*0.45), Math.round(box2.y+box2.height*0.45));
await p.waitForTimeout(2400);
await p.tap('.nav-b[data-s="games"]');      // bail out mid-advert
await p.waitForTimeout(6000);
const st=await p.evaluate(()=>({h:localStorage.getItem("5050.hats"),a:localStorage.getItem("5050.ads"),
  orphan:!!document.querySelector(".fakead")}));
ok(!st.h || st.h==="[]", `no hat granted for an advert nobody watched (5050.hats=${st.h})`);
ok(!st.a || !/"rewarded":[1-9]/.test(st.a), `no daily view spent (5050.ads=${st.a})`);
ok(!st.orphan, "no orphaned advert overlay left behind");

// 4. keyboard path
await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(900);
await p.evaluate(()=>document.querySelector("#podscreen canvas").focus());
const focused=await p.evaluate(()=>document.activeElement?.tagName);
await p.keyboard.press("ArrowRight"); await p.waitForTimeout(2200);
const said=await p.evaluate(()=>document.getElementById("pod-say").textContent);
ok(focused==="CANVAS", `canvas is focusable (activeElement=${focused})`);
ok(/ENTERING|ORDER|PIGEON|HOLD|CLOSED/i.test(said), `arrow key walks and enters: "${said.slice(0,44)}"`);
await ctx.close(); await br.close(); srv.close();
console.log(bad?`\n${bad} FAILED`:"\nall perf, battery and keyboard checks pass");
process.exit(bad?1:0);
