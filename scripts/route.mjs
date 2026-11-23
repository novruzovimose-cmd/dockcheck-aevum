import { keccak256 } from "ethers";
import {
  asJSON,
  deployDesk,
  head,
  net,
  parseEvent,
  randomId,
  routeId,
} from "../src/protocol.mjs";
import { routeTerms } from "../src/route-terms.mjs";
import { exactToken } from "../src/audit.mjs";
import { attached, fail, live, need, wallet, readJSON } from "./live-lib.mjs";
async function run() {
  const cmd = process.argv[2];
  if (
    !["check", "deploy", "open", "close", "status", "clear-allowance"].includes(
      cmd,
    )
  )
    throw Error(
      "Usage: npm run route -- check|deploy|open|status|close|clear-allowance",
    );
  const { provider, token } = await live();
  if (cmd === "check") {
    const block = await provider.getBlock("latest");
    console.log(
      asJSON({
        chainId: 44005,
        rpc: process.env.AEVUM_RPC_URL || net.rpc,
        blockNumber: block.number,
        blockHash: block.hash,
        blockTime: new Date(block.timestamp * 1000).toISOString(),
        tUSD8: net.token,
        tokenDecimals: Number(await token.decimals()),
        tokenRuntimeHash: keccak256(await provider.getCode(net.token)),
      }),
    );
    return;
  }
  if (cmd === "status") {
    const c = await attached(provider),
      r = await c.routeOf(need("ROUTE_ID"));
    console.log(
      asJSON({
        owner: r.owner,
        remaining: r.remaining,
        released: r.released,
        closed: r.closed,
        expiry: r.terms.expiry,
        carrier: r.terms.carrier,
        station: r.terms.station,
        agent: r.terms.agent,
      }),
    );
    return;
  }
  const buyer = wallet("BUYER_KEY", provider);
  if (cmd === "deploy") {
    const c = await deployDesk(buyer, net.token);
    console.log(
      asJSON({
        contract: c.target,
        deployment: c.deploymentTransaction().hash,
        explorer: net.explorer + "/address/" + c.target,
        runtimeMatch: true,
      }),
    );
    return;
  }
  const c = (await attached(provider)).connect(buyer);
  if (cmd === "clear-allowance") {
    console.log(
      (await (await token.connect(buyer).approve(c.target, 0)).wait()).hash,
    );
    return;
  }
  if (cmd === "close") {
    const receipt = await (await c.close(need("ROUTE_ID"))).wait();
    console.log(
      asJSON({
        hash: receipt.hash,
        refund: parseEvent(receipt, c, "Closed").returnedAmount,
      }),
    );
    return;
  }
  const salt = need("ROUTE_SALT");
  if (!/^0x[0-9a-f]{64}$/i.test(salt))
    throw Error(
      "Use a persistent random 32-byte ROUTE_SALT for retry-safe funding.",
    );
  const rid = routeId(buyer.address, salt),
    before = await c.routeOf(rid);
  if (before.owner === buyer.address) {
    console.log(
      asJSON({ route: rid, alreadyOpened: true, closed: before.closed }),
    );
    return;
  }
  const config = process.env.ROUTE_POLICY_FILE
    ? readJSON(process.env.ROUTE_POLICY_FILE)
    : {
        budget: "4.50",
        unitPrice: "0.125",
        maxCrates: 12,
        lowC: 2,
        highC: 8,
        hours: 24,
      };
  const t = routeTerms(
    {
      ...config,
      carrier: need("CARRIER_ADDRESS"),
      station: need("STATION_ADDRESS"),
      agent: need("AGENT_ADDRESS"),
    },
    await head(provider),
    c.target,
  );
  if ((await token.balanceOf(buyer.address)) < t.budget)
    throw Error("Buyer needs " + exactToken(t.budget) + " test tUSD8.");
  if ((await token.allowance(buyer.address, c.target)) !== BigInt(t.budget))
    await (await token.connect(buyer).approve(c.target, t.budget)).wait();
  const tx = await c.open(salt, t);
  console.log(asJSON({ route: rid, broadcast: tx.hash }));
  await tx.wait();
  console.log("Escrow confirmed.");
}
run().catch(fail);
