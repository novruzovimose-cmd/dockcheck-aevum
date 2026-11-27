import { AbiCoder, Contract, ContractFactory, Interface, Wallet, getAddress, id, keccak256 } from "ethers";
import reserve from "../artifacts/DeliveryReserve.json" with { type: "json" };
import { head, localSession, randomId, tokenABI } from "./protocol.mjs";

export const reserveFactory = signer => new ContractFactory(reserve.abi, reserve.bytecode, signer);
export const reserveAt = (address, signer) => new Contract(address, reserve.abi, signer);
export const deliveryId = (buyer, manifest) => keccak256(AbiCoder.defaultAbiCoder().encode(["address","bytes32"],[buyer,manifest]));

export function crateMask(numbers, maximum) {
  let mask = 0n;
  for (const n of numbers) {
    if (!Number.isSafeInteger(n) || n < 1 || n > maximum) throw Error("Crate number outside manifest.");
    const bit = 1n << BigInt(n-1);
    if (bit & mask) throw Error("Duplicate crate number.");
    mask |= bit;
  }
  return mask;
}

export async function signedDecision(contract, signer, delivery, numbers, reason, review) {
  const state = await contract.deliveryOf(delivery);
  const expected = review ? state.terms.reviewer : state.terms.station;
  if (getAddress(await signer.getAddress()) !== expected) throw Error("Signer differs from assigned role.");
  const mask = crateMask(numbers, Number(state.terms.crates));
  const reasonHash = id(reason);
  const types = review
    ? { Review: [{name:"delivery",type:"bytes32"},{name:"initialAccepted",type:"uint256"},{name:"release",type:"uint256"},{name:"reason",type:"bytes32"}] }
    : { Intake: [{name:"delivery",type:"bytes32"},{name:"accepted",type:"uint256"},{name:"reason",type:"bytes32"}] };
  const value = review ? {delivery,initialAccepted:state.accepted,release:mask,reason:reasonHash} : {delivery,accepted:mask,reason:reasonHash};
  if (!reason.trim()) throw Error("Enter a decision reason.");
  const provider = contract.runner.provider ?? contract.runner;
  const domain = {name:"DockCheck Delivery Reserve",version:"1",chainId:(await provider.getNetwork()).chainId,verifyingContract:contract.target};
  const signature = await signer.signTypedData(domain,types,value);
  return [delivery,mask,reasonHash,signature];
}

const tokenEvents = new Interface(tokenABI);

export function matchReserveTransfers(logs, token, expected) {
  const remaining = logs.filter(log => getAddress(log.address) === token)
    .map(log => tokenEvents.parseLog(log)).filter(event => event?.name === "Transfer");
  return expected.filter(move => move.amount > 0n).map(({from,to,amount}) => {
    const index = remaining.findIndex(event => event.args.from === from && event.args.to === to && event.args.value === amount);
    if (index < 0) throw Error("The token transfer differs from the recorded freight movement.");
    remaining.splice(index,1);
    return {from,to,amountBaseUnits:String(amount)};
  });
}

export async function deliveryStatement(contract, delivery, fromBlock = 0) {
  const provider = contract.runner.provider ?? contract.runner;
  const end = await provider.getBlockNumber();
  const state = await contract.deliveryOf(delivery,{blockTag:end});
  if (!state.buyer || state.phase === 0n) throw Error("Unknown delivery.");
  const token = getAddress(await contract.token({blockTag:end}));
  const events = [];
  for (const name of ["Funded","Received","Finalized"]) {
    for (const e of await contract.queryFilter(contract.filters[name](delivery),fromBlock,end)) {
      const receipt = await provider.getTransactionReceipt(e.transactionHash);
      const block = await provider.getBlock(e.blockNumber);
      if (receipt?.status !== 1 || receipt.blockHash !== e.blockHash || block?.hash !== e.blockHash)
        throw Error("A reserve movement is outside the canonical chain.");
      const expected = name === "Funded"
        ? [{from:state.buyer,to:contract.target,amount:state.terms.price * state.terms.crates}]
        : [{from:contract.target,to:state.terms.carrier,amount:e.args.paid},
           {from:contract.target,to:state.buyer,amount:e.args.refunded ?? 0n}];
      const transfers = matchReserveTransfers(receipt.logs,token,expected);
      events.push({event:name,transfers,hash:e.transactionHash,block:e.blockNumber,blockHash:e.blockHash,
        paidBaseUnits:String(e.args.paid ?? 0),refundedBaseUnits:String(e.args.refunded ?? 0)});
    }
  }
  if (!events.some(e=>e.event === "Funded")) throw Error("Start at or before the funding block.");
  const crates = Number(state.terms.crates);
  const received = events.some(e=>e.event === "Received");
  const rows = Array.from({length:crates},(_,index)=>{
    const bit = 1n << BigInt(index);
    let status = received ? "held" : "awaiting receipt";
    if (state.accepted & bit) status = "paid at intake";
    else if (state.released & bit) status = "paid after inspection";
    else if (state.phase === 3n) status = "rejected";
    else if (state.phase === 4n) status = "expired";
    return {crate:index+1,status};
  });
  const paid = events.reduce((n,e)=>n+BigInt(e.paidBaseUnits),0n);
  const refund = events.reduce((n,e)=>n+BigInt(e.refundedBaseUnits),0n);
  const funded = BigInt(crates)*state.terms.price;
  const remaining = funded-paid-refund;
  if (remaining < 0n || ((state.phase===3n || state.phase===4n) && remaining !== 0n)) throw Error("Escrow totals differ.");
  return {version:1,chainId:Number((await provider.getNetwork()).chainId),contract:contract.target,delivery,
    token,buyer:state.buyer,carrier:state.terms.carrier,reviewer:state.terms.reviewer,asOfBlock:end,
    received,holdReasonHash:state.holdReason,decisionReasonHash:state.decisionReason,
    fundedBaseUnits:String(funded),paidBaseUnits:String(paid),refundedBaseUnits:String(refund),reservedBaseUnits:String(remaining),rows,events};
}

export async function runInspection(engine, released) {
  const s = await localSession(engine);
  try {
    const contract = await reserveFactory(s.buyer).deploy(s.token.target);
    await contract.waitForDeployment();
    const reviewer = Wallet.createRandom(), now = await head(s.provider);
    const terms = {carrier:s.carrier,station:s.station.address,reviewer:reviewer.address,price:10000,crates:8,receiptBy:now+3600,reviewBy:now+7200};
    await (await s.token.approve(contract.target,80000)).wait();
    const manifest = randomId();
    const funded = await (await contract.fund(manifest,terms)).wait();
    const delivery = deliveryId(await s.buyer.getAddress(),manifest);
    const intakeReason = "Packaging damage on crates 7 and 8";
    const reviewReason = released.length ? "Inspection cleared crates " + released.join(", ") + ". Remaining held crates rejected." : "Inspection rejected both held crates.";
    await (await contract.receiveCrates(...await signedDecision(contract,s.station,delivery,[1,2,3,4,5,6],intakeReason,false))).wait();
    const afterIntake = await deliveryStatement(contract,delivery,funded.blockNumber);
    if (afterIntake.reservedBaseUnits !== "20000") throw Error("Incorrect inspection reserve.");
    await (await contract.resolve(...await signedDecision(contract,reviewer,delivery,released,reviewReason,true))).wait();
    return {...await deliveryStatement(contract,delivery,funded.blockNumber),intakeReason,reviewReason};
  } finally { await s.raw.disconnect(); }
}
