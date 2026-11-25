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
import { auditRoute } from "../src/audit.mjs";
import { verifyPayment, proofFromHash } from "../src/verify.mjs";
let s, p, closeHash;
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
  closeHash = (await (await s.contract.close(s.route)).wait()).hash;
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

test("closed route reconciles the mined deposit, payout and refund", async () => {
  const report = await auditRoute(s.provider, {
    funding: s.openHash,
    settlement: p.transactionHash,
    refund: closeHash,
  });
  assert.equal(report.fundedBaseUnits, "4500000");
  assert.equal(report.paidBaseUnits, "750000");
  assert.equal(report.refundedBaseUnits, "3750000");
});
test("a mismatched order or an invented transaction cannot yield an audit", async () => {
  await assert.rejects(
    auditRoute(s.provider, {
      funding: closeHash,
      settlement: p.transactionHash,
      refund: s.openHash,
    }),
    /that order/,
  );
  await assert.rejects(
    auditRoute(s.provider, {
      funding: s.openHash,
      settlement: p.transactionHash,
      refund: "0x" + "00".repeat(32),
    }),
    /Missing successful/,
  );
});

test("accounting verifies the attachment against the specific paid lot; repeated imports retain their ID", async () => {
  const { reconcilePayable } = await import("../src/payable.mjs");
  const { attestException } = await import("../src/disposition.mjs");
  const signed = await attestException(s.station,p.envelope,{delivered:8,reason:"Packaging damage"});
  const result = await reconcilePayable(s.provider,p.transactionHash,signed);
  const bare = await reconcilePayable(s.provider,p.transactionHash);
  assert.equal(result.entryId,bare.entryId);
  assert.equal(bare.inspection,null);
  assert.equal(result.inspection.held,2);
  const other = await stationTicket(s,{lot:randomId(),crates:6,low:24,high:67});
  const otherRecord = await attestException(s.station,other,{delivered:8,reason:"Packaging damage"});
  await assert.rejects(reconcilePayable(s.provider,p.transactionHash,otherRecord),/different payment/);
});
test("multi-lot closeout accepts unordered receipts and rejects omitted or repeated payouts", async () => {
  const route = await localSession(ganache);
  try {
    const hashes = [];
    for (const crates of [2,3]) {
      const e = await stationTicket(route,{lot:randomId(),crates,low:24,high:67});
      const release = await releaseFor(route.contract,31337,e,route.agent);
      hashes.push((await settleSigned(route.contract,e,release)).transactionHash);
    }
    const refund = (await (await route.contract.close(route.route)).wait()).hash;
    const check = settlements => auditRoute(route.provider,{funding:route.openHash,settlements,refund});
    const audit = await check([...hashes].reverse());
    assert.equal(audit.paidBaseUnits,"625000");
    assert.equal(audit.refundedBaseUnits,"3875000");
    assert.equal(audit.payments.length,2);
    await assert.rejects(check(hashes.slice(0,1)),/reconcile/);
    await assert.rejects(check([hashes[0],hashes[0]]),/distinct/);
  } finally { await route.raw.disconnect(); }
});
