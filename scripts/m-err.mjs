import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 375, height: 667 } });
p.on("pageerror", e => console.log("PAGEERROR:", e.message));
p.on("console", m => { if (m.type() === "error") console.log("CONSOLE:", m.text()); });
await p.goto("file:///home/claude/5050-games/dist/index.html");
await p.waitForTimeout(1200);
await b.close();
