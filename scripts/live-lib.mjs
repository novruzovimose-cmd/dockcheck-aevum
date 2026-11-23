import fs from "node:fs";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  getAddress,
} from "ethers";
import { assertDesk, asJSON, net, tokenABI } from "../src/protocol.mjs";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
if (process.env.ROUTE_CONFIG_FILE) {
  const config = JSON.parse(
    fs.readFileSync(process.env.ROUTE_CONFIG_FILE, "utf8"),
  );
  if (config.chainId !== net.id || !/^0x[0-9a-f]{64}$/i.test(config.ROUTE_ID))
    throw Error("Route configuration must identify a valid Aevum route.");
  for (const name of [
    "DOCK_ADDRESS",
    "ROUTE_ID",
    "CARRIER_ADDRESS",
    "STATION_ADDRESS",
    "AGENT_ADDRESS",
  ]) {
    const value = name === "ROUTE_ID" ? config[name] : getAddress(config[name]);
    if (
      process.env[name] &&
      process.env[name].toLowerCase() !== value.toLowerCase()
    )
      throw Error(
        name + " differs between the environment and the route configuration.",
      );
    process.env[name] = value;
  }
}
export function need(name) {
  const val = process.env[name];
  if (!val) throw Error("Set " + name + " in your local environment.");
  return val;
}
export function wallet(name, provider) {
  return new Wallet(need(name), provider);
}
export async function live() {
  const request = new FetchRequest(process.env.AEVUM_RPC_URL || net.rpc);
  request.timeout = 30000;
  // Use the runtime transport so managed networks can apply their HTTPS proxy.
  request.getUrlFunc = async (req, cancel) => {
    const abort = new AbortController();
    cancel?.checkSignal();
    cancel?.addListener(() => abort.abort());
    const response = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: "error",
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(req.timeout)]),
    });
    return {
      statusCode: response.status,
      statusMessage: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: new Uint8Array(await response.arrayBuffer()),
    };
  };
  const provider = new JsonRpcProvider(request, undefined, {
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
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
