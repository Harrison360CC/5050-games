import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{b=fs.readFileSync(path.join(root,u));}catch{r.writeHead(404);r.end("x");return;} r.writeHead(200);r.end(b);}).listen(8095);
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2});
const p=await ctx.newPage();
await p.addInitScript(()=>{
  window.__x=[]; window.__steps=0; window.__vibes=[];
  const E=CanvasRenderingContext2D.prototype.ellipse;
  CanvasRenderingContext2D.prototype.ellipse=function(x,y,...a){ const m=this.getTransform();
    window.__x.push(Math.round(m.a*x+m.e)); return E.call(this,x,y,...a); };
  const AC=window.AudioContext;
  window.AudioContext=class extends AC { createBuffer(...a){ window.__steps++; return super.createBuffer(...a); } };
  navigator.vibrate=(pt)=>{ window.__vibes.push(JSON.stringify(pt)); return true; };
});
await p.goto("http://localhost:8095/"); await p.waitForTimeout(800);
await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(700);
const box=await p.locator("#podscreen canvas").boundingBox();
await p.evaluate(()=>{window.__x=[];window.__steps=0;window.__vibes=[];});
// walk the length of the visible corridor, on bare floor (not into a pod)
await p.touchscreen.tap(Math.round(box.x+box.width*0.88), Math.round(box.y+box.height*0.86));
await p.waitForTimeout(2600);
const r=await p.evaluate(()=>{
  const xs=window.__x; let rev=0;
  for(let i=2;i<xs.length;i++){ const a=xs[i-1]-xs[i-2], b=xs[i]-xs[i-1];
    if(a>0&&b<0) rev++; if(a<0&&b>0) rev++; }
  return { frames:xs.length, reversals:rev, steps:window.__steps, vibes:window.__vibes,
           said:document.getElementById("pod-say").textContent };
});
const secs=2.6;
console.log(`frames drawn while walking : ${r.frames}`);
console.log(`backward hitches           : ${r.reversals}  (was ~11 over one walk)`);
console.log(`footsteps                  : ${r.steps} in ${secs}s = ${(r.steps/secs).toFixed(1)}/s  (was 7.7/s)`);
console.log(`vibrations                 : ${r.vibes.join(" ") || "none"}`);
console.log(`floor tap entered a pod?   : ${/ENTERING|ORDER|PIGEON|HOLD/.test(r.said) ? "YES - BUG" : "no"}  ("${r.said.slice(0,40)}")`);
let bad=0;
if(r.reversals>2){bad++;console.log("FAIL jitter still present");}
if(r.steps/secs>5){bad++;console.log("FAIL footsteps still machine-gunning");}
if(/ENTERING|ORDER|PIGEON|HOLD/.test(r.said)){bad++;console.log("FAIL floor tap entered a pod");}
await ctx.close(); await br.close(); srv.close();
console.log(bad?`\n${bad} FAILED`:"\nfeel fixes verified");
process.exit(bad?1:0);
