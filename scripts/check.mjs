import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
for(const file of ["dist/app.js","dist/engine.js","scripts/serve.mjs"]){
 const result=spawnSync(process.execPath,["--check",path.join(root,file)],{stdio:"inherit"});
 if(result.status!==0)process.exit(result.status||1);
}
process.stdout.write("JavaScript syntax checks passed.\n");
