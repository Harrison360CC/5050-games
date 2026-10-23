import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
// The icon is the wordmark: 50/50 with the slash in the accent, on the dark ground.
const page = `<html><body style="margin:0"><canvas id="c"></canvas><script>
window.draw = (S, maskable) => {
  const c = document.getElementById("c"); c.width = S; c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#161615"; x.fillRect(0,0,S,S);
  const pad = maskable ? S*0.18 : S*0.06;
  x.font = "bold " + Math.round((S - pad*2)/2.35) + "px ui-monospace, Menlo, monospace";
  x.textAlign = "center"; x.textBaseline = "middle";
  const y1 = S*0.37, y2 = S*0.65;
  x.fillStyle = "#ECEAE4"; x.fillText("50", S/2, y1);
  x.fillStyle = "#ECEAE4"; x.fillText("50", S/2, y2);
  x.strokeStyle = "#FF8B2E"; x.lineWidth = Math.max(3, S*0.055); x.lineCap = "round";
  x.beginPath(); x.moveTo(S*0.30, S*0.60); x.lineTo(S*0.70, S*0.40); x.stroke();
  return c.toDataURL("image/png");
};
</script></body></html>`;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage();
await p.setContent(page);
for (const [name, size, maskable] of [["icon-192.png",192,false],["icon-512.png",512,false],["icon-maskable-512.png",512,true],["apple-touch-icon.png",180,false]]) {
  const url = await p.evaluate(([s,m]) => window.draw(s,m), [size, maskable]);
  writeFileSync(`site/icons/${name}`, Buffer.from(url.split(",")[1], "base64"));
  console.log("wrote", name);
}
await b.close();
