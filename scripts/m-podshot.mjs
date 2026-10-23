import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root="/home/claude/5050-games/dist";
const srv=http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  let b; try{b=fs.readFileSync(path.join(root,u));}catch{r.writeHead(404);r.end("x");return;} r.writeHead(200);r.end(b);}).listen(8096);
const br=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
for (const theme of ["dark","light"]) {
  const ctx=await br.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:2,colorScheme:theme});
  const p=await ctx.newPage(); await p.goto("http://localhost:8096/"); await p.waitForTimeout(900);
  await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(600);
  // give the player a hat so the reward is visible in the shot
  await p.evaluate(()=>localStorage.setItem("5050.hats",JSON.stringify(["traffic cone"])));
  await p.reload(); await p.waitForTimeout(700);
  await p.tap('.nav-b[data-s="pod"]'); await p.waitForTimeout(1400);
  const box=await p.locator("#podscreen canvas").boundingBox();
  // walk to bare floor between pods, so no ad overlay dims the scene
  await p.touchscreen.tap(Math.round(box.x+box.width*0.86), Math.round(box.y+box.height*0.80));
  await p.waitForTimeout(2200);
  await p.locator("#s-pod").screenshot({path:`/home/claude/5050-games/pod-${theme}.png`});
  console.log(`pod-${theme}.png`);
  await ctx.close();
}
await br.close(); srv.close();
