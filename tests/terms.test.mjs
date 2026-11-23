import test from "node:test";
import assert from "node:assert/strict";
import { routeTerms } from "../src/route-terms.mjs";
const addr = (n) => "0x" + n.toString(16).padStart(40, "0");
const policy = {
  carrier: addr(1),
  station: addr(2),
  agent: addr(3),
  budget: "0.18",
  unitPrice: "0.000001",
  lowC: "-2.4",
  highC: "0.0",
  maxCrates: 18,
  hours: 720,
};
test("buyer terms retain six decimals, signed temperature and expiry", () => {
  const result = routeTerms(policy, 100, addr(4));
  assert.equal(result.unitPrice, 1n);
  assert.equal(result.budget, 180000n);
  assert.equal(result.floor, -24);
  assert.equal(result.expiry, 2592100);
});
test("invalid policy or actor is rejected before a wallet request", () => {
  for (const bad of [
    { hours: 721 },
    { hours: "" },
    { agent: addr(2) },
    { carrier: addr(4) },
    { agent: addr(0) },
    { budget: "0.0000001" },
    { unitPrice: "0.19" },
    { unitPrice: "0" },
    { maxCrates: 0 },
    { lowC: "0.01" },
    { highC: -3 },
  ])
    assert.throws(() => routeTerms({ ...policy, ...bad }, 100, addr(4)));
});
