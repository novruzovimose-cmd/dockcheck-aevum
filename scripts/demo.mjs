import fs from "node:fs";
import ganache from "ganache";
import { asJSON } from "../src/protocol.mjs";
import { runRehearsal } from "../src/rehearsal.mjs";

const directory = process.argv[2] || "runtime-output";
fs.mkdirSync(directory, { recursive: true });
const run = await runRehearsal(ganache, ({ step, ...data }) =>
  console.log(step, asJSON(data)),
);
fs.writeFileSync(directory + "/local-run.json", asJSON(run) + "\n");
