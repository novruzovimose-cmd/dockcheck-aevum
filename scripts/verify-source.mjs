// Compile the published standard input and compare creation and runtime bytecode.
import { AbiCoder, keccak256 } from "ethers";
import fs from "node:fs";
import solc from "solc";
import pilot from "../evidence/aevum-pilot.json" with { type: "json" };
import { asJSON, net } from "../src/protocol.mjs";
import { fail, live } from "./live-lib.mjs";

async function verify() {
  const input = fs.readFileSync("artifacts/standard-input.json", "utf8");
  const build = JSON.parse(solc.compile(input));
  const contract = build.contracts?.["contracts/DockCheck.sol"]?.DockCheck;
  if (!contract) throw Error("The published compiler input failed to build.");
  const compiledRuntime = "0x" + contract.evm.deployedBytecode.object;
  const args = AbiCoder.defaultAbiCoder().encode(["address"], [net.token]);
  const creation = "0x" + contract.evm.bytecode.object + args.slice(2);
  const { provider } = await live();
  try {
    const [tx, receipt, runtime] = await Promise.all([
      provider.getTransaction(pilot.deployment.hash),
      provider.getTransactionReceipt(pilot.deployment.hash),
      provider.getCode(pilot.contract),
    ]);
    if (
      tx?.data !== creation ||
      receipt?.status !== 1 ||
      receipt.contractAddress !== pilot.contract ||
      compiledRuntime !== runtime
    )
      throw Error("Published source does not reproduce this deployment.");
    console.log(
      asJSON({
        chainId: net.id,
        contract: pilot.contract,
        deployment: tx.hash,
        block: receipt.blockNumber,
        compiler: solc.version(),
        compilerInput: "artifacts/standard-input.json",
        constructorToken: net.token,
        creationInputMatches: true,
        runtimeMatches: true,
        runtimeKeccak256: keccak256(runtime),
        runtimeBytes: (runtime.length - 2) / 2,
      }),
    );
  } finally {
    provider.destroy();
  }
}
verify().catch(fail);
