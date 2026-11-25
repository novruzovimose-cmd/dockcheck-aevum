import { readFileSync } from "node:fs";
import { getAddress, id, isHexString } from "ethers";
import artifact from "../artifacts/DeliveryReserve.json" with { type: "json" };
import { deliveryId, deliveryStatement, reserveAt, reserveFactory, signedDecision } from "../src/reserve.mjs";
import { asJSON, net } from "../src/protocol.mjs";
import { fail, live, need, wallet } from "./live-lib.mjs";

function withoutImmutables(code) {
  let result = code.toLowerCase();
  for (const {start,length} of Object.values(artifact.immutableReferences).flat()) {
    const offset = 2 + start * 2;
    result = result.slice(0,offset) + "0".repeat(length*2) + result.slice(offset+length*2);
  }
  return result;
}
async function run() {
  const [cmd,arg] = process.argv.slice(2);
  if (!["deploy","fund","intake","review","expire","statement"].includes(cmd))
    throw Error("Use deploy, fund TERMS.json, intake DECISION.json, review DECISION.json, expire, or statement.");
  const {provider,token} = await live();
  try {
    if (cmd === "deploy") {
      const c = await reserveFactory(wallet("BUYER_KEY",provider)).deploy(net.token);
      await c.waitForDeployment();
      console.log(asJSON({contract:c.target,transaction:c.deploymentTransaction().hash}));
      return;
    }
    const c = reserveAt(getAddress(need("RESERVE_ADDRESS")),provider);
    if (withoutImmutables(await provider.getCode(c.target)) !== withoutImmutables(artifact.runtime) || getAddress(await c.token()) !== net.token)
      throw Error("The reserve bytecode or Aevum token differs from this build.");
    if (cmd === "fund") {
      const buyer = wallet("BUYER_KEY",provider);
      const {manifestReference,terms} = JSON.parse(readFileSync(arg,"utf8"));
      if (!manifestReference?.trim()) throw Error("Supply a stable manifest reference.");
      const manifest = id(manifestReference.trim().toUpperCase());
      const delivery = deliveryId(buyer.address,manifest);
      if ((await c.deliveryOf(delivery)).phase !== 0n) throw Error("Already funded: "+delivery);
      const total = BigInt(terms.crates)*BigInt(terms.price);
      const now = (await provider.getBlock("latest")).timestamp;
      if (!Number.isInteger(terms.crates) || terms.crates<1 || terms.crates>256 || BigInt(terms.price)<=0n || BigInt(terms.price)>=(1n<<96n) ||
          !Number.isSafeInteger(terms.receiptBy) || !Number.isSafeInteger(terms.reviewBy) ||
          !(now<terms.receiptBy && terms.receiptBy<terms.reviewBy && terms.reviewBy<=now+30*86400)) throw Error("Invalid quantity, rate or deadlines.");
      const roles=[terms.station,terms.reviewer,terms.carrier].map(getAddress);
      if (new Set(roles).size!==3 || roles.includes("0x"+"0".repeat(40)) || roles[2]===c.target) throw Error("Invalid role addresses.");
      if (await token.balanceOf(buyer.address)<total) throw Error("Insufficient test tUSD8.");
      if (await token.allowance(buyer.address,c.target)!==total)
        await (await token.connect(buyer).approve(c.target,total)).wait();
      const receipt = await (await c.connect(buyer).fund(manifest,terms)).wait();
      console.log(asJSON({delivery,funding:receipt.hash,fromBlock:receipt.blockNumber}));
      return;
    }
    const delivery=need("DELIVERY_ID");
    if (!isHexString(delivery,32)) throw Error("Invalid delivery ID.");
    if (cmd === "statement") {
      console.log(asJSON(await deliveryStatement(c,delivery,Number(process.env.FUNDING_BLOCK || 0))));
      return;
    }
    const relay=c.connect(wallet("RELAYER_KEY",provider));
    let tx;
    if (cmd==="expire") tx=await relay.expire(delivery);
    else {
      const review=cmd==="review";
      const decision=JSON.parse(readFileSync(arg,"utf8"));
      const args=await signedDecision(c,wallet(review?"REVIEWER_KEY":"STATION_KEY"),delivery,decision.crates,decision.reason,review);
      tx=review?await relay.resolve(...args):await relay.receiveCrates(...args);
    }
    console.log(asJSON({delivery,hash:tx.hash}));
    await tx.wait();
  } finally { provider.destroy(); }
}
run().catch(fail);
