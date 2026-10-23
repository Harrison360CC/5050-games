import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{b=fs.readFileSync(path.join(root,u));}catch{r.writeHead(404);r.end("x");return;} r.writeHead(200);r.end(b);}).listen(8094);
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
const L=(c)=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2]);};
const ratio=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+0.05)/(Math.min(x,y)+0.05));};
let bad=0;
for (const theme of ["dark","light"]) {
  const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); await p.goto("http://localhost:8094/"); await p.waitForTimeout(800);
  await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(1400);
  // sample the lit doorway interior behind the reward label, and a closed one
  const px=await p.evaluate(()=>{
    const c=document.querySelector("#podscreen canvas");
    const g=c.getContext("2d"); const d=(x,y)=>[...g.getImageData(x,y,1,1).data].slice(0,3);
    // device px: scale 2 * dpr 2 = 4 per world unit. label sits at world y=88.
    return { litDoor: d(4*76, 4*88), closedDoor: d(4*(286-cam0()), 4*88) };
    function cam0(){ return 0; }
  }).catch(()=>null);
  if (!px) { console.log(`${theme}: probe failed`); bad++; await ctx.close(); continue; }
  const rLit = ratio([0xFF,0xA1,0x4A], px.litDoor);
  const rClosed = ratio([0xD4,0xCF,0xC2], px.litDoor);
  const okL = rLit >= 4.5, okC = rClosed >= 4.5;
  if(!okL) bad++; if(!okC) bad++;
  console.log(`${theme.padEnd(5)} doorway rgb(${px.litDoor.join(",")})`);
  console.log(`      reward label #FFA14A : ${rLit.toFixed(2)}:1  ${okL?"PASS":"FAIL"} (AA needs 4.5)`);
  console.log(`      CLOSED label #D4CFC2 : ${rClosed.toFixed(2)}:1  ${okC?"PASS":"FAIL"}`);
  await ctx.close();
}
await br.close(); srv.close();
console.log(bad?`\n${bad} contrast FAIL`:"\nlabel contrast passes AA in both themes");
process.exit(bad?1:0);
