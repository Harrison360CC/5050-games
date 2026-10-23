import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 420, height: 700 }, deviceScaleFactor: 2 });
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(800);
await p.click('.nav-b[data-s="shop"]');
await p.waitForTimeout(2500);
await p.screenshot({ path: "/tmp/claude-0/-home-claude/d4ae8718-6c94-5c70-925d-a2e103014186/scratchpad/shop.png" });
await b.close();
