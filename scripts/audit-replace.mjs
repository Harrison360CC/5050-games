import { build } from "esbuild";
import fs from "node:fs";
const r = await build({entryPoints:["src/site.ts"],bundle:true,minify:true,format:"iife",target:"es2020",write:false});
const orig = r.outputFiles[0].text;
const inl = fs.readFileSync("/tmp/inline.js","utf8");
console.log("esbuild output len", orig.length, "| inlined len", inl.length, "| delta", inl.length-orig.length);
let k=0; while(k<Math.min(orig.length,inl.length)&&orig[k]===inl[k]) k++;
console.log("first divergence at char", k);
console.log("ESBUILD :", JSON.stringify(orig.slice(k-70,k+70)));
console.log("IN HTML :", JSON.stringify(inl.slice(k-70,k+70)));
const pats = {"$&":"$&","$`":"$`","$'":"$'","$$":"$$"};
for (const [n,p] of Object.entries(pats)) console.log(`occurrences of ${JSON.stringify(n)} in esbuild output:`, orig.split(p).length-1);
// prove the mechanism
const html = fs.readFileSync("site/index.html","utf8");
const viaReplace = html.replace("<!--JS-->", `<script>${orig}</script>`);
const viaFn      = html.replace("<!--JS-->", () => `<script>${orig}</script>`);
console.log("built with .replace(str,str) length:", viaReplace.length, "| with replacer fn:", viaFn.length, "| difference:", viaReplace.length-viaFn.length);
