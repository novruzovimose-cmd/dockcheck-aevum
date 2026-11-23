import { getAddress, parseUnits, ZeroAddress } from "ethers";

// Validate all buyer-entered terms before asking the wallet for an allowance.
export function routeTerms(fields, now, contract) {
  const addresses = {};
  for (const role of ["carrier", "station", "agent"]) {
    try {
      addresses[role] = getAddress(fields[role]);
    } catch {
      throw Error("Enter a valid " + role + " address.");
    }
  }
  const roles = Object.values(addresses);
  if (
    roles.includes(ZeroAddress) ||
    new Set(roles).size !== 3 ||
    roles.includes(getAddress(contract))
  )
    throw Error(
      "Choose three distinct nonzero operator addresses outside the escrow contract.",
    );

  function amount(field) {
    const value = String(fields[field]);
    if (!/^\d{1,23}(\.\d{1,6})?$/.test(value))
      throw Error(
        "Enter " + field + " in tUSD8 with up to six decimal places.",
      );
    const units = parseUnits(value, 6);
    if (units <= 0n || units >= 1n << 96n)
      throw Error("Invalid " + field + ".");
    return units;
  }
  const budget = amount("budget"),
    unitPrice = amount("unitPrice");
  if (budget < unitPrice)
    throw Error("The budget must cover at least one crate.");
  function integer(value, min, max, name) {
    if (
      !/^\d+$/.test(String(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw Error("Enter " + name + " between " + min + " and " + max + ".");
    return Number(value);
  }
  function temperature(value) {
    if (!/^-?\d{1,4}(\.\d)?$/.test(String(value)))
      throw Error("Use one decimal place or whole degrees for temperatures.");
    const tenths = Math.round(Number(value) * 10);
    if (tenths < -32768 || tenths > 32767)
      throw Error("Temperature exceeds the contract range.");
    return tenths;
  }
  const floor = temperature(fields.lowC),
    ceiling = temperature(fields.highC);
  if (floor > ceiling)
    throw Error("Minimum temperature exceeds maximum temperature.");
  return {
    ...addresses,
    budget,
    unitPrice,
    floor,
    ceiling,
    maxCrates: integer(fields.maxCrates, 1, 4294967295, "the crate cap"),
    expiry: now + 3600 * integer(fields.hours, 1, 720, "validity in hours"),
  };
}
