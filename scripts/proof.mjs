import { verifyPayment, inspectSettlement } from "../src/verify.mjs";
import { asJSON } from "../src/protocol.mjs";
import { live, readJSON, fail } from "./live-lib.mjs";
async function run() {
  const f = process.argv[2];
  if (!f) throw Error("Usage: npm run proof -- evidence.json");
  if (f === "--tx") {
    const { provider } = await live();
    const { proof } = await inspectSettlement(provider, process.argv[3]);
    console.log(asJSON(proof));
    return;
  }
  const data = readJSON(f);
  if (Number(data.chainId) !== 44005)
    throw Error(
      "This is a local receipt. Run npm run demo to reproduce and verify a fresh rehearsal.",
    );
  const { provider } = await live();
  const list = data.events
    ? data.events.flatMap((e) => (e.proof ? [e.proof] : []))
    : [data];
  if (!list.length) throw Error("No settled payments in this export.");
  for (const p of list) console.log(asJSON(await verifyPayment(provider, p)));
}
run().catch(fail);
