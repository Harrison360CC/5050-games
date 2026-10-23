import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const SIZES = [[375,667,"iPhone SE"],[393,852,"iPhone 15"],[360,740,"Android"]];
let bad = 0;
for (const [w,h,name] of SIZES) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, isMobile:true, hasTouch:true });
  const p = await ctx.newPage();
  await p.goto("file:///home/claude/5050-games/dist/index.html");
  await p.waitForTimeout(700);
  const probe = async () => p.evaluate(() => {
    const m = document.getElementById("mode");
    const btn = m.querySelector('button[data-m="ranked"]').getBoundingClientRect();
    const cx = btn.x + btn.width/2, cy = btn.y + btn.height/2;
    const top = document.elementFromPoint(cx, cy);
    return {
      playing: document.body.classList.contains("playing"),
      live: document.getElementById("screen").classList.contains("live"),
      vis: getComputedStyle(m).visibility,
      y: Math.round(btn.y), bottomGap: Math.round(innerHeight - btn.bottom),
      hit: top ? (top.dataset?.m ?? top.tagName) : "none",
      area: Math.round(btn.width) + "x" + Math.round(btn.height),
    };
  });
  // 1) enter full-bleed + start a run
  await p.tap("#screen canvas"); await p.waitForTimeout(400);
  const live = await probe();
  // 2) let it die, then check the idle/death state
  await p.waitForTimeout(4500);
  const dead = await probe();
  // 3) tap Ranked from the death screen
  await p.tap('.mode button[data-m="ranked"]'); await p.waitForTimeout(500);
  const after = await p.evaluate(() => {
    const sh = document.getElementById("signin");
    const r = sh.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width/2, innerHeight - 60);
    return { sheetOpen: !sh.hidden, playing: document.body.classList.contains("playing"),
             onTopOfSheet: top ? top.tagName + (top.className ? "."+String(top.className).split(" ")[0] : "") : "none" };
  });
  const okLive = live.vis === "hidden";
  const okDead = dead.vis === "visible" && dead.hit === "ranked" && dead.bottomGap > 100;
  const okTap  = after.sheetOpen && !after.playing;
  if (!okLive || !okDead || !okTap) bad++;
  console.log(`${name.padEnd(10)} ${w}x${h}`);
  console.log(`  live run : vis=${live.vis.padEnd(7)} ${okLive ? "OK hidden mid-run" : "FAIL still tappable mid-run"}`);
  console.log(`  idle/dead: vis=${dead.vis.padEnd(7)} hit=${String(dead.hit).padEnd(7)} y=${dead.y} gapFromBottom=${dead.bottomGap}px area=${dead.area} ${okDead?"OK":"FAIL"}`);
  console.log(`  tap Rankd: sheet=${after.sheetOpen} leftFullBleed=${!after.playing} topOfSheetArea=${after.onTopOfSheet} ${okTap?"OK":"FAIL"}`);
  await ctx.close();
}
await b.close();
console.log(bad ? `\n${bad} size(s) FAILED` : "\nall sizes pass");
process.exit(bad ? 1 : 0);
