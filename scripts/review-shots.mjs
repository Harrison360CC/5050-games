import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const EXE = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const URL = "file:///home/claude/5050-games/dist/index.html";
const OUT = "/home/claude/5050-games/scripts/shots";
mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: "iphoneSE", w: 375, h: 667 },
  { name: "iphone15", w: 393, h: 852 },
  { name: "android", w: 360, h: 740 },
];

const browser = await chromium.launch({ executablePath: EXE });
const report = {};

for (const d of DEVICES) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    colorScheme: "dark",
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`[${d.name}] pageerror:`, e.message));
  await page.goto(URL, { waitUntil: "load" }).catch((e) => console.log("goto", e.message));
  await page.waitForTimeout(2500);

  // geometry of above-the-fold
  const geo = await page.evaluate((vh) => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) };
    };
    return {
      viewportH: vh,
      docH: Math.round(document.documentElement.scrollHeight),
      top: pick(".top"), nav: pick(".nav"), tabs: pick(".tabs"), pot: pick("#pot"),
      mode: pick("#mode"), screen: pick("#screen"), canvas: pick("#screen canvas"),
      board: pick("#board"), foot: pick(".foot"),
      potText: document.querySelector("#pot")?.innerText,
      chipText: [...document.querySelectorAll(".tab")].map(t => t.innerText),
      boardHeader: document.querySelector("#board h2")?.innerText,
    };
  }, d.h);
  report[d.name] = geo;

  await page.screenshot({ path: `${OUT}/${d.name}-games.png` });
  await page.screenshot({ path: `${OUT}/${d.name}-games-full.png`, fullPage: true });

  // --- mid play ---
  const box = await page.locator("#screen canvas").boundingBox();
  if (box) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    for (let i = 0; i < 6; i++) { await page.mouse.click(cx, cy); await page.waitForTimeout(380); }
    await page.screenshot({ path: `${OUT}/${d.name}-midplay.png` });
    // let it die
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/${d.name}-death.png` });
  }

  // --- sign-in sheet (via Ranked) ---
  await page.locator('#mode button[data-m="ranked"]').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${d.name}-signin.png` });
  await page.locator("#signin .close").click();
  await page.waitForTimeout(300);

  // --- complaints ---
  await page.locator("#complain-link").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${d.name}-complain.png` });
  await page.locator("#complain .close").click();
  await page.waitForTimeout(300);

  // --- loyalty center ---
  await page.locator('.nav-b[data-s="pod"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${d.name}-pod.png` });
  await page.screenshot({ path: `${OUT}/${d.name}-pod-full.png`, fullPage: true });

  // --- shop ---
  await page.locator('.nav-b[data-s="shop"]').click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${d.name}-shop.png` });
  await page.screenshot({ path: `${OUT}/${d.name}-shop-full.png`, fullPage: true });

  await ctx.close();
}

writeFileSync(`${OUT}/geometry.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
