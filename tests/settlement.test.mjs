import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import {
  Wallet,
  TypedDataEncoder,
  ContractFactory,
  ZeroAddress,
  keccak256,
} from "ethers";
import {
  localSession,
  head,
  parseEvent,
  stationTicket,
  releaseFor,
  settleSigned,
  fixtureLot,
  domain,
  ticketTypes,
  releaseTypes,
  randomId,
  desk,
  routeId,
} from "../src/protocol.mjs";
let s, base, snap;
before(async () => {
  s = await localSession(ganache);
  base = { lot: fixtureLot(s.route, 1), crates: 6, low: 24, high: 67 };
});
after(async () => {
  await s?.raw.disconnect();
});
async function ticket(overrides = {}) {
  return await stationTicket(s, { ...base, ...overrides });
}
async function denied(promise, name) {
  await assert.rejects(promise, (e) => {
    assert.equal(
      e.revert?.name ||
        (e.data && s.contract.interface.parseError(e.data)?.name),
      name,
    );
    return true;
  });
}
function isolated(name, body) {
  test(name, async () => {
    snap = await s.raw.request({ method: "evm_snapshot", params: [] });
    try {
      await body();
    } finally {
      await s.raw.request({ method: "evm_revert", params: [snap] });
    }
  });
}
isolated(
  "source build matches the runtime and route is fully escrowed",
  async () => {
    assert.equal(
      keccak256(await s.provider.getCode(s.contract.target)),
      keccak256(desk.runtime),
    );
    assert.equal(await s.token.balanceOf(s.contract.target), 4500000n);
    assert.equal(
      await s.token.allowance(await s.buyer.getAddress(), s.contract.target),
      0n,
    );
  },
);
isolated(
  "independent actors authorize six crates for exactly 0.750000",
  async () => {
    const e = await ticket(),
      rel = await releaseFor(s.contract, s.chainId, e, s.agent);
    assert.equal(rel.ticketHash, await s.contract.ticketHash(e.ticket));
    const result = await settleSigned(s.contract, e, rel);
    assert.equal(result.amountBaseUnits, "750000");
    assert.equal(await s.token.balanceOf(s.carrier), 750000n);
    assert.equal((await s.contract.routeOf(s.route)).remaining, 3750000n);
    await denied(
      s.contract.settle.staticCall(e.ticket, e.stationSig, rel.agentSig),
      "LotAlreadyPaid",
    );
    const changed = await ticket({ crates: 1 });
    await denied(s.contract.quote(changed.ticket), "LotAlreadyPaid");
  },
);
for (const [name, edit, err] of [
  ["too warm", { high: 81 }, "TemperatureOutsideBand"],
  ["too cold", { low: 19 }, "TemperatureOutsideBand"],
  ["inverted range", { low: 70, high: 60 }, "TemperatureOutsideBand"],
  ["empty load", { crates: 0 }, "InvalidQuantity"],
  ["oversized load", { crates: 13 }, "InvalidQuantity"],
  ["empty lot", { lot: "0x" + "00".repeat(32) }, "LotAlreadyPaid"],
])
  isolated(name + " leaves carrier and escrow balances intact", async () => {
    const e = await ticket(edit);
    await denied(s.contract.quote(e.ticket), err);
    assert.equal(await s.token.balanceOf(s.carrier), 0n);
    assert.equal(await s.token.balanceOf(s.contract.target), 4500000n);
  });
