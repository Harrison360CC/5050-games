import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=path.resolve("dist");
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!f.startsWith(ROOT)||!fs.existsSync(f)){r.writeHead(404);return r.end();}r.writeHead(200,{"content-type":"text/html"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
for (const [label, opts] of [
  ["isMobile+UA", {viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true,userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"}],
  ["isMobile no UA", {viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true}],
  ["desktop-ish",   {viewport:{width:393,height:852},deviceScaleFactor:3,hasTouch:true}],
]) {
  const c=await b.newContext(opts); const p=await c.newPage();
  for(const r of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"]) await p.route(r,x=>x.abort());
  await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(800);
  const r=await p.evaluate(()=>{
    const s=document.getElementById("screen"),cv=s.querySelector("canvas");
    const a=s.getBoundingClientRect(),q=cv.getBoundingClientRect();
    const cs=getComputedStyle(s), bs=getComputedStyle(document.body);
    return {innerH:innerHeight,innerW:innerWidth,clientW:document.documentElement.clientWidth,
      bodyPadL:bs.paddingLeft, screenMaxH:cs.maxHeight, screenH:+a.height.toFixed(1), screenW:+a.width.toFixed(1),
      cvW:+q.width.toFixed(1), cvH:+q.height.toFixed(1), barsX:+(a.width-q.width).toFixed(1),
      screenTA:cs.touchAction, bodyUS:bs.userSelect, bodyWUS:bs.webkitUserSelect, btnUS:getComputedStyle(document.querySelector('.tab')).userSelect,
      overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY,
      aspect:cs.aspectRatio};
  });
  console.log(label, JSON.stringify(r,null,1));
  await c.close();
}
await b.close(); srv.close();
