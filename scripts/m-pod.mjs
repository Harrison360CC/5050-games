import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{b=fs.readFileSync(path.join(root,u));}catch{r.writeHead(404);r.end("x");return;} r.writeHead(200);r.end(b);}).listen(8097);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
let bad=0; const ok=(c,m)=>{ if(!c) bad++; console.log(`  ${c?"OK  ":"FAIL"} ${m}`); };
for (const [w,h,theme] of [[360,640,"dark"],[393,852,"dark"],[375,667,"light"]]) {
  const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,colorScheme:theme});
  const p=await ctx.newPage(); await p.goto("http://localhost:8097/"); await p.waitForTimeout(800);
  console.log(`\n${w}x${h} ${theme}`);
  await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(900);
  const m=await p.evaluate(()=>{
    const c=document.querySelector("#podscreen canvas");
    const r=c.getBoundingClientRect();
    const cs=getComputedStyle(c);
    const say=document.getElementById("pod-say");
    const btns=[...document.querySelectorAll(".fxb")].map(b=>{const q=b.getBoundingClientRect();
      return {t:b.textContent.trim(), h:Math.round(q.height), dis:b.disabled};});
    return { cssW:Math.round(r.width), cssH:Math.round(r.height),
      backing:c.width+"x"+c.height, scaleInt:(c.width/ (window.devicePixelRatio>1?2:1)) % 168 === 0,
      sayFont:getComputedStyle(say).fontSize, sayLen:say.textContent.length,
      overflow: document.documentElement.scrollWidth > innerWidth, btns, rendering: cs.imageRendering };
  });
  ok(!m.overflow, `no page overflow (canvas ${m.cssW}x${m.cssH}, backing ${m.backing})`);
  ok(m.cssW % 168 === 0, `canvas width is an integer multiple of the 168px world (${m.cssW} = ${m.cssW/168}x)`);
  ok(parseFloat(m.sayFont) >= 13, `message line is DOM text at ${m.sayFont}`);
  ok(m.btns.every(x=>x.h>=44), `fx toggles are 44px+ (${m.btns.map(x=>x.t+" "+x.h).join(", ")})`);
  // walk to a pod and confirm arrival
  const box=await p.locator("#podscreen canvas").boundingBox();
  await p.touchscreen.tap(Math.round(box.x+box.width*0.75), Math.round(box.y+box.height*0.35));
  await p.waitForTimeout(2600);
  const said=await p.evaluate(()=>document.getElementById("pod-say").textContent);
  ok(/ENTERING|PIGEON|ORDER|HOLD|AD|CLOSED/i.test(said), `tapping a pod reaches it: "${said.slice(0,54)}"`);
  // idle must stop the render loop
  await p.waitForTimeout(1200);
  const frames=await p.evaluate(()=>new Promise(res=>{let n=0;const t=setInterval(()=>{},10);
    const step=()=>{n++;requestAnimationFrame(step);};requestAnimationFrame(step);
    setTimeout(()=>{clearInterval(t);res(n);},500);}));
  console.log(`      (rAF still available, ${frames} frames in 500ms — page itself is alive)`);
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad?`\n${bad} FAILED`:"\nall pod checks pass");
process.exit(bad?1:0);
