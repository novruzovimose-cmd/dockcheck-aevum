import test from "node:test";
import assert from "node:assert/strict";
import { compareInvoice } from "../src/invoice.mjs";
const proof = {
  chainId: 44005,
  crates: "6",
  amountBaseUnits: "60000",
  transactionHash: "receipt",
  lot: "lot",
  carrier: "carrier",
  contract: "desk",
};
const line = (quantity, total) =>
  compareInvoice(proof, { reference: "INV-42", quantity, total });
test("eight billed versus six received flags two crates and the exact excess", () => {
  const report = line("8", "0.08");
  assert.equal(report.status, "Review needed");
  assert.equal(report.cratesDifference, 2);
  assert.equal(report.differenceBaseUnits, "20000");
  assert.equal(report.transaction, proof.transactionHash);
});
test("identical totals cannot conceal a quantity mismatch", () => {
  assert.equal(line("8", "0.06").status, "Review needed");
  assert.equal(line("6", "0.06").status, "Matched");
});
test("underbilling and one-base-unit differences retain their direction", () => {
  assert.equal(line("6", "0.059999").differenceBaseUnits, "-1");
  assert.equal(line("6", "0.060001").differenceBaseUnits, "1");
});
test("invalid decimals, crate counts and blank references cannot generate reports", () => {
  for (const [q, t] of [
    ["0", "0.00"],
    ["2.1", "0.08"],
    ["6", "1e2"],
    ["6", "0.0000001"],
    ["6", "-1"],
  ])
    assert.throws(() => line(q, t));
  assert.throws(() =>
    compareInvoice(proof, { reference: " ", quantity: "6", total: "0.06" }),
  );
});
