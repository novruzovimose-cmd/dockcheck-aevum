import {
  AbiCoder,
  BrowserProvider,
  Contract,
  ContractFactory,
  TypedDataEncoder,
  Wallet,
  getAddress,
  hexlify,
  id,
  keccak256,
  randomBytes,
  verifyTypedData,
} from "ethers";
import desk from "../artifacts/DockCheck.json" with { type: "json" };
import localToken from "../artifacts/RehearsalToken.json" with { type: "json" };

export const net = {
  id: 44005,
  hex: "0xabe5",
  rpc: "https://rpc-test.qday.info",
  explorer: "https://explorer-test.qday.info",
  token: "0x456569838f1d43009A91ebA4263147Afd7233483",
};
export const tokenABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "event Transfer(address indexed from,address indexed to,uint256 value)",
];
export const ticketTypes = {
  Ticket: [
    ["route", "bytes32"],
    ["lot", "bytes32"],
    ["crates", "uint32"],
    ["low", "int16"],
    ["high", "int16"],
    ["observedAt", "uint64"],
  ].map(([name, type]) => ({ name, type })),
};
export const releaseTypes = {
  Release: [{ name: "ticketHash", type: "bytes32" }],
};
export const domain = (chainId, verifyingContract) => ({
  name: "DockCheck",
  version: "1",
  chainId,
  verifyingContract,
});
export const randomId = () => hexlify(randomBytes(32));
export const routeId = (owner, salt) =>
  keccak256(
    AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [owner, salt]),
  );
export const asJSON = (data) =>
  JSON.stringify(data, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2);
export { desk, localToken };
export const money = (v) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(Number(v) / 1e6);
export function parseEvent(receipt, contract, name) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== contract.target.toLowerCase()) continue;
    try {
      const e = contract.interface.parseLog(log);
      if (e?.name === name) return e.args;
    } catch {}
  }
  throw Error("Receipt does not contain " + name + " from DockCheck.");
}
export async function assertDesk(provider, address) {
  address = getAddress(address);
  const chain = (await provider.getNetwork()).chainId;
  if (chain !== 44005n && chain !== 31337n)
    throw Error("Switch to QDay Aevum testnet.");
  if (keccak256(await provider.getCode(address)) !== keccak256(desk.runtime))
    throw Error("Deployed bytecode differs from this DockCheck release.");
  const contract = new Contract(address, desk.abi, provider);
  if (chain === 44005n && getAddress(await contract.token()) !== net.token)
    throw Error("Unexpected token on Aevum.");
  return contract;
}
export const head = async (provider) =>
  Number((await provider.getBlock("latest")).timestamp);
