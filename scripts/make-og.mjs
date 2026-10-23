import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(`<html><body style="margin:0;background:#161615;color:#ECEAE4;font-family:ui-monospace,Menlo,monospace;height:630px;display:flex;flex-direction:column;justify-content:center;padding:0 72px">
<div style="font-size:112px;font-weight:700;letter-spacing:-2px">50<span style="color:#FF8B2E">/</span>50</div>
<div style="font-size:46px;font-family:system-ui,sans-serif;font-weight:700;margin-top:10px;line-height:1.15">Three stupid games.<br>Top score each week takes half the ad money.</div>
<div style="font-size:26px;color:#A5A29B;margin-top:26px">play5050games.com · free · no purchase · barely any money</div>
</body></html>`);
await p.waitForTimeout(400);
await p.screenshot({ path: "site/icons/og.png" });
await b.close();
console.log("og.png written");
