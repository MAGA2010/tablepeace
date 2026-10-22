import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../dist");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml"};
const server=http.createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const relative=pathname==="/"||pathname==="/new"?"index.html":pathname.replace(/^\/+/, "");
  const filename=path.resolve(root,relative);
  if(!filename.startsWith(root+path.sep)&&filename!==path.join(root,"index.html"))throw new Error("Invalid path");
  const body=await readFile(filename);
  res.writeHead(200,{"Content-Type":types[path.extname(filename)]||"application/octet-stream","Cache-Control":"no-store"});res.end(body);
 }catch{res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});res.end("Not found");}
});
const port=Number(process.env.PORT||4178);
server.listen(port,"127.0.0.1",()=>process.stdout.write("TablePeace demo: http://127.0.0.1:"+port+"\n"));