export async function deployDesk(signer, token) {
  const contract = await new ContractFactory(
    desk.abi,
    desk.bytecode,
    signer,
  ).deploy(token);
  await contract.waitForDeployment();
  await assertDesk(signer.provider, contract.target);
  return contract;
}
export function demoTerms(carrier, station, agent, now) {
  return {
    carrier,
    station,
    agent,
    unitPrice: 125000,
    budget: 4500000,
    maxCrates: 12,
    floor: 20,
    ceiling: 80,
    expiry: now + 86400,
  };
}
export async function localSession(injected) {
  const raw = injected.provider({
    chain: { chainId: 31337, hardfork: "shanghai" },
    wallet: { totalAccounts: 2 },
    logging: { quiet: true },
  });
  const provider = new BrowserProvider(raw, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 80;
  const buyer = await provider.getSigner(0);
  const carrier = await (await provider.getSigner(1)).getAddress();
  const station = Wallet.createRandom(),
    agent = Wallet.createRandom();
  const token = await new ContractFactory(
    localToken.abi,
    localToken.bytecode,
    buyer,
  ).deploy();
  await token.waitForDeployment();
  const contract = await deployDesk(buyer, token.target);
  const terms = demoTerms(
    carrier,
    station.address,
    agent.address,
    await head(provider),
  );
  await (await token.approve(contract.target, terms.budget)).wait();
  const salt = randomId(),
    receipt = await (await contract.open(salt, terms)).wait();
  return {
    chainId: 31337,
    provider,
    buyer,
    carrier,
    station,
    agent,
    contract,
    token,
    route: parseEvent(receipt, contract, "Opened").route,
    openBlock: receipt.blockNumber,
    openHash: receipt.hash,
    terms,
    raw,
  };
}
export async function stationTicket(session, values) {
  const t = {
    ...values,
    route: session.route,
    observedAt: await head(session.provider),
  };
  const d = domain(session.chainId, session.contract.target);
  return {
    version: 1,
    chainId: session.chainId,
    contract: session.contract.target,
    ticket: t,
    stationSig: await session.station.signTypedData(d, ticketTypes, t),
  };
}
export async function releaseFor(contract, chainId, envelope, agent) {
  if (
    Number(envelope.chainId) !== Number(chainId) ||
    getAddress(envelope.contract) !== getAddress(contract.target)
  )
    throw Error("Ticket belongs to another network or contract.");
  const t = envelope.ticket,
    d = domain(chainId, contract.target),
    r = await contract.routeOf(t.route);
  if (
    verifyTypedData(d, ticketTypes, t, envelope.stationSig) !== r.terms.station
  )
    throw Error("Receiving station signature does not match this route.");
  if (getAddress(await agent.getAddress()) !== r.terms.agent)
    throw Error("Agent key does not match this route.");
  const amount = await contract.quote(t);
  const ticketHash = TypedDataEncoder.hash(d, ticketTypes, t);
  const sig = await agent.signTypedData(d, releaseTypes, { ticketHash });
  await contract.settle.staticCall(t, envelope.stationSig, sig);
  return { amount, agentSig: sig, ticketHash };
}
export async function settleSigned(
  contract,
  envelope,
  release,
  onBroadcast = () => {},
) {
  const tx = await contract.settle(
    envelope.ticket,
    envelope.stationSig,
    release.agentSig,
  );
  await onBroadcast(tx.hash);
  const receipt = await tx.wait(1);
  const event = parseEvent(receipt, contract, "Settled");
  return {
    version: 1,
    chainId: envelope.chainId,
    contract: contract.target,
    transactionHash: receipt.hash,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    route: event.route,
    lot: event.lot,
    carrier: event.carrier,
    crates: String(event.crates),
    amountBaseUnits: String(event.amount),
    ticketHash: event.ticketHash,
    envelope,
    agentSig: release.agentSig,
  };
}
const reasons = {
  LotAlreadyPaid: "This lot has already been paid. No second payment was sent.",
  TemperatureOutsideBand:
    "The recorded temperature is outside the route’s permitted range.",
  StaleObservation:
    "The observation must be from this route and less than one hour old.",
  InsufficientBudget: "The remaining route budget cannot cover this receipt.",
  InvalidQuantity: "The crate count exceeds the per-receipt cap or is zero.",
  RouteUnavailable: "This route is closed, expired, or unavailable.",
  NotOwner: "Only the buyer who opened this route can revoke it.",
  BadTerms: "Check the role addresses, amount, caps, and expiry.",
  StationSignature: "The station signature did not match.",
  AgentSignature: "The agent signature did not match.",
};
export function policyErrorName(e, contract) {
  const raw = e?.data?.data ?? e?.data ?? e?.info?.error?.data?.result;
  let name = e?.revert?.name;
  if (typeof raw === "string" && contract) {
    try {
      name = contract.interface.parseError(raw)?.name || name;
    } catch {}
  }
  return name;
}
export function describeError(e, contract) {
  if (e?.code === 4001 || e?.code === "ACTION_REJECTED")
    return "Wallet request declined.";
  return (
    reasons[policyErrorName(e, contract)] ||
    e?.shortMessage ||
    e?.message ||
    "Request failed. Check the network and try again."
  );
}
export const fixtureLot = (route, n) =>
  id("DockCheck fictional lot / " + route + " / " + n);
