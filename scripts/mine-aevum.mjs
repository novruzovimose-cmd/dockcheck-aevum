import fs from "node:fs";
import path from "node:path";
import {
  ContractFactory,
  Transaction,
  Wallet,
  formatEther,
  getAddress,
  getCreateAddress,
} from "ethers";
import { auditRoute, exactToken } from "../src/audit.mjs";
import {
  asJSON,
  assertDesk,
  demoTerms,
  desk,
  fixtureLot,
  head,
  net,
  pilotBudget,
  randomId,
  releaseFor,
  routeId,
  stationTicket,
} from "../src/protocol.mjs";
import { fail, live, readJSON, wallet } from "./live-lib.mjs";

function once(file, value) {
  if (!fs.existsSync(file)) {
    const temporary = file + "." + randomId().slice(2);
    fs.writeFileSync(temporary, asJSON(value()) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    try {
      fs.linkSync(temporary, file);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    } finally {
      fs.unlinkSync(temporary);
    }
  }
  return readJSON(file);
}

async function sendStage({ provider, buyer, directory }, stage, request) {
  const file = path.join(directory, stage + ".json");
  if (!fs.existsSync(file)) {
    const tx = await buyer.populateTransaction(await request());
    const maximumFee = tx.gasLimit * (tx.maxFeePerGas ?? tx.gasPrice);
    if ((await provider.getBalance(buyer.address)) < maximumFee)
      throw Error(
        "Insufficient tQDAY for " +
          stage +
          ". Send test gas, then rerun the same command.",
      );
    const raw = await buyer.signTransaction(tx);
    once(file, () => ({ raw }));
  }
  const raw = readJSON(file).raw;
  const tx = Transaction.from(raw);
  if (tx.chainId !== 44005n || tx.from !== buyer.address)
    throw Error("Journal signer or network differs from this pilot.");
  let receipt = await provider.getTransactionReceipt(tx.hash);
  if (!receipt) {
    try {
      await provider.broadcastTransaction(raw);
    } catch (error) {
      const visible = await provider.getTransaction(tx.hash);
      if (!visible) throw error;
    }
    console.error(stage + " broadcast " + tx.hash);
    receipt = await provider.waitForTransaction(tx.hash, 1, 90000);
  }
  if (!receipt)
    throw Error(stage + " is pending. Run again with the same journal.");
  if (receipt.status !== 1)
    throw Error(stage + " reverted in " + tx.hash + ".");
  return { receipt, tx };
}

async function run() {
  const [mode, address] = process.argv.slice(2);
  if (!["check", "send"].includes(mode))
    throw Error(
      "Usage: npm run mine -- check [PUBLIC_WALLET] | npm run mine -- send",
    );
  const { provider, token } = await live();
  try {
    const buyer =
      mode === "send" || !address ? wallet("BUYER_KEY", provider) : null;
    const account =
      mode === "check" && address ? getAddress(address) : buyer.address;
    const [gas, funds] = await Promise.all([
      provider.getBalance(account),
      token.balanceOf(account),
    ]);
    if (mode === "check") {
      console.log(
        asJSON({
          chainId: 44005,
          account,
          tQDAY: formatEther(gas),
          tUSD8: exactToken(funds),
          pilotDeposit: exactToken(pilotBudget),
          sufficientTokens: funds >= pilotBudget,
        }),
      );
      return;
    }
    const directory = path.resolve(".dockcheck", "pilot-44005", buyer.address);
    const exists = fs.existsSync(path.join(directory, "fund.json"));
    if (!exists && (gas === 0n || funds < pilotBudget))
      throw Error(
        "Pilot needs tQDAY for gas and 0.10 test tUSD8. Use the QDay faucet and run mine -- check.",
      );
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const actors = once(path.join(directory, "local-actors.json"), () => ({
      carrier: Wallet.createRandom().privateKey,
      station: Wallet.createRandom().privateKey,
      agent: Wallet.createRandom().privateKey,
      salt: randomId(),
    }));
    const carrier = new Wallet(actors.carrier).address;
    const station = new Wallet(actors.station),
      agent = new Wallet(actors.agent);
    const route = routeId(buyer.address, actors.salt);
    const submit = (stage, request) =>
      sendStage({ provider, buyer, directory }, stage, request);
    const { receipt: deployed, tx: deploymentTx } = await submit("deploy", () =>
      new ContractFactory(desk.abi, desk.bytecode).getDeployTransaction(
        net.token,
      ),
    );
    const contractAddress = getCreateAddress({
      from: buyer.address,
      nonce: deploymentTx.nonce,
    });
    if (deployed.contractAddress !== contractAddress)
      throw Error("Unexpected newly deployed address.");
    const contract = (await assertDesk(provider, contractAddress)).connect(
      buyer,
    );
    const stablecoin = token.connect(buyer);
    await submit("approve", () =>
      stablecoin.approve.populateTransaction(contractAddress, pilotBudget),
    );
    const { receipt: funding } = await submit("fund", async () => {
      const terms = demoTerms(
        carrier,
        station.address,
        agent.address,
        await head(provider),
        true,
      );
      return contract.open.populateTransaction(actors.salt, terms);
    });
    const { receipt: settlement } = await submit("settle", async () => {
      const envelope = await stationTicket(
        { provider, contract, route, station, chainId: 44005 },
        { lot: fixtureLot(route, 1), crates: 6, low: 24, high: 67 },
      );
      const release = await releaseFor(contract, 44005, envelope, agent);
      return contract.settle.populateTransaction(
        envelope.ticket,
        envelope.stationSig,
        release.agentSig,
      );
    });
    const { receipt: refund } = await submit("refund", () =>
      contract.close.populateTransaction(route),
    );
    const audit = await auditRoute(provider, {
      funding: funding.hash,
      settlement: settlement.hash,
      refund: refund.hash,
    });
    const output = {
      ...audit,
      deployment: { hash: deployed.hash, block: deployed.blockNumber },
    };
    const target = path.join(directory, "verified-pilot.json");
    fs.writeFileSync(target, asJSON(output) + "\n", { mode: 0o600 });
    console.log(asJSON(output));
    console.error("Verified packet saved to " + target);
  } finally {
    provider.destroy();
  }
}
run().catch(fail);
