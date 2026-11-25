import { Interface, getAddress, formatUnits } from "ethers";
import { assertDesk, parseEvent, tokenABI } from "./protocol.mjs";
import { proofFromHash } from "./verify.mjs";

const tokenInterface = new Interface(tokenABI);
const isHash = (value) => /^0x[0-9a-f]{64}$/i.test(value);
export function exactToken(value) {
  const [whole, fractional] = formatUnits(value, 6).split(".");
  return whole + "." + fractional.padEnd(2, "0");
}

async function canonicalReceipt(provider, hash) {
  const receipt = await provider.getTransactionReceipt(hash);
  if (!receipt?.to || receipt.status !== 1)
    throw Error("Missing successful transaction " + hash);
  const block = await provider.getBlock(receipt.blockNumber);
  if (block?.hash !== receipt.blockHash)
    throw Error("Transaction left the canonical chain.");
  return receipt;
}

function hasTransfer(receipt, token, from, to, amount) {
  return receipt.logs.some((log) => {
    if (getAddress(log.address) !== token) return false;
    const event = tokenInterface.parseLog(log);
    return (
      event?.name === "Transfer" &&
      event.args.from === from &&
      event.args.to === to &&
      event.args.value === amount
    );
  });
}

function comesBefore(a, b) {
  return (
    a.blockNumber < b.blockNumber ||
    (a.blockNumber === b.blockNumber && a.index < b.index)
  );
}

// Every accepted lot contributes a positive payout, so a missing lot fails the final balance check.
export async function auditRoute(provider, { funding, settlement, settlements, refund }) {
  const payments = settlements ?? [settlement];
  if (!Array.isArray(payments) || !payments.length) throw Error("Enter at least one payment hash.");
  const hashes = [funding, ...payments, refund];
  if (!hashes.every(isHash) || new Set(hashes.map(h => h.toLowerCase())).size !== hashes.length)
    throw Error("Enter distinct 32-byte transaction hashes.");
  const [opened, closed] = await Promise.all([funding, refund].map(hash => canonicalReceipt(provider,hash)));
  const desk = await assertDesk(provider, opened.to);
  if (!comesBefore(opened, closed)) throw Error("Expected funding, settlement and refund in that order.");
  if (getAddress(closed.to) !== desk.target) throw Error("Different refund contract.");
  const open = parseEvent(opened, desk, "Opened");
  const close = parseEvent(closed, desk, "Closed");
  if (open.route !== close.route || open.owner !== close.owner) throw Error("Refund belongs to another route.");
  const proofs = [];
  const receipts = [];
  for (const hash of payments) {
    const paid = await canonicalReceipt(provider,hash);
    if (!comesBefore(opened,paid) || !comesBefore(paid,closed)) throw Error("Expected funding, settlement and refund in that order.");
    const proof = await proofFromHash(provider,desk,hash);
    if (open.route !== proof.route || open.carrier !== proof.carrier) throw Error("Payment belongs to another route.");
    proofs.push(proof);
    receipts.push(paid);
  }
  const [proof] = proofs;
  const [route, token] = await Promise.all([
    desk.routeOf(open.route),
    desk.token(),
  ]);
  const payout = proofs.reduce((sum,p) => sum + BigInt(p.amountBaseUnits), 0n);
  if (
    !route.closed ||
    route.owner !== open.owner ||
    route.remaining !== 0n ||
    route.terms.budget !== open.budget ||
    route.released !== payout ||
    close.returnedAmount + payout !== open.budget
  )
    throw Error("The route does not reconcile to the supplied payments and refund.");
  if (
    !hasTransfer(opened, token, open.owner, desk.target, open.budget) ||
    (close.returnedAmount > 0n &&
      !hasTransfer(
        closed,
        token,
        desk.target,
        open.owner,
        close.returnedAmount,
      ))
  )
    throw Error("Funding or refund token transfer does not match the route.");

  const evidence = (receipt) => ({
    hash: receipt.hash,
    block: receipt.blockNumber,
    blockHash: receipt.blockHash,
  });
  return {
    version: 1,
    chainId: proof.chainId,
    contract: desk.target,
    token,
    route: open.route,
    buyer: open.owner,
    carrier: proof.carrier,
    station: route.terms.station,
    agent: route.terms.agent,
    fundedBaseUnits: String(open.budget),
    paidBaseUnits: String(payout),
    refundedBaseUnits: String(close.returnedAmount),
    remainingBaseUnits: "0",
    unitPriceBaseUnits: String(route.terms.unitPrice),
    limits: {
      maxCrates: Number(route.terms.maxCrates),
      low: Number(route.terms.floor),
      high: Number(route.terms.ceiling),
      expiry: Number(route.terms.expiry),
    },
    funding: evidence(opened),
    ...(proofs.length === 1 ? {settlement: evidence(receipts[0]), proof} : {}),
    payments: proofs.map((item,i) => ({receipt:evidence(receipts[i]),proof:item})),
    refund: evidence(closed),
  };
}
