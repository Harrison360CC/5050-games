import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const r = await build({ entryPoints: ["src/site.ts"], bundle: true, minify: true, format: "iife", target: "es2020", write: false });
const html = readFileSync("site/index.html", "utf8").replace("<!--JS-->", `<script>${r.outputFiles[0].text}</script>`);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
// static pages, served at clean URLs by Cloudflare Pages (/rules -> rules.html)
for (const p of ["rules", "privacy", "ledger"]) copyFileSync(`site/${p}.html`, `dist/${p}.html`);
console.log("dist/ built", (html.length / 1024).toFixed(1), "KB index");
