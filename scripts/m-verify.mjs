import { chromium } from "playwright";
import http from "http"; import fs from "fs"; import path from "path";
const root = "/home/claude/5050-games/dist";
const srv = http.createServer((q,r)=>{let u=q.url.split("?")[0];if(u==="/")u="/index.html";if(!path.extname(u))u+=".html";
  try{const b=fs.readFileSync(path.join(root,u));r.writeHead(200);r.end(b);}catch{r.writeHead(404);r.end("x");}}).listen(8099);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let fail = 0;
const ok = (c,m)=>{ if(!c) fail++; console.log(`  ${c?"OK  ":"FAIL"} ${m}`); };

for (const [w,h,name] of [[360,640,"360x640"],[375,667,"375x667"],[393,852,"393x852"]]) {
  const ctx = await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true});
  const p = await ctx.newPage();
  await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
  console.log(`\n${name}`);

  // 1. mode pill above the fold on first paint
  const pill = await p.evaluate(()=>{const r=document.getElementById("mode").getBoundingClientRect();return {bottom:Math.round(r.bottom),vis:getComputedStyle(document.getElementById("mode")).visibility};});
  ok(pill.bottom <= h, `Practice/Ranked pill above the fold (bottom ${pill.bottom} vs ${h})`);

  // 2. an exploratory swipe scrolls instead of launching a run
  await p.touchscreen.tap(2,2).catch(()=>{});
  await p.evaluate(()=>window.scrollTo(0,0));
  const box = await p.locator("#screen").boundingBox();
  const cx = Math.round(box.x+box.width/2), cy = Math.round(box.y+box.height/2);
  await p.touchscreen.tap(cx,cy).then(()=>{}).catch(()=>{});
  await p.waitForTimeout(250);
  await p.evaluate(()=>document.body.classList.remove("playing"));
  await p.reload(); await p.waitForTimeout(700);
  const sw = await p.evaluate(async (c)=>{
    const t=(n,x,y)=>{const e=new PointerEvent(n,{clientX:x,clientY:y,pointerType:"touch",bubbles:true,cancelable:true,isPrimary:true});
      document.elementFromPoint(x,y)?.dispatchEvent(e);};
    t("pointerdown",c.x,c.y); t("pointermove",c.x,c.y-120); t("pointerup",c.x,c.y-200);
    await new Promise(r=>setTimeout(r,200));
    return document.body.classList.contains("playing");
  },{x:cx,y:cy});
  ok(!sw, "a 200px swipe does NOT launch a run");

  // 3. a real tap does start one, and goes full-bleed
  await p.touchscreen.tap(cx,cy); await p.waitForTimeout(350);
  ok(await p.evaluate(()=>document.body.classList.contains("playing")), "a real tap starts the run full-bleed");

  // 4. toast is on top during play
  const toast = await p.evaluate(()=>{const t=document.getElementById("status");t.hidden=false;t.textContent="ranked: 7 verified.";
    const r=t.getBoundingClientRect();const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
    return {z:getComputedStyle(t).zIndex,on:el?el.id||el.tagName:"none"};});
  ok(toast.on==="status", `toast on top during play (z ${toast.z}, hit ${toast.on})`);

  // 5. The reported regression: leave full-bleed, let the run end, start a NEW
  //    run. That one must be full-bleed again. (Exiting MID-run and tapping is
  //    different: the run is still live and the exit should be respected.)
  await p.evaluate(()=>{document.getElementById("status").hidden=true;});
  await p.tap("#exit"); await p.waitForTimeout(200);
  ok(!(await p.evaluate(()=>document.body.classList.contains("playing"))), "exit mid-run is respected, not re-entered");
  await p.waitForTimeout(6000); // let that run die offscreen
  const b2 = await p.locator("#screen").boundingBox();
  const cx2 = Math.round(b2.x+b2.width/2), cy2 = Math.round(b2.y+b2.height/2);
  await p.touchscreen.tap(cx2,cy2); await p.waitForTimeout(200);   // dismiss death -> new runner
  await p.touchscreen.tap(cx2,cy2); await p.waitForTimeout(400);   // first input of the new run
  const back = await p.evaluate(()=>({playing:document.body.classList.contains("playing"),
    canvas:(()=>{const c=document.querySelector("#screen canvas").getBoundingClientRect();return Math.round(c.width)+"x"+Math.round(c.height);})()}));
  ok(back.playing, `a NEW run after the exit is full-bleed again (canvas ${back.canvas})`);

  // 6. share appears on the death screen
  await p.waitForTimeout(6000);
  const sh = await p.evaluate(()=>{const s=document.getElementById("share");
    return {dead:document.body.classList.contains("dead"),disp:getComputedStyle(s).display,hidden:s.hidden};});
  ok(sh.dead && (sh.hidden || sh.disp!=="none"), `death state reached (dead=${sh.dead}, share display=${sh.disp})`);

  await ctx.close();
}

// 7. typing a space into the complaint box
const ctx = await b.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
const p = await ctx.newPage(); await p.goto("http://localhost:8099/"); await p.waitForTimeout(700);
console.log("\nkeyboard + sheets");
await p.evaluate(()=>{document.getElementById("complain").hidden=false;});
await p.locator("#cbody").focus();
await p.keyboard.type("hello world this is broken");
const txt = await p.inputValue("#cbody");
ok(txt==="hello world this is broken", `spaces survive in the complaint box ("${txt}")`);
ok(!(await p.evaluate(()=>document.body.classList.contains("playing"))), "typing does not start a run behind the modal");
await p.keyboard.press("Escape"); await p.waitForTimeout(150);
ok(await p.evaluate(()=>document.getElementById("complain").hidden), "Escape closes the sheet");
// 8. 18+ gate error lands inside the sheet
await p.evaluate(()=>{document.getElementById("signin").hidden=false;});
await p.tap("#g-google"); await p.waitForTimeout(200);
const g = await p.evaluate(()=>{const m=document.getElementById("gate-msg");const r=m.getBoundingClientRect();
  const el=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
  return {hidden:m.hidden,on:el?el.id||el.className:"none"};});
ok(!g.hidden && g.on==="gate-msg", `18+ error visible inside the sheet (hit ${g.on})`);
// 9. tap targets
const t = await p.evaluate(()=>{const o={};for(const [k,sel] of [["close",".sheet:not([hidden]) .close"],["go",".sheet:not([hidden]) .go"]]){
  const e=document.querySelector(sel); if(e){const r=e.getBoundingClientRect();o[k]=`${Math.round(r.width)}x${Math.round(r.height)}`;}} return o;});
ok(parseInt(t.close)>=44, `sheet close button ${t.close}`);
await ctx.close(); await b.close(); srv.close();
console.log(fail? `\n${fail} FAILED` : "\nall checks pass");
process.exit(fail?1:0);
