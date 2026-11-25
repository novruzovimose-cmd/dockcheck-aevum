// A receiving system can use entryId as a unique database key.
import { reconcilePayable } from "../src/payable.mjs";
import { live, readJSON, fail } from "../scripts/live-lib.mjs";

async function run() {
  const [hash, file] = process.argv.slice(2);
  if (!hash) throw Error("Usage: npm run payable -- PAYMENT_TX [SIGNED_TICKET.json]");
  const record = file ? readJSON(file) : undefined;
  const { provider } = await live();
  try {
    console.log(JSON.stringify(await reconcilePayable(provider, hash, record), null, 2));
  } finally { provider.destroy(); }
}
run().catch(fail);
