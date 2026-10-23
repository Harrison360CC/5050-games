import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT=process.env.PIN;
const srv=http.createServer((q,r)=>{let u=decodeURIComponent(q.url.split("?")[0]);if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";const f=path.join(ROOT,u);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end();}r.writeHead(200,{"content-type":u.endsWith(".html")?"text/html":"application/octet-stream"});r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(0,r)); const U=`http://127.0.0.1:${srv.address().port}/`;
const B=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
const c=await B.newContext({viewport:{width:393,height:852},deviceScaleFactor:3,isMobile:true,hasTouch:true});
const p=await c.newPage();
for(const r of ["**://pagead2.googlesyndication.com/**","**://fonts.googleapis.com/**","**://*.supabase.co/**","**://imgproxy.fourthwall.dev/**"])await p.route(r,x=>x.abort());
await p.goto(U,{waitUntil:"load"}); await p.waitForTimeout(600);
const RES = await p.evaluate(()=>({
  scrollingElement: document.scrollingElement?.tagName,
  htmlOB: getComputedStyle(document.documentElement).overscrollBehaviorY,
  bodyOB: getComputedStyle(document.body).overscrollBehaviorY,
  screenTA: getComputedStyle(document.getElementById("screen")).touchAction,
  canvasTA: getComputedStyle(document.querySelector("#screen canvas")).touchAction,
  modeTA: getComputedStyle(document.getElementById("mode")).touchAction,
  bodyUserSelect: getComputedStyle(document.body).webkitUserSelect,
  tapHighlight: getComputedStyle(document.body).webkitTapHighlightColor,
  touchCallout: getComputedStyle(document.querySelector("#screen canvas")).webkitTouchCallout ?? "not set",
  textSizeAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
  canvasA11y: (()=>{const cv=document.querySelector("#screen canvas");return {role:cv.getAttribute("role"),label:cv.getAttribute("aria-label"),tabindex:cv.getAttribute("tabindex")};})(),
  tabsAria: [...document.querySelectorAll('[role="tab"]')].map(t=>({txt:t.textContent.trim().slice(0,10),controls:t.getAttribute("aria-controls"),tabindex:t.getAttribute("tabindex")})),
  panels: [...document.querySelectorAll('[role="tabpanel"]')].length,
  statusLive: (()=>{const s=document.getElementById("status");return {role:s.getAttribute("role"),live:s.getAttribute("aria-live")};})(),
  sheetsAreDialogs: [...document.querySelectorAll(".sheet")].map(s=>({id:s.id,tag:s.tagName,role:s.getAttribute("role"),modal:s.getAttribute("aria-modal")})),
  insSlots: document.querySelectorAll("ins.adsbygoogle").length,
}));
console.log(JSON.stringify(RES,null,1));
await B.close(); srv.close();
