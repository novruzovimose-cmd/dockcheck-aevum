import { TypedDataEncoder, getAddress, verifyTypedData } from "ethers";
import { domain, ticketTypes } from "./protocol.mjs";

const dispositionTypes = { ReceivingException: [
  { name: "ticketHash", type: "bytes32" },
  { name: "delivered", type: "uint32" },
  { name: "reason", type: "string" },
] };
export const holdReasons = ["Packaging damage", "Missing seal", "Quality inspection"];

export function reconcileCounts(delivered, accepted, reason) {
  for (const count of [delivered, accepted]) {
    if (!Number.isSafeInteger(count) || count < 0 || count > 4294967295)
      throw Error("Enter whole crate counts between zero and 4294967295.");
  }
  if (!delivered || accepted > delivered) throw Error("Accepted crates cannot exceed the delivered count. Enter at least one delivered crate.");
  const held = delivered - accepted;
  if (held && !holdReasons.includes(reason)) throw Error("Select a reason for the held crates.");
  return { delivered, accepted, held, reason: held ? reason : "" };
}

function message(scope, ticket, delivered, reason) {
  return { ticketHash: TypedDataEncoder.hash(scope, ticketTypes, ticket), delivered, reason };
}

export async function attestException(station, envelope, counts) {
  const { delivered, held, reason } = reconcileCounts(counts.delivered, envelope.ticket.crates, counts.reason);
  if (!held) return envelope;
  const scope = domain(envelope.chainId, envelope.contract);
  const signature = await station.signTypedData(scope, dispositionTypes, message(scope, envelope.ticket, delivered, reason));
  const result = { ...envelope, exception: { delivered, reason, signature } };
  verifyException(result, await station.getAddress());
  return result;
}

export function verifyException(envelope, expectedStation) {
  const { ticket, exception } = envelope;
  if (!exception) throw Error("This file has no signed receiving exception.");
  const counts = reconcileCounts(exception.delivered, ticket.crates, exception.reason);
  if (!counts.held) throw Error("The exception must identify held crates.");
  const scope = domain(envelope.chainId, envelope.contract);
  const signer = getAddress(expectedStation);
  if (verifyTypedData(scope, ticketTypes, ticket, envelope.stationSig) !== signer ||
      verifyTypedData(scope, dispositionTypes, message(scope, ticket, counts.delivered, counts.reason), exception.signature) !== signer)
    throw Error("The ticket or exception signature differs from the assigned station.");
  return counts;
}
