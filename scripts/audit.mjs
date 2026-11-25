import { auditRoute } from "../src/audit.mjs";
import { asJSON } from "../src/protocol.mjs";
import { fail, live, readJSON } from "./live-lib.mjs";

async function run() {
  const args = process.argv.slice(2);
  let hashes;
  if (args.length === 1) {
    const packet = readJSON(args[0]);
    if (packet.chainId !== 44005)
      throw Error("This command verifies Aevum packets on chain 44005.");
    hashes = Object.fromEntries(
      ["funding", "settlement", "refund"].map((k) => [k, packet[k]?.hash]),
    );
    if (packet.payments) hashes.settlements = packet.payments.map(p => p.receipt.hash);
  } else if (args.length >= 3) {
    hashes = { funding: args[0], settlements: args.slice(1,-1), refund: args.at(-1) };
  } else {
    throw Error(
      "Usage: npm run audit -- packet.json OR FUNDING_TX PAYMENT_TX [PAYMENT_TX ...] REFUND_TX",
    );
  }
  const { provider } = await live();
  try {
    console.log(asJSON(await auditRoute(provider, hashes)));
  } finally {
    provider.destroy();
  }
}
run().catch(fail);
