import {
  describeError,
  fixtureLot,
  localSession,
  money,
  parseEvent,
  policyErrorName,
  releaseFor,
  settleSigned,
  stationTicket,
} from "./protocol.mjs";
import { auditRoute } from "./audit.mjs";
import { proofFromHash } from "./verify.mjs";

// Run the same Solidity path in the browser and in the reproducible CLI transcript.
export async function runRehearsal(engine, report = () => {}) {
  const session = await localSession(engine);
  const { provider, contract, token, route, agent, carrier, buyer, terms } =
    session;
  const steps = [];
  function log(step, data) {
    const entry = { step, ...data };
    steps.push(entry);
    report(entry);
  }
  try {
    log("Fund route", {
      chainId: 31337,
      contract: contract.target,
      owner: await buyer.getAddress(),
      carrier,
      station: session.station.address,
      agent: agent.address,
      openTx: session.openHash,
      budget: money(terms.budget) + " LOCAL",
      rate: money(terms.unitPrice) + " LOCAL",
      temperature: "2.0 to 8.0 C",
      maxCrates: terms.maxCrates,
    });
    const good = await stationTicket(session, {
      lot: fixtureLot(route, 1),
      crates: 6,
      low: 24,
      high: 67,
    });
    const release = await releaseFor(contract, 31337, good, agent);
    log("Review signed receipt", {
      crates: 6,
      lowC: 2.4,
      highC: 6.7,
      authorized: money(release.amount) + " LOCAL",
      ticketHash: release.ticketHash,
    });

    const before = await token.balanceOf(carrier);
    const settlement = await settleSigned(contract, good, release);
    const proof = await proofFromHash(
      provider,
      contract,
      settlement.transactionHash,
    );
    const after = await token.balanceOf(carrier);
    if (
      after - before !== release.amount ||
      proof.ticketHash !== release.ticketHash
    )
      throw Error("The mined transfer did not match the authorized receipt.");
    log("Confirm carrier payment", {
      verified: true,
      chainId: proof.chainId,
      contract: proof.contract,
      carrier,
      amountBaseUnits: proof.amountBaseUnits,
      block: proof.blockNumber,
      transactionHash: proof.transactionHash,
    });

    const bookedEscrow = await token.balanceOf(contract.target);
    const warm = await stationTicket(session, {
      lot: fixtureLot(route, 2),
      crates: 6,
      low: 24,
      high: 103,
    });
    for (const [label, envelope, expected] of [
      ["Hold warm shipment", warm, "TemperatureOutsideBand"],
      ["Hold duplicate receipt", good, "LotAlreadyPaid"],
    ]) {
      let rejection;
      try {
        await releaseFor(contract, 31337, envelope, agent);
      } catch (error) {
        if (policyErrorName(error, contract) !== expected) throw error;
        rejection = error;
      }
      if (!rejection) throw Error("Expected hold: " + label);
      const [escrow, payout] = await Promise.all([
        token.balanceOf(contract.target),
        token.balanceOf(carrier),
      ]);
      if (escrow !== bookedEscrow || payout !== after)
        throw Error("A held delivery changed balances.");
      log(label, {
        decision: "Held before broadcast",
        reason: describeError(rejection, contract),
        escrow: money(escrow) + " LOCAL",
        carrier: money(payout) + " LOCAL",
      });
    }

    const buyerAddress = await buyer.getAddress();
    const buyerBeforeRefund = await token.balanceOf(buyerAddress);
    const close = await (await contract.close(route)).wait();
    const refund = parseEvent(close, contract, "Closed").returnedAmount;
    const final = await contract.routeOf(route);
    if (
      !final.closed ||
      final.remaining !== 0n ||
      refund + release.amount !== BigInt(terms.budget) ||
      (await token.balanceOf(buyerAddress)) - buyerBeforeRefund !== refund
    )
      throw Error("The refund did not reconcile with the funded budget.");
    try {
      await releaseFor(
        contract,
        31337,
        await stationTicket(session, {
          lot: fixtureLot(route, 3),
          crates: 6,
          low: 24,
          high: 67,
        }),
        agent,
      );
      throw Error("The closed route accepted a new release.");
    } catch (error) {
      if (policyErrorName(error, contract) !== "RouteUnavailable") throw error;
    }
    const audit = await auditRoute(provider, {
      funding: session.openHash,
      settlement: proof.transactionHash,
      refund: close.hash,
    });
    log("Revoke and refund", {
      refund: money(refund) + " LOCAL",
      escrow: money(final.remaining) + " LOCAL",
      totalPaid: money(final.released) + " LOCAL",
      transactionHash: close.hash,
    });
    return {
      environment: "Ephemeral local EVM, chain 31337",
      steps,
      proof,
      audit,
    };
  } finally {
    await session.raw.disconnect();
  }
}
