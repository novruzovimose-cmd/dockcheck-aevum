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

fs.copyFileSync("delivery/DockCheck-demo.mp4", "dist/DockCheck-demo.mp4");
fs.copyFileSync("delivery/DockCheck-demo.srt", "dist/DockCheck-demo.srt");

const film = "Aevum-payment.mp4";
if (fs.existsSync("delivery/" + film)) {
  fs.copyFileSync("delivery/" + film, "dist/" + film);
  const page = fs.readFileSync("dist/index.html", "utf8");
  fs.writeFileSync("dist/index.html", page.replace("https://github.com/novruzovimose-cmd/dockcheck-aevum/releases/download/v1.6.0/Aevum-payment.mp4", "./" + film));
}
