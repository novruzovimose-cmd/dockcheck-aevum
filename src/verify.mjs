import {
  Interface,
  TypedDataEncoder,
  getAddress,
  verifyTypedData,
} from "ethers";
import {
  assertDesk,
  domain,
  net,
  parseEvent,
  releaseTypes,
  ticketTypes,
  tokenABI,
} from "./protocol.mjs";

export async function verifyPayment(provider, proof) {
  const check = (v, m) => {
    if (!v) throw Error(m);
  };
  const chainId = Number((await provider.getNetwork()).chainId);
  check(
    Number(proof.chainId) === chainId,
    "Evidence and RPC chain IDs differ.",
  );
  const desk = await assertDesk(provider, proof.contract);
  const receipt = await provider.getTransactionReceipt(proof.transactionHash);
  check(
    receipt?.status === 1 && receipt.to === desk.target,
    "Missing or unsuccessful DockCheck transaction.",
  );
  check(
    receipt.blockHash === proof.blockHash &&
      receipt.blockNumber === Number(proof.blockNumber),
    "Evidence block does not match its receipt.",
  );
  const block = await provider.getBlock(receipt.blockNumber);
  check(
    block?.hash === receipt.blockHash,
    "Receipt is outside the canonical chain.",
  );
  const e = parseEvent(receipt, desk, "Settled"),
    env = proof.envelope,
    t = env.ticket,
    d = domain(chainId, desk.target);
  check(
    getAddress(env.contract) === desk.target && Number(env.chainId) === chainId,
    "Envelope domain mismatch.",
  );
  check(
    e.route === t.route && e.lot === t.lot && e.crates === BigInt(t.crates),
    "Ticket fields differ from settlement.",
  );
  const r = await desk.routeOf(e.route),
    hash = TypedDataEncoder.hash(d, ticketTypes, t);
  check(
    hash === e.ticketHash &&
      verifyTypedData(d, ticketTypes, t, env.stationSig) === r.terms.station,
    "Invalid receiving station proof.",
  );
  check(
    verifyTypedData(d, releaseTypes, { ticketHash: hash }, proof.agentSig) ===
      r.terms.agent,
    "Invalid agent proof.",
  );
  check(
    e.carrier === r.terms.carrier && e.amount === r.terms.unitPrice * e.crates,
    "Payout violates route terms.",
  );
  check(
    e.crates > 0n &&
      e.crates <= r.terms.maxCrates &&
      BigInt(t.low) >= r.terms.floor &&
      BigInt(t.high) <= r.terms.ceiling &&
      Number(t.low) <= Number(t.high),
    "Delivery violates the route limits.",
  );
  check(
    BigInt(t.observedAt) >= r.openedAt &&
      Number(t.observedAt) <= block.timestamp &&
      block.timestamp - Number(t.observedAt) <= 3600 &&
      block.timestamp < Number(r.terms.expiry),
    "Receipt timestamp violates the policy.",
  );
  check(await desk.paid(e.route, e.lot), "On-chain replay marker missing.");
  const token = await desk.token(),
    tokenInterface = new Interface(tokenABI);
  const moves = receipt.logs
    .filter((l) => getAddress(l.address) === token)
    .flatMap((l) => {
      try {
        const x = tokenInterface.parseLog(l);
        return x?.name === "Transfer" ? [x.args] : [];
      } catch {
        return [];
      }
    });
  check(
    moves.some(
      (m) =>
        m.from === desk.target && m.to === e.carrier && m.value === e.amount,
    ),
    "Matching token transfer missing.",
  );
  for (const [k, v] of Object.entries({
    route: e.route,
    lot: e.lot,
    carrier: e.carrier,
    crates: e.crates.toString(),
    ticketHash: hash,
    amountBaseUnits: e.amount.toString(),
  }))
    check(proof[k] === v, "Exported " + k + " differs from the chain.");
  return {
    verified: true,
    chainId,
    contract: desk.target,
    token,
    carrier: e.carrier,
    amountBaseUnits: String(e.amount),
    block: receipt.blockNumber,
    transactionHash: receipt.hash,
    explorer: chainId === 44005 ? net.explorer + "/tx/" + receipt.hash : null,
  };
}

// Reconstruct evidence from the chain even if the browser lost its local archive.
export async function proofFromHash(provider, contract, hash) {
  const tx = await provider.getTransaction(hash),
    receipt = await provider.getTransactionReceipt(hash);
  if (
    !tx ||
    !receipt ||
    receipt.status !== 1 ||
    getAddress(tx.to) !== getAddress(contract.target)
  )
    throw Error("Expected a confirmed payment to the selected desk.");
  const call = contract.interface.parseTransaction({
    data: tx.data,
    value: tx.value,
  });
  if (call?.name !== "settle")
    throw Error("This transaction is not a carrier settlement.");
  const value = call.args[0];
  const ticket = {
    route: value.route,
    lot: value.lot,
    crates: Number(value.crates),
    low: Number(value.low),
    high: Number(value.high),
    observedAt: Number(value.observedAt),
  };
  const ev = parseEvent(receipt, contract, "Settled"),
    chainId = Number((await provider.getNetwork()).chainId);
  const envelope = {
    version: 1,
    chainId,
    contract: contract.target,
    ticket,
    stationSig: call.args[1],
  };
  const proof = {
    version: 1,
    chainId,
    contract: contract.target,
    transactionHash: receipt.hash,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    route: ev.route,
    lot: ev.lot,
    carrier: ev.carrier,
    crates: String(ev.crates),
    amountBaseUnits: String(ev.amount),
    ticketHash: ev.ticketHash,
    envelope,
    agentSig: call.args[2],
  };
  await verifyPayment(provider, proof);
  return proof;
}

// Resolve the recipient from the transaction itself. Callers need only the public hash.
export async function inspectSettlement(provider, hash) {
  if (!/^0x[0-9a-f]{64}$/i.test(hash))
    throw Error("Enter a 32-byte transaction hash.");
  const tx = await provider.getTransaction(hash);
  if (!tx?.to)
    throw Error("No settlement transaction was found on this network.");
  const contract = await assertDesk(provider, tx.to);
  const proof = await proofFromHash(provider, contract, hash);
  const route = await contract.routeOf(proof.route);
  return { proof, terms: route.terms };
}