isolated(
  "inclusive temperature boundaries and the maximum crate count pass",
  async () => {
    assert.equal(
      await s.contract.quote(
        (await ticket({ low: 20, high: 80, crates: 12 })).ticket,
      ),
      1500000n,
    );
  },
);
isolated(
  "receiver signature cannot authorize a modified quantity",
  async () => {
    const e = await ticket();
    const good = await releaseFor(s.contract, s.chainId, e, s.agent);
    await denied(
      s.contract.settle.staticCall(
        { ...e.ticket, crates: 7 },
        e.stationSig,
        good.agentSig,
      ),
      "StationSignature",
    );
  },
);
isolated("one role cannot sign for both roles", async () => {
  const e = await ticket(),
    d = domain(s.chainId, s.contract.target);
  const ticketHash = TypedDataEncoder.hash(d, ticketTypes, e.ticket);
  const bad = await s.station.signTypedData(d, releaseTypes, { ticketHash });
  await denied(
    s.contract.settle.staticCall(e.ticket, e.stationSig, bad),
    "AgentSignature",
  );
});
isolated("a signature for another chain fails", async () => {
  const e = await ticket(),
    rel = await releaseFor(s.contract, s.chainId, e, s.agent);
  const other = await s.station.signTypedData(
    domain(44005, s.contract.target),
    ticketTypes,
    e.ticket,
  );
  await denied(
    s.contract.settle.staticCall(e.ticket, other, rel.agentSig),
    "StationSignature",
  );
});
isolated(
  "expiry, old readings, and future readings are enforced against block time",
  async () => {
    const e = await ticket();
    await denied(
      s.contract.quote({ ...e.ticket, observedAt: e.ticket.observedAt + 300 }),
      "StaleObservation",
    );
    await s.raw.request({ method: "evm_increaseTime", params: [3601] });
    await s.raw.request({ method: "evm_mine", params: [] });
    await denied(s.contract.quote(e.ticket), "StaleObservation");
    await s.raw.request({ method: "evm_increaseTime", params: [86400] });
    await s.raw.request({ method: "evm_mine", params: [] });
    await denied(s.contract.quote((await ticket()).ticket), "RouteUnavailable");
    await (await s.contract.close(s.route)).wait();
    assert.equal(
      await s.token.balanceOf(await s.buyer.getAddress()),
      50000000n,
    );
  },
);
isolated(
  "revocation returns only remaining escrow and invalidates signed tickets",
  async () => {
    const first = await ticket(),
      r = await releaseFor(s.contract, s.chainId, first, s.agent);
    await settleSigned(s.contract, first, r);
    const second = await ticket({ lot: randomId() }),
      pending = await releaseFor(s.contract, s.chainId, second, s.agent);
    await denied(
      s.contract
        .connect(await s.provider.getSigner(1))
        .close.staticCall(s.route),
      "NotOwner",
    );
    const event = parseEvent(
      await (await s.contract.close(s.route)).wait(),
      s.contract,
      "Closed",
    );
    assert.equal(event.returnedAmount, 3750000n);
    assert.equal(
      await s.token.balanceOf(await s.buyer.getAddress()),
      49250000n,
    );
    await denied(
      s.contract.settle.staticCall(
        second.ticket,
        second.stationSig,
        pending.agentSig,
      ),
      "RouteUnavailable",
    );
    await denied(s.contract.close.staticCall(s.route), "RouteUnavailable");
  },
);
isolated(
  "separate valid lots cannot collectively exceed the route budget",
  async () => {
    for (let i = 0; i < 3; i++) {
      const e = await ticket({ lot: randomId(), crates: 12 });
      await settleSigned(
        s.contract,
        e,
        await releaseFor(s.contract, s.chainId, e, s.agent),
      );
    }
    await denied(
      s.contract.quote((await ticket()).ticket),
      "InsufficientBudget",
    );
    assert.equal(await s.token.balanceOf(s.carrier), 4500000n);
  },
);
isolated(
  "invalid route roles and unsound limits fail before funding",
  async () => {
    for (const t of [
      { agent: s.station.address },
      { carrier: ZeroAddress },
      { carrier: s.contract.target },
      { budget: 100 },
      { floor: 90 },
      { expiry: 1 },
      { expiry: (await head(s.provider)) + 40 * 86400 },
    ])
      await denied(
        s.contract.open.staticCall(randomId(), { ...s.terms, ...t }),
        "BadTerms",
      );
  },
);
isolated("the same owner salt cannot reopen a closed route", async () => {
  const salt = randomId(),
    buyer = await s.buyer.getAddress();
  await (await s.token.approve(s.contract.target, s.terms.budget)).wait();
  await (await s.contract.open(salt, s.terms)).wait();
  await (await s.contract.close(routeId(buyer, salt))).wait();
  await denied(s.contract.open.staticCall(salt, s.terms), "AlreadyOpened");
});
isolated(
  "an independent gas relayer cannot change the payee or amount",
  async () => {
    const e = await ticket(),
      release = await releaseFor(s.contract, s.chainId, e, s.agent);
    await settleSigned(
      s.contract.connect(await s.provider.getSigner(1)),
      e,
      release,
    );
    assert.equal(await s.token.balanceOf(s.carrier), 750000n);
  },
);
isolated("separate route budgets and replay domains are isolated", async () => {
  const e = await ticket(),
    release = await releaseFor(s.contract, s.chainId, e, s.agent),
    salt = randomId();
  await (await s.token.approve(s.contract.target, s.terms.budget)).wait();
  await (await s.contract.open(salt, s.terms)).wait();
  const route = routeId(await s.buyer.getAddress(), salt);
  const changed = { ...e.ticket, route, observedAt: await head(s.provider) };
  await denied(
    s.contract.settle.staticCall(changed, e.stationSig, release.agentSig),
    "StationSignature",
  );
  assert.equal((await s.contract.routeOf(route)).remaining, 4500000n);
});

test("receiving desk ticket settles through the agent and a repeated physical lot is held", async () => {
  const { signDelivery } = await import("../src/receiving.mjs");
  const fields = {reference:"Dock-127", crates:"6", low:"2.4",high:"6.7", observedAt:await head(s.provider)};
  await assert.rejects(signDelivery({...s,station:Wallet.createRandom()},fields),/station wallet/);
  await assert.rejects(signDelivery(s,{...fields,high:"9.0"}),/temperature/);
  const envelope = await signDelivery(s,fields);
  const release = await releaseFor(s.contract,s.chainId,envelope,s.agent);
  const proof = await settleSigned(s.contract,envelope,release);
  assert.equal(proof.amountBaseUnits,"750000");
  await assert.rejects(signDelivery(s,{...fields,reference:"dock-127"}),/already been paid/);
});
