import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ganache from "ganache";
import { AbiCoder, keccak256, toBeHex, zeroPadValue } from "ethers";
import { localToken, net, randomId, routeId } from "../src/protocol.mjs";

const execute = promisify(execFile);
const scripts = fileURLToPath(new URL("../scripts/", import.meta.url));
test(
  "isolated RPC fixture exercises CLI deploy, idempotent funding, signer separation, journal recovery, proof and refund",
  { timeout: 120000 },
  async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dockcheck-cli-"));
    // This fixture is loopback-only. Network identifiers match the CLI's validation rules.
    const server = ganache.server({
      chain: { chainId: 44005, hardfork: "shanghai" },
      logging: { quiet: true },
      wallet: { totalAccounts: 5 },
    });
    await server.listen(0, "127.0.0.1");
    try {
      const rows = Object.entries(server.provider.getInitialAccounts());
      const [[buyer, b], [carrier], [station, st], [agent, ag], [, rel]] = rows;
      // Build the ERC-20 fixture in this in-memory genesis state. The compiler fixture
      // derives from OpenZeppelin ERC20 5.1 whose balance mapping is at slot zero.
      await server.provider.request({
        method: "evm_setAccountCode",
        params: [net.token, localToken.runtime],
      });
      const balanceKey = keccak256(
        AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [buyer, 0]),
      );
      await server.provider.request({
        method: "evm_setAccountStorageAt",
        params: [net.token, balanceKey, zeroPadValue(toBeHex(5000000), 32)],
      });
      const env = {
        ...process.env,
        AEVUM_RPC_URL: "http://127.0.0.1:" + server.address().port,
        BUYER_KEY: b.secretKey,
        STATION_KEY: st.secretKey,
        AGENT_KEY: ag.secretKey,
        RELAYER_KEY: rel.secretKey,
        CARRIER_ADDRESS: carrier,
        STATION_ADDRESS: station,
        AGENT_ADDRESS: agent,
        ROUTE_SALT: randomId(),
      };
      const call = async (file, ...args) =>
        (
          await execute(
            process.execPath,
            [path.join(scripts, file + ".mjs"), ...args],
            { cwd: tmp, env, timeout: 50000 },
          )
        ).stdout;
      const deployed = JSON.parse(await call("route", "deploy"));
      assert.equal(deployed.runtimeMatch, true);
      env.DOCK_ADDRESS = deployed.contract;
      env.ROUTE_ID = routeId(buyer, env.ROUTE_SALT);
      await call("route", "open");
      assert.ok(JSON.parse(await call("route", "open")).alreadyOpened);
      // Resume on a different operator machine using only the exported public route file.
      const handoff = {
        chainId: 44005,
        DOCK_ADDRESS: deployed.contract,
        ROUTE_ID: env.ROUTE_ID,
        CARRIER_ADDRESS: carrier,
        STATION_ADDRESS: station,
        AGENT_ADDRESS: agent,
      };
      env.ROUTE_CONFIG_FILE = path.join(tmp, "route-config.json");
      await fs.writeFile(env.ROUTE_CONFIG_FILE, JSON.stringify(handoff));
      const measurement = {
        lot: randomId(),
        crates: 6,
        low: 24,
        high: 67,
        observedAt: "now",
      };
      await fs.writeFile(path.join(tmp, "m.json"), JSON.stringify(measurement));
      const rid = env.ROUTE_ID;
      delete env.ROUTE_ID;
      await call("ticket", "m.json", "signed.json");
      await call("agent", "signed.json");
      const base = path.join(
        tmp,
        ".dockcheck",
        "44005",
        env.DOCK_ADDRESS,
        rid,
        measurement.lot,
      );
      const proofFile = base + ".proof.json";
      const proof = JSON.parse(await fs.readFile(proofFile)),
        verified = JSON.parse(await call("proof", proofFile));
      assert.equal(verified.amountBaseUnits, "750000");
      const reconstructed = JSON.parse(
        await call("proof", "--tx", proof.transactionHash),
      );
      assert.equal(reconstructed.ticketHash, proof.ticketHash);
      await fs.unlink(proofFile);
      await call("agent", "signed.json");
      assert.equal(
        JSON.parse(await fs.readFile(proofFile)).transactionHash,
        proof.transactionHash,
      );
      assert.match(await call("agent", "signed.json"), /Already confirmed/);
      assert.equal(
        JSON.parse(await call("route", "status")).remaining,
        "3750000",
      );
      await fs.writeFile(
        path.join(tmp, "warm.json"),
        JSON.stringify({ ...measurement, lot: randomId(), high: 103 }),
      );
      await call("ticket", "warm.json", "warm.signed.json");
      await assert.rejects(call("agent", "warm.signed.json"), /temperature/i);
      assert.equal(JSON.parse(await call("route", "close")).refund, "3750000");
      assert.equal(JSON.parse(await call("route", "status")).closed, true);
      const before = JSON.parse(await call("mine-aevum", "check", buyer));
      assert.equal(before.sufficientTokens, true);
      const mined = JSON.parse(await call("mine-aevum", "send"));
      assert.equal(mined.fundedBaseUnits, "100000");
      assert.equal(mined.paidBaseUnits, "60000");
      assert.equal(mined.refundedBaseUnits, "40000");
      const retry = JSON.parse(await call("mine-aevum", "send"));
      assert.equal(retry.deployment.hash, mined.deployment.hash);
      assert.equal(retry.settlement.hash, mined.settlement.hash);
      const checked = JSON.parse(
        await call(
          "audit",
          mined.funding.hash,
          mined.settlement.hash,
          mined.refund.hash,
        ),
      );
      assert.equal(checked.route, mined.route);
    } finally {
      await server.close();
      await fs.rm(tmp, { recursive: true, force: true });
    }
  },
);
