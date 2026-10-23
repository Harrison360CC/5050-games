import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const SNAP = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/snap2/dist";
const OUT = "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/s4/";
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const pots = { week:"2026-W44", pots:{
  pigeon:{seed_cents:169,ads_cents:241,merch_cents:0,rollover_cents:680,est_pot_cents:1090,confirmed:false},
  rent:{seed_cents:169,ads_cents:88,merch_cents:412,rollover_cents:0,est_pot_cents:669,confirmed:false},
  slumlord:{seed_cents:169,ads_cents:31,merch_cents:0,rollover_cents:0,est_pot_cents:200,confirmed:false}},
  entries:[{date:"2026-10-23",game:"pigeon",kind:"ads",cents:482,note:""},{date:"2026-10-24",game:"rent",kind:"merch",cents:824,note:"2 mugs"},{date:"2026-10-25",game:"pigeon",kind:"rollover",cents:680,note:"wk43 unclaimed"},{date:"2026-10-26",game:"slumlord",kind:"payout",cents:340,note:"paid @gravel_dad"}]};
const lb = g => ({week:"2026-W44",rows:[{handle:"gravel_dad",score:g==="pigeon"?47:g==="rent"?31:22,finished_at:"2026-10-26T10:00:00Z"},{handle:"wet_toast_91",score:g==="pigeon"?44:28,finished_at:"2026-10-26T11:00:00Z"},{handle:"anna_from_hr",score:g==="pigeon"?38:24,finished_at:"2026-10-26T12:00:00Z"}]});
const errs=[];
for (const s of [{n:"375",w:375,h:667},{n:"393",w:393,h:852}]) for (const cs of ["dark","light"]) {
  const c = await b.newContext({viewport:{width:s.w,height:s.h},colorScheme:cs,deviceScaleFactor:2});
  await c.route("**/api/pots", r=>r.fulfill({json:pots}));
  await c.route("**/api/plays", r=>r.fulfill({json:{week:"2026-W44",plays:[{game:"pigeon",score:47,at:new Date(Date.now()-120000).toISOString(),handle:"gravel_dad",rank:1}]}}));
  await c.route("**/api/leaderboard/*", r=>r.fulfill({json:lb(r.request().url().split("/").pop())}));
  const p = await c.newPage(); p.on("pageerror",e=>errs.push(`${s.n}/${cs}: ${e}`));
  const t=`${s.n}-${cs}`;
  await p.goto(`file://${SNAP}/index.html`); await p.waitForTimeout(1500);
  await p.screenshot({path:`${OUT}${t}-01-games.png`});
  await p.screenshot({path:`${OUT}${t}-01f-games-full.png`,fullPage:true});
  for(let i=0;i<9;i++){await p.click("#screen canvas");await p.waitForTimeout(250);}
  await p.screenshot({path:`${OUT}${t}-02-pigeon-play.png`});
  await p.waitForTimeout(2600); await p.screenshot({path:`${OUT}${t}-03-pigeon-dead.png`});
  await p.click('.tab[data-g="rent"]'); await p.waitForTimeout(500);
  for(let i=0;i<7;i++){await p.click("#screen canvas");await p.waitForTimeout(400);}
  await p.screenshot({path:`${OUT}${t}-04-rent-play.png`});
  await p.waitForTimeout(2600); await p.screenshot({path:`${OUT}${t}-05-rent-dead.png`});
  await p.click('.tab[data-g="slumlord"]'); await p.waitForTimeout(500);
  for(let i=0;i<7;i++){await p.click("#screen canvas");await p.waitForTimeout(480);}
  await p.screenshot({path:`${OUT}${t}-06-slum-play.png`});
  await p.click('.nav-b[data-s="pod"]'); await p.waitForTimeout(1000);
  await p.screenshot({path:`${OUT}${t}-07-pod.png`,fullPage:true});
  await p.click('.nav-b[data-s="shop"]'); await p.waitForTimeout(900);
  await p.screenshot({path:`${OUT}${t}-08-shop.png`,fullPage:true});
  await p.click('.nav-b[data-s="games"]'); await p.waitForTimeout(300);
  await p.click('.mode button[data-m="ranked"]'); await p.waitForTimeout(700);
  await p.screenshot({path:`${OUT}${t}-09-signin.png`});
  await p.click('#signin .close').catch(()=>{}); await p.waitForTimeout(200);
  await p.click('#complain-link'); await p.waitForTimeout(500);
  await p.screenshot({path:`${OUT}${t}-10-complain.png`});
  await c.close();
}
for (const cs of ["dark","light"]) {
  const c = await b.newContext({viewport:{width:393,height:852},colorScheme:cs,deviceScaleFactor:2});
  await c.route("**/api/pots", r=>r.fulfill({json:pots}));
  await c.route("**/api/plays", r=>r.fulfill({json:{week:"2026-W44",plays:[{game:"pigeon",score:47,at:new Date().toISOString(),handle:"gravel_dad",rank:1},{game:"rent",score:29,at:new Date(Date.now()-3600000).toISOString(),handle:"wet_toast_91",rank:2}]}}));
  const p = await c.newPage();
  for (const pg of ["rules","privacy","ledger"]) { await p.goto(`file://${SNAP}/${pg}.html`); await p.waitForTimeout(1200); await p.screenshot({path:`${OUT}static-${cs}-${pg}.png`,fullPage: pg!=="rules"}); }
  await c.close();
}
console.log("errors:", errs.length?errs:"none");
await b.close();
