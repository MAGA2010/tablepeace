import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
for(const file of ["dist/index.html","dist/styles.css","dist/app.js","dist/engine.js","dist/protocol.js","dist/favicon.svg","dist/live.html","dist/live.js","dist/live.css"])await access(path.join(root,file));
process.stdout.write("Buildless static site is ready in dist/.\n");
