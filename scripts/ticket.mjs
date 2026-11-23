import { getAddress } from "ethers";
import { domain, head, ticketTypes } from "../src/protocol.mjs";
import {
  attached,
  fail,
  live,
  need,
  readJSON,
  wallet,
  writeJSON,
} from "./live-lib.mjs";
async function run() {
  const [input, out] = process.argv.slice(2);
  if (!input || !out)
    throw Error("Usage: npm run ticket -- measurement.json ticket.json");
  const { provider } = await live(),
    c = await attached(provider),
    r = await c.routeOf(need("ROUTE_ID")),
    station = wallet("STATION_KEY");
  if (station.address !== r.terms.station)
    throw Error("This station is outside the route policy.");
  const m = readJSON(input);
  if (
    !/^0x[0-9a-f]{64}$/i.test(m.lot) ||
    !Number.isInteger(m.crates) ||
    !Number.isInteger(m.low) ||
    !Number.isInteger(m.high)
  )
    throw Error(
      "Supply a stable 32-byte lot, integer crates, and integer tenths of a degree.",
    );
  const t = {
    route: need("ROUTE_ID"),
    lot: m.lot,
    crates: m.crates,
    low: m.low,
    high: m.high,
    observedAt: m.observedAt === "now" ? await head(provider) : m.observedAt,
  };
  if (!Number.isSafeInteger(t.observedAt) || t.observedAt <= 0)
    throw Error(
      "Use the measured Unix time, or explicitly request now for a demo.",
    );
  const stationSig = await station.signTypedData(
    domain(44005, c.target),
    ticketTypes,
    t,
  );
  writeJSON(out, {
    version: 1,
    chainId: 44005,
    contract: c.target,
    ticket: t,
    stationSig,
  });
  console.log("Signed station ticket: " + out);
}
run().catch(fail);
