import { AbiCoder, keccak256 } from "ethers";
import { asJSON, desk, net } from "../src/protocol.mjs";
import { fail } from "./live-lib.mjs";

async function rpc(method, params = []) {
  const response = await fetch(process.env.AEVUM_RPC_URL || net.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error("Aevum RPC returned HTTP " + response.status);
  const data = await response.json();
  if (data.error) throw Error(data.error.message);
  return data.result;
}

async function run() {
  if (Number(await rpc("eth_chainId")) !== 44005) throw Error("Select QDay Aevum chain 44005.");
  const constructor = AbiCoder.defaultAbiCoder().encode(["address"], [net.token]);
  const runtime = await rpc("eth_call", [
    { data: desk.bytecode + constructor.slice(2), gas: "0x500000" },
    "latest",
  ]);
  if (runtime !== desk.runtime) throw Error("Aevum simulation returned different runtime bytecode.");
  console.log(asJSON({
    chainId: 44005,
    observedAt: new Date().toISOString(),
    blockTag: "latest",
    method: "eth_call contract creation",
    broadcast: false,
    runtimeBytes: (runtime.length - 2) / 2,
    runtimeHash: keccak256(runtime),
  }));
}
run().catch(fail);
