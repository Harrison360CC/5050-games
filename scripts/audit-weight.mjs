import { build } from "esbuild";
const r = await build({ entryPoints:["src/site.ts"], bundle:true, minify:true, format:"iife", target:"es2020", write:false, metafile:true });
const out = Object.values(r.metafile.outputs)[0];
const rows = Object.entries(out.inputs).map(([k,v])=>[k,v.bytesInOutput]).sort((a,b)=>b[1]-a[1]);
let sup=0, app=0;
for(const [k,b] of rows){ if(k.includes("node_modules")) sup+=b; else app+=b; }
console.log("app bytes (minified-in-bundle):", app, " node_modules:", sup);
console.log("--- top 20 inputs ---");
for(const [k,b] of rows.slice(0,20)) console.log(String(b).padStart(7), k);
console.log("--- node_modules groups ---");
const g={};
for(const [k,b] of rows) if(k.includes("node_modules")){ const m=k.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/); g[m[1]]=(g[m[1]]||0)+b; }
for(const [k,b] of Object.entries(g).sort((a,b)=>b[1]-a[1])) console.log(String(b).padStart(7), k);
