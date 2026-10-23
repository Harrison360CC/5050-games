import { build } from "esbuild";
import fs from "node:fs";
const r = await build({entryPoints:["src/site.ts"],bundle:true,minify:true,format:"iife",target:"es2020",write:false});
const o = r.outputFiles[0].text;
let i = o.indexOf("$&");
while (i !== -1) { console.log("$& at", i, ":", JSON.stringify(o.slice(i-100, i+60))); i = o.indexOf("$&", i+1); }
const html = fs.readFileSync("site/index.html","utf8");
const A = html.replace("<!--JS-->", `<script>${o}</script>`);
const B = html.replace("<!--JS-->", () => `<script>${o}</script>`);
console.log("\nstring-replacement build:", A.length, " replacer-fn build:", B.length, " corruption:", A.length-B.length, "chars");
// what actually got written
const dist = fs.readFileSync("dist/index.html","utf8");
console.log("dist matches string-replacement build:", dist === A, "| matches clean build:", dist === B);
let k=0; while(k<Math.min(A.length,B.length)&&A[k]===B[k])k++;
console.log("corruption site:", JSON.stringify(A.slice(Math.max(0,k-80), k+80)));
console.log("should be      :", JSON.stringify(B.slice(Math.max(0,k-80), k+80)));
// does the corrupted build still parse?
const ex=(h)=>{const i=h.lastIndexOf("<script>"),j=h.lastIndexOf("</script>");return h.slice(i+8,j);};
for (const [n,h] of [["string-replace",A],["replacer-fn",B]]) {
  fs.writeFileSync(`/tmp/chk-${n}.js`, ex(h));
}
