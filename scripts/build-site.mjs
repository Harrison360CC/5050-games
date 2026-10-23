import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const r = await build({ entryPoints: ["src/site.ts"], bundle: true, minify: true, format: "iife", target: "es2020", write: false });
// Replace with a FUNCTION, not a string: in a replacement string "$&", "$`" and
// "$'" are substitution patterns, so any dollar sign in the bundle (template
// literals, money strings) silently corrupts the output.
const js = r.outputFiles[0].text;
if (js.includes("</script")) throw new Error("bundle contains </script, cannot inline");
const html = readFileSync("site/index.html", "utf8").replace("<!--JS-->", () => `<script>${js}</script>`);
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
// Prove the thing we are about to deploy actually parses. The last corruption
// here shipped a page that rendered its chrome and ran no game at all.
try { new Function(js); } catch (e) { throw new Error("built bundle does not parse: " + e.message); }
console.log("dist/ built", (html.length / 1024).toFixed(1), "KB index");
