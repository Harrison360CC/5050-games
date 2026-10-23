import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("dist");
const srv = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") u = "/index.html";
  if (!path.extname(u)) u += ".html";
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nope"); }
  res.writeHead(200, { "content-type": u.endsWith(".html") ? "text/html" : "text/plain" });
  res.end(fs.readFileSync(f));
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;
const URL = `http://127.0.0.1:${PORT}/`;

const DEVICES = [
  { name: "iPhone 15 Pro",   w: 393, h: 852, dpr: 3 },
  { name: "iPhone SE2",      w: 375, h: 667, dpr: 2 },
  { name: "Pixel 5 / A-tier",w: 393, h: 851, dpr: 2.75 },
  { name: "Galaxy A14 360",  w: 360, h: 740, dpr: 3 },
  { name: "narrow 320",      w: 320, h: 568, dpr: 2 },
  { name: "iPhone15 landscape", w: 852, h: 393, dpr: 3 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: d.dpr,
    isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", m => { if (m.type() === "error") errs.push(m.text().slice(0,120)); });
  page.on("pageerror", e => errs.push("PAGEERROR " + e.message.slice(0,120)));
  await page.route("**://pagead2.googlesyndication.com/**", r => r.abort());
  await page.route("**://fonts.googleapis.com/**", r => r.abort());
  await page.route("**://*.supabase.co/**", r => r.abort());
  await page.route("**://imgproxy.fourthwall.dev/**", r => r.abort());
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(600);

  const r = await page.evaluate(() => {
    const sc = document.getElementById("screen");
    const cv = sc.querySelector("canvas");
    const b = sc.getBoundingClientRect(), c = cv ? cv.getBoundingClientRect() : null;
    const de = document.documentElement;
    const tap = [];
    for (const sel of [".nav-b", ".tab", ".mode button", ".links a", ".foot a"]) {
      for (const el of document.querySelectorAll(sel)) {
        const q = el.getBoundingClientRect();
        tap.push({ sel, text: (el.textContent||"").trim().slice(0,14), w: +q.width.toFixed(1), h: +q.height.toFixed(1) });
      }
    }
    return {
      scrollW: de.scrollWidth, clientW: de.clientWidth,
      docH: de.scrollHeight, viewH: innerHeight,
      screen: { w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      canvasCss: c ? { w: +c.width.toFixed(1), h: +c.height.toFixed(1) } : null,
      canvasBacking: cv ? { w: cv.width, h: cv.height } : null,
      deadBarsX: c ? +(b.width - c.width).toFixed(1) : null,
      deadBarsY: c ? +(b.height - c.height).toFixed(1) : null,
      dpr: devicePixelRatio,
      effectiveDpr: cv && c ? +(cv.width / c.width).toFixed(3) : null,
      backingPx: cv ? cv.width * cv.height : null,
      tap,
    };
  });

  const small = r.tap.filter(t => t.h < 44);
  console.log(`\n### ${d.name}  ${d.w}x${d.h} @${d.dpr}`);
  console.log(`  overflow-x: scrollW=${r.scrollW} clientW=${r.clientW} ${r.scrollW>r.clientW?"<<< HORIZONTAL OVERFLOW":"ok"}`);
  console.log(`  doc height ${r.docH} vs viewport ${r.viewH}  (scrolls ${r.docH-r.viewH}px)`);
  console.log(`  #screen ${r.screen.w}x${r.screen.h}  canvas CSS ${r.canvasCss?.w}x${r.canvasCss?.h}  backing ${r.canvasBacking?.w}x${r.canvasBacking?.h} (${(r.backingPx/1e6).toFixed(2)}MP, ~${(r.backingPx*4/1048576).toFixed(1)}MB)`);
  console.log(`  DEAD BARS x=${r.deadBarsX}px y=${r.deadBarsY}px   effective canvas DPR ${r.effectiveDpr} (device ${r.dpr})`);
  console.log(`  tap targets <44px high: ${small.length}/${r.tap.length} -> ` + small.slice(0,8).map(t=>`${t.sel}"${t.text}"=${t.h}`).join(" "));
  if (errs.length) console.log("  CONSOLE ERRORS:", errs.slice(0,5));
  await ctx.close();
}
await browser.close();
srv.close();
