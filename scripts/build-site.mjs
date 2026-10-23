import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const r = await build({ entryPoints: ["src/site.ts"], bundle: true, minify: true, format: "iife", target: "es2020", write: false });
const html = readFileSync("site/index.html", "utf8").replace("<!--JS-->", `<script>${r.outputFiles[0].text}</script>`);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
// static pages, served at clean URLs by Cloudflare Pages (/rules -> rules.html)
for (const p of ["rules", "privacy", "ledger"]) copyFileSync(`site/${p}.html`, `dist/${p}.html`);
copyFileSync("site/ads.txt", "dist/ads.txt");
copyFileSync("site/manifest.webmanifest", "dist/manifest.webmanifest");
mkdirSync("dist/icons", { recursive: true });
for (const i of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "og.png"]) {
  try { copyFileSync(`site/icons/${i}`, `dist/icons/${i}`); } catch {}
}
console.log("dist/ built", (html.length / 1024).toFixed(1), "KB index");
