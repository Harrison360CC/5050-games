import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=process.env.PIN;
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!fs.existsSync(f)){r.writeHead(404);return r.end();}
 const ct=u.endsWith(".html")?"text/html":u.endsWith(".png")?"image/png":u.endsWith(".webmanifest")?"application/manifest+json":"text/plain";
 r.writeHead(200,{"content-type":ct});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const c=await b.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p=await c.newPage();
p.on("pageerror",e=>console.log("PAGEERROR:",e.message));
p.on("console",m=>{if(m.type()==="error")console.log("CONSOLE ERR:",m.text().slice(0,200));});
p.on("requestfailed",r=>console.log("REQFAIL:",r.url().slice(0,90),r.failure()?.errorText));
for(const r of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://fonts.gstatic.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"]) await p.route(r,x=>x.abort());
await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(1500);
console.log(await p.evaluate(()=>({
  hasScreen: !!document.getElementById("screen"),
  canvases: document.querySelectorAll("canvas").length,
  screenHTML: (document.getElementById("screen")||{outerHTML:"MISSING"}).outerHTML.slice(0,200),
  bodyIds: [...document.querySelectorAll("[id]")].map(e=>e.id).join(","),
})));
await b.close(); srv.close();
