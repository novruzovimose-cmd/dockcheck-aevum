import assert from "node:assert/strict";
import { before, after, beforeEach, afterEach, test } from "node:test";
import { id, Wallet } from "ethers";
import ganache from "ganache";
import { localSession, head, randomId } from "../src/protocol.mjs";
import { reserveFactory, deliveryId, signedDecision, deliveryStatement, crateMask } from "../src/reserve.mjs";

let s, c, reviewer, terms, delivery, funding, snapshot;
before(async () => {
  s = await localSession(ganache);
  c = await reserveFactory(s.buyer).deploy(s.token.target);
  await c.waitForDeployment();
  reviewer = Wallet.createRandom();
  const now = await head(s.provider);
  terms = {carrier:s.carrier,station:s.station.address,reviewer:reviewer.address,price:10000,crates:8,receiptBy:now+90,reviewBy:now+300};
  await (await s.token.approve(c.target,80000)).wait();
  const manifest = randomId();
  funding = await (await c.fund(manifest,terms)).wait();
  delivery = deliveryId(await s.buyer.getAddress(),manifest);
});
after(async()=>{await s?.raw.disconnect();});
beforeEach(async()=>{snapshot=await s.raw.request({method:"evm_snapshot",params:[]});});
afterEach(async()=>{await s.raw.request({method:"evm_revert",params:[snapshot]});});
const intake = async (crates=[1,2,3,4,5,6]) => {
  const args = await signedDecision(c,s.station,delivery,crates,"Dock inspection",false);
  await (await c.receiveCrates(...args)).wait();
  return args;
};
const review = crates => signedDecision(c,reviewer,delivery,crates,"Final inspection",true);
const statement = () => deliveryStatement(c,delivery,funding.blockNumber);

test("same delivery pays six, reserves two, releases crate seven and refunds crate eight",async()=>{
  const buyer=await s.buyer.getAddress();
  const initial=await s.token.balanceOf(buyer);
  const first=await intake();
  assert.equal(await s.token.balanceOf(c.target),20000n);
  assert.equal(await s.token.balanceOf(s.carrier),60000n);
  await assert.rejects(c.receiveCrates.staticCall(...first));
  const final=await review([7]);
  await (await c.resolve(...final)).wait();
  assert.equal(await s.token.balanceOf(c.target),0n);
  assert.equal(await s.token.balanceOf(buyer)-initial,10000n);
  assert.equal(await s.token.balanceOf(s.carrier),70000n);
  await assert.rejects(c.resolve.staticCall(...final));
  const report=await statement();
  assert.deepEqual(report.rows.slice(6).map(r=>r.status),["paid after inspection","rejected"]);
  assert.equal(report.events.length,3);
  assert.equal(report.reservedBaseUnits,"0");
});

test("only assigned reviewer can release held crates and the decision binds the exact selection",async()=>{
  await intake();
  await assert.rejects(c.resolve.staticCall(...await review([1,7])));
  const [key,mask,reason,sig]=await review([7]);
  await assert.rejects(c.resolve.staticCall(key,128n,reason,sig));
  await assert.rejects(c.resolve.staticCall(key,mask,id("changed"),sig));
  const other=await signedDecision(c,s.station,key,[7],"reason",false);
  await assert.rejects(c.resolve.staticCall(...other));
  assert.equal(await s.token.balanceOf(c.target),20000n);
});

for (const received of [true,false]) test("deadline refund with intake "+received,async()=>{
  if(received) await intake();
  await assert.rejects(c.expire.staticCall(delivery));
  await s.raw.request({method:"evm_increaseTime",params:[301]});
  await s.raw.request({method:"evm_mine",params:[]});
  if(received) await assert.rejects(c.resolve.staticCall(...await review([7])));
  const caller=await s.provider.getSigner(1);
  await (await c.connect(caller).expire(delivery)).wait();
  assert.equal((await statement()).refundedBaseUnits,received?"20000":"80000");
  await assert.rejects(c.expire.staticCall(delivery));
});

test("accepting all closes at intake; bit identifiers cover the full supported manifest",async()=>{
  assert.equal(crateMask([256],256),1n<<255n);
  assert.throws(()=>crateMask([1,1],8));
  await intake([1,2,3,4,5,6,7,8]);
  assert.equal((await statement()).paidBaseUnits,"80000");
  await assert.rejects(c.resolve.staticCall(...await review([])));
});
test("fully held load can be completely rejected",async()=>{
  await intake([]);
  await (await c.resolve(...await review([]))).wait();
  assert.equal((await statement()).refundedBaseUnits,"80000");
});

test("one real token movement is required per nonzero reserve obligation",async()=>{
  const {matchReserveTransfers} = await import("../src/reserve.mjs");
  const receipt = await s.provider.getTransactionReceipt(funding.hash);
  const transfer = {from:await s.buyer.getAddress(),to:c.target,amount:80000n};
  const check = (logs,expected) => matchReserveTransfers(logs,s.token.target,expected);
  assert.equal(check(receipt.logs,[transfer])[0].amountBaseUnits,"80000");
  assert.throws(()=>check([], [transfer]),/transfer differs/);
  assert.throws(()=>check(receipt.logs,[transfer,transfer]),/transfer differs/);
  assert.throws(()=>check(receipt.logs,[{...transfer,amount:79999n}]),/transfer differs/);
});
