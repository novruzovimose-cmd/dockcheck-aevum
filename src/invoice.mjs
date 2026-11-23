// One invoice line in the receipt's currency. Keep six-decimal arithmetic exact.
import { parseUnits } from "ethers";

export function compareInvoice(proof, { reference, quantity, total }) {
  const ref = typeof reference === "string" ? reference.trim() : "";
  if (!ref || ref.length > 80 || /[\x00-\x1f\x7f]/.test(ref))
    throw Error("Enter an invoice reference of 1–80 printable characters.");
  if (!/^[1-9]\d{0,8}$/.test(quantity))
    throw Error("Enter a whole number of billed crates from 1 to 999,999,999.");
  if (!/^(0|[1-9]\d{0,17})(\.\d{1,6})?$/.test(total))
    throw Error(
      "Enter a nonnegative freight total with up to six decimal places.",
    );
  const billed = parseUnits(total, 6);
  const paid = BigInt(proof.amountBaseUnits);
  const difference = billed - paid;
  const cratesDifference = Number(quantity) - Number(proof.crates);
  return {
    reference: ref,
    chainId: proof.chainId,
    currency: proof.chainId === 44005 ? "tUSD8" : "LOCAL",
    contract: proof.contract,
    transaction: proof.transactionHash,
    carrier: proof.carrier,
    lot: proof.lot,
    billedCrates: Number(quantity),
    acceptedCrates: Number(proof.crates),
    cratesDifference,
    billedBaseUnits: billed.toString(),
    paidBaseUnits: paid.toString(),
    differenceBaseUnits: difference.toString(),
    status:
      cratesDifference === 0 && difference === 0n ? "Matched" : "Review needed",
  };
}
