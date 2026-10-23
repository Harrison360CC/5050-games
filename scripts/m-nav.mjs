import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{ b=fs.readFileSync(path.join(root,u)); }catch{ r.writeHead(404); r.end("x"); return; }
  r.writeHead(200); r.end(b);}).listen(8098);
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
let bad=0;
for (const w of [320,360,375,393]) {
  const ctx=await b.newContext({viewport:{width:w,height:740},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); await p.goto("http://localhost:8098/"); await p.waitForTimeout(900);
  const r=await p.evaluate(()=>{
    const bs=[...document.querySelectorAll(".nav-b")];
    return {overflow: document.documentElement.scrollWidth > window.innerWidth,
      btns: bs.map(b=>{const q=b.getBoundingClientRect();
        return {t:b.textContent.trim(), w:Math.round(q.width), h:Math.round(q.height), clipped: b.scrollWidth > b.clientWidth+1};})};
  });
  const clipped=r.btns.filter(x=>x.clipped), small=r.btns.filter(x=>x.h<44);
  if (r.overflow||clipped.length||small.length) bad++;
  console.log(`${w}px  ${r.btns.map(x=>`${x.t} ${x.w}x${x.h}`).join(" | ")}`);
  console.log(`      page overflow:${r.overflow} clipped:${clipped.map(c=>c.t).join(",")||"none"} under44:${small.map(c=>c.t).join(",")||"none"}`);
  await ctx.close();
}
await b.close(); srv.close();
console.log(bad?`\n${bad} width(s) FAILED`:"\nnav fits at every width");
process.exit(bad?1:0);
