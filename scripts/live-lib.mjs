import fs from "node:fs";
import { Contract, JsonRpcProvider, Wallet, getAddress } from "ethers";
import { assertDesk, asJSON, net, tokenABI } from "../src/protocol.mjs";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
export function need(name) {
  const val = process.env[name];
  if (!val) throw Error("Set " + name + " in your local environment.");
  return val;
}
export function wallet(name, provider) {
  return new Wallet(need(name), provider);
}
export async function live() {
  const provider = new JsonRpcProvider(
    process.env.AEVUM_RPC_URL || net.rpc,
    undefined,
    { batchMaxCount: 1, cacheTimeout: -1 },
  );
  const network = await provider.getNetwork();
  if (network.chainId !== 44005n)
    throw Error("Aborted: RPC is not Aevum chain 44005.");
  const token = new Contract(net.token, tokenABI, provider);
  if ((await token.decimals()) !== 6n)
    throw Error("Official tUSD8 contract must have six decimals.");
  return { provider, token };
}
export const attached = (provider) =>
  assertDesk(provider, getAddress(need("DOCK_ADDRESS")));
export function writeJSON(path, data) {
  fs.writeFileSync(path, asJSON(data) + "\n", { mode: 0o600, flag: "wx" });
}
export const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export function fail(e) {
  console.error(e?.shortMessage || e?.message || String(e));
  process.exitCode = 1;
}
