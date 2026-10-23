import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/shots/";
mkdirSync(OUT, { recursive: true });
const URL = "file:///home/claude/5050-games/dist/index.html";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errs = [];

const sizes = [{ n: "375", w: 375, h: 667 }, { n: "393", w: 393, h: 852 }];
const schemes = ["dark", "light"];

for (const s of sizes) {
  for (const cs of schemes) {
    const ctxb = await b.newContext({ viewport: { width: s.w, height: s.h }, colorScheme: cs, deviceScaleFactor: 2 });
    const p = await ctxb.newPage();
    p.on("pageerror", e => errs.push(`${s.n}/${cs}: ${e}`));
    const tag = `${s.n}-${cs}`;
    await p.goto(URL); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}${tag}-01-games-pigeon.png` });
    await p.screenshot({ path: `${OUT}${tag}-01f-games-pigeon-full.png`, fullPage: true });

    // pigeon mid-play
    for (let i = 0; i < 8; i++) { await p.click("#screen canvas"); await p.waitForTimeout(260); }
    await p.screenshot({ path: `${OUT}${tag}-02-pigeon-play.png` });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${OUT}${tag}-03-pigeon-dead.png` });

    // rent
    await p.click('.tab[data-g="rent"]'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}${tag}-04-rent-idle.png` });
    for (let i = 0; i < 7; i++) { await p.click("#screen canvas"); await p.waitForTimeout(420); }
    await p.screenshot({ path: `${OUT}${tag}-05-rent-play.png` });

    // slumlord
    await p.click('.tab[data-g="slumlord"]'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}${tag}-06-slum-idle.png` });
    for (let i = 0; i < 6; i++) { await p.click("#screen canvas"); await p.waitForTimeout(520); }
    await p.screenshot({ path: `${OUT}${tag}-07-slum-play.png` });

    // pod
    await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}${tag}-08-pod.png`, fullPage: true });
    // walk into a pod
    const box = await p.locator("#podscreen canvas").boundingBox();
    if (box) { await p.mouse.click(box.x + box.width * 0.13, box.y + box.height * 0.26); await p.waitForTimeout(2600);
      await p.screenshot({ path: `${OUT}${tag}-09-pod-enter.png`, fullPage: true }); }

    // shop
    await p.click('.nav-b[data-s="shop"]'); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${OUT}${tag}-10-shop.png`, fullPage: true });

    // sheets
    await p.click('.nav-b[data-s="games"]'); await p.waitForTimeout(200);
    await p.click('.mode button[data-m="ranked"]'); await p.waitForTimeout(600);
    await p.screenshot({ path: `${OUT}${tag}-11-signin.png` });
    // adult step
    try { await p.fill('#email', 'x@y.com'); } catch {}
    await p.evaluate(() => { const a = document.querySelector('.step-login'); const bq = document.querySelector('.step-adult'); if (a && bq) { a.hidden = true; bq.hidden = false; } });
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${OUT}${tag}-12-adult.png` });
    await p.click('#signin .close').catch(()=>{});
    await p.waitForTimeout(200);
    await p.click('#complain-link'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${OUT}${tag}-13-complain.png` });
    await p.click('#complain .close').catch(()=>{});
    // account sheet
    await p.evaluate(() => { const f = document.querySelector('#account'); if (f) f.hidden = false; });
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${OUT}${tag}-14-account.png` });
    await ctxb.close();
  }
}

// static pages
for (const cs of schemes) {
  const ctxb = await b.newContext({ viewport: { width: 393, height: 852 }, colorScheme: cs, deviceScaleFactor: 2 });
  const p = await ctxb.newPage();
  p.on("pageerror", e => errs.push(`static/${cs}: ${e}`));
  for (const pg of ["rules", "privacy", "ledger"]) {
    await p.goto(`file:///home/claude/5050-games/dist/${pg}.html`); await p.waitForTimeout(1400);
    await p.screenshot({ path: `${OUT}static-${cs}-${pg}.png` });
    await p.screenshot({ path: `${OUT}static-${cs}-${pg}-full.png`, fullPage: true });
  }
  await ctxb.close();
}
console.log("errors:", errs.length ? errs : "none");
await b.close();
