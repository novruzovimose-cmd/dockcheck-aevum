import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("dist", { recursive: true });
fs.cpSync("public", "dist", { recursive: true });
await build({
  entryPoints: ["src/app.mjs"],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/desk.js",
  legalComments: "eof",
});
fs.copyFileSync(
  "node_modules/ganache/dist/web/ganache.min.js",
  "dist/local-evm.js",
);
fs.copyFileSync(
  "node_modules/ganache/dist/web/ganache.min.js.LICENSE.txt",
  "dist/local-evm.js.LICENSE.txt",
);
fs.copyFileSync("node_modules/ganache/LICENSE", "dist/Ganache-LICENSE");
fs.copyFileSync("artifacts/standard-input.json", "dist/standard-input.json");
fs.copyFileSync("contracts/DockCheck.sol", "dist/DockCheck.sol");
console.log("Built self-contained desk in dist/");
fs.cpSync("licenses", "dist/licenses", { recursive: true });
