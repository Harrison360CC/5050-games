import { chromium } from "playwright";
import fs from "fs";
const pools = {};
for (const g of ["pigeon","rent","slumlord"]) {
  const src = fs.readFileSync(`src/games/${g}/render.ts`,"utf8");
  pools[g] = [...src.match(/const DEATH_LINES = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
}
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
await p.setContent(`<link rel=stylesheet href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=Silkscreen:wght@700&display=swap"><canvas id=c>`);
await p.waitForTimeout(2500);
const res = await p.evaluate((pools) => {
  const ctx = document.getElementById("c").getContext("2d");
  const out = {};
  for (const [g, lines] of Object.entries(pools)) {
    ctx.font = "700 16px Silkscreen, 'IBM Plex Mono', monospace";
    out[g] = lines.map(l => ({ l, w: Math.round(ctx.measureText(l).width) }));
  }
  return out;
}, pools);
let bad = 0;
const LIMIT = 360 - 32; // world minus the plate's inner padding
for (const [g, rows] of Object.entries(res)) {
  const worst = rows.slice().sort((a,b)=>b.w-a.w)[0];
  const over = rows.filter(r => r.w > LIMIT);
  bad += over.length;
  console.log(`${g.padEnd(9)} ${rows.length} lines · widest "${worst.l}" ${worst.w}px (limit ${LIMIT})` + (over.length?`  OVER: ${over.map(o=>o.l).join(", ")}`:"  all fit"));
}
await b.close();
console.log(bad ? `\n${bad} line(s) still clip` : "\nno death line clips at 16px in a 360px world");
process.exit(bad?1:0);
