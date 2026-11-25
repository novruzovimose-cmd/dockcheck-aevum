// Turn an independently verified settlement into one idempotent accounting entry.
import { TypedDataEncoder } from "ethers";
import { domain, ticketTypes } from "./protocol.mjs";
import { inspectSettlement } from "./verify.mjs";
import { verifyException } from "./disposition.mjs";

export async function reconcilePayable(provider, hash, record) {
  const { proof, terms } = await inspectSettlement(provider, hash);
  let inspection = null;
  if (record !== undefined) {
    inspection = verifyException(record, terms.station);
    const digest = TypedDataEncoder.hash(domain(record.chainId, record.contract), ticketTypes, record.ticket);
    if (digest !== proof.ticketHash) throw Error("This inspection belongs to a different payment.");
  }
  return {
    version: 1,
    entryId: [proof.chainId, proof.contract.toLowerCase(), proof.route, proof.lot].join("/"),
    transactionHash: proof.transactionHash,
    blockHash: proof.blockHash,
    chainId: proof.chainId,
    carrier: proof.carrier,
    amountBaseUnits: proof.amountBaseUnits,
    accepted: Number(proof.crates),
    inspection,
  };
}
