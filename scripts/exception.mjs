import { readFile } from "node:fs/promises";
import { verifyException } from "../src/disposition.mjs";
try {
  const [file, station] = process.argv.slice(2);
  if (!file || !station) throw Error("Usage: npm run exception -- ticket.json ASSIGNED_STATION_ADDRESS");
  const counts = verifyException(JSON.parse(await readFile(file, "utf8")), station);
  console.log(JSON.stringify(counts, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
