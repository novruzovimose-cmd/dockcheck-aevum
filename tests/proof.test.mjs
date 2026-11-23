import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  localSession,
  stationTicket,
  randomId,
  releaseFor,
  settleSigned,
} from "../src/protocol.mjs";
import { verifyPayment, proofFromHash } from "../src/verify.mjs";
let s, p;
before(async () => {
  s = await localSession(ganache);
  const e = await stationTicket(s, {
    lot: randomId(),
    crates: 6,
    low: 24,
    high: 67,
  });
  p = await settleSigned(
    s.contract,
    e,
    await releaseFor(s.contract, 31337, e, s.agent),
  );
});
after(async () => {
  await s?.raw.disconnect();
});
test("proof matches both signatures, token movement, runtime, block and on-chain replay marker", async () => {
  const v = await verifyPayment(s.provider, p);
  assert.equal(v.verified, true);
  assert.equal(v.amountBaseUnits, "750000");
});
for (const [field, value] of [
  ["amountBaseUnits", "1"],
  ["chainId", 44005],
  ["blockHash", "0x" + "11".repeat(32)],
  ["ticketHash", "0x" + "00".repeat(32)],
])
  test("tampered evidence is rejected: " + field, async () => {
    await assert.rejects(verifyPayment(s.provider, { ...p, [field]: value }));
  });
test("proof with substituted station measurement fails", async () => {
  const altered = structuredClone(p);
  altered.envelope.ticket.high = 77;
  await assert.rejects(verifyPayment(s.provider, altered));
});
test("proof remains verifiable after the buyer revokes the route", async () => {
  await (await s.contract.close(s.route)).wait();
  assert.ok((await verifyPayment(s.provider, p)).verified);
});

test("an independent reader reconstructs a lost export from transaction calldata", async () => {
  const rebuilt = await proofFromHash(
    s.provider,
    s.contract,
    p.transactionHash,
  );
  assert.equal(rebuilt.ticketHash, p.ticketHash);
  assert.equal(rebuilt.agentSig, p.agentSig);
});
