// Rebuild once per edit batch. A change arriving during a build queues another pass.
import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
let dirty = true,
  running = false,
  server;
const watchers = [];
async function step(file) {
  const child = spawn(process.execPath, ["scripts/" + file], {
    stdio: "inherit",
  });
  return (await once(child, "exit"))[0] === 0;
}
async function rebuild() {
  dirty = true;
  if (running) return;
  running = true;
  try {
    while (dirty) {
      dirty = false;
      if (!(await step("compile.mjs")) || !(await step("build.mjs"))) continue;
      if (!server) {
        server = spawn(process.execPath, ["scripts/serve.mjs"], {
          stdio: "inherit",
        });
        server.once("exit", (code) => {
          for (const watcher of watchers) watcher.close();
          process.exitCode = code || 0;
        });
      }
      console.log("Desk rebuilt. Refresh your browser.");
    }
  } finally {
    running = false;
  }
}
for (const folder of ["src", "public", "contracts", "evidence"])
  watchers.push(
    watch(folder, { recursive: true }, () =>
      rebuild().catch((err) => console.error(err.message)),
    ),
  );
for (const sig of ["SIGINT", "SIGTERM"])
  process.once(sig, () => {
    for (const w of watchers) w.close();
    server?.kill();
    process.exit(0);
  });
await rebuild();
