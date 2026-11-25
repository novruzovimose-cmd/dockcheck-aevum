import { verifyException } from "../src/disposition.mjs";
import fs from "node:fs";
import path from "node:path";
import { TypedDataEncoder, getAddress, keccak256 } from "ethers";
import {
  domain,
  ticketTypes,
  describeError,
  parseEvent,
  releaseFor,
} from "../src/protocol.mjs";
import { verifyPayment } from "../src/verify.mjs";
import {
  attached,
  live,
  need,
  readJSON,
  wallet,
  writeJSON,
  fail,
} from "./live-lib.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run() {
  const [arg, dir] = process.argv.slice(2),
    watch = arg === "--watch";
  if (!arg || (watch && !dir))
    throw Error(
      "Usage: npm run agent -- ticket.json OR npm run agent -- --watch ./inbox",
    );
  const { provider } = await live(),
    c = await attached(provider),
    agent = wallet("AGENT_KEY"),
    relayer = wallet("RELAYER_KEY", provider),
    route = need("ROUTE_ID");
  const root = path.resolve(".dockcheck", String(44005), c.target, route);
  if (!/^0x[\da-f]{64}$/i.test(route)) throw Error("Invalid configured route.");
  const r = await c.routeOf(route);
  if (r.terms.agent !== agent.address)
    throw Error("Configured agent is outside this route.");
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  async function processFile(file) {
    const e = readJSON(file),
      lot = e?.ticket?.lot;
    if (
      e.version !== 1 ||
      Number(e.chainId) !== 44005 ||
      getAddress(e.contract) !== c.target ||
      e.ticket.route !== route ||
      !/^0x[\da-f]{64}$/i.test(lot)
    )
      throw Error("Input is outside this worker's chain, contract, or route.");
    if ("exception" in e) verifyException(e, r.terms.station);
    const prefix = path.join(root, lot.toLowerCase()),
      journal = prefix + ".pending.json",
      output = prefix + ".proof.json";
    const digest = TypedDataEncoder.hash(
      domain(44005, c.target),
      ticketTypes,
      e.ticket,
    );
    if (fs.existsSync(output)) {
      const prior = readJSON(output);
      await verifyPayment(provider, prior);
      if (prior.ticketHash !== digest)
        throw Error("Lot conflict: a different measurement already settled.");
      console.log("Already confirmed: " + output);
      return;
    }
    let job;
    if (fs.existsSync(journal)) {
      job = readJSON(journal);
      if (
        TypedDataEncoder.hash(
          domain(44005, c.target),
          ticketTypes,
          job.envelope.ticket,
        ) !== digest
      )
        throw Error(
          "Lot conflict: the pending journal contains different signed measurements.",
        );
    } else {
      if (await c.paid(route, lot)) {
        console.log("Lot already paid on-chain. No new transaction.");
        return;
      }
      let release;
      try {
        release = await releaseFor(c, 44005, e, agent);
      } catch (err) {
        throw Error(describeError(err, c));
      }
      const request = await c.settle.populateTransaction(
        e.ticket,
        e.stationSig,
        release.agentSig,
      );
      const raw = await relayer.signTransaction(
        await relayer.populateTransaction(request),
      );
      job = {
        raw,
        hash: keccak256(raw),
        envelope: e,
        agentSig: release.agentSig,
      };
      // Link publishes a fully written immutable journal. Concurrent workers reuse the winner.
      const tmp = journal + "." + process.pid;
      writeJSON(tmp, job);
      try {
        fs.linkSync(tmp, journal);
      } catch (err) {
        if (err.code !== "EEXIST") throw err;
        job = readJSON(journal);
      } finally {
        fs.unlinkSync(tmp);
      }
    }
    let receipt = await provider.getTransactionReceipt(job.hash);
    if (!receipt) {
      if (!(await provider.getTransaction(job.hash))) {
        try {
          await provider.broadcastTransaction(job.raw);
        } catch (err) {
          if (
            !(await provider.getTransaction(job.hash)) &&
            !(await provider.getTransactionReceipt(job.hash))
          )
            throw err;
        }
      }
      console.log("Awaiting " + job.hash);
      receipt = await provider.waitForTransaction(job.hash, 1, 60000);
    }
    if (receipt?.status !== 1)
      throw Error(
        "Transaction reverted or is pending. Inspect the journal and explorer.",
      );
    const event = parseEvent(receipt, c, "Settled");
    const proof = {
      version: 1,
      chainId: 44005,
      contract: c.target,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      transactionHash: receipt.hash,
      route: event.route,
      lot: event.lot,
      carrier: event.carrier,
      crates: String(event.crates),
      amountBaseUnits: String(event.amount),
      ticketHash: event.ticketHash,
      envelope: job.envelope,
      agentSig: job.agentSig,
    };
    await verifyPayment(provider, proof);
    try {
      writeJSON(output, proof);
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
    console.log("Confirmed: " + output);
  }
  if (!watch) {
    await processFile(arg);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const seen = new Map();
  console.log(
    "Watching " +
      path.resolve(dir) +
      "; use a dedicated relayer for this worker.",
  );
  for (;;) {
    for (const item of fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((x) => x.isFile() && x.name.endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, item.name),
        stamp = fs.statSync(file).mtimeMs,
        prior = seen.get(file);
      if (prior?.stamp === stamp && (prior.done || Date.now() < prior.retry))
        continue;
      try {
        await processFile(file);
        seen.set(file, { stamp, done: true });
      } catch (err) {
        console.error(item.name + ": " + (err.shortMessage || err.message));
        seen.set(file, { stamp, retry: Date.now() + 60000 });
      }
    }
    await sleep(2500);
  }
}
run().catch(fail);
