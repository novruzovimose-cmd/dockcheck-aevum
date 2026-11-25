import { getAddress, id, verifyTypedData } from "ethers";
import { domain, head, ticketTypes } from "./protocol.mjs";

export async function signDelivery({provider, contract, route, station, chainId}, fields) {
  if (!/^0x[0-9a-f]{64}$/i.test(route)) throw Error("Enter the full route ID from the buyer.");
  const state = await contract.routeOf(route);
  const now = await head(provider);
  if (getAddress(await station.getAddress()) !== state.terms.station)
    throw Error("Connect the receiving station wallet assigned to this route.");
  if (state.closed || now >= Number(state.terms.expiry)) throw Error("This route has closed or expired.");
  const ref = fields.reference.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(ref)) throw Error("Use the shipment’s lot reference with letters, digits, dots, slashes, underscores or hyphens.");
  const lot = /^0X[A-F0-9]{64}$/.test(ref) ? ref.toLowerCase() : id(ref);
  if (await contract.paid(route, lot)) throw Error("This lot has already been paid on this route.");
  const crates = Number(fields.crates);
  if (!Number.isSafeInteger(crates) || crates < 1 || crates > state.terms.maxCrates) throw Error("Accepted crates exceed the route limits or are missing.");
  const temp = value => {
    if (!/^-?\d+(\.\d)?$/.test(String(value))) throw Error("Enter temperatures to one decimal place.");
    return Math.round(Number(value)*10);
  };
  const low = temp(fields.low), high = temp(fields.high);
  if (low > high || low < state.terms.floor || high > state.terms.ceiling) throw Error("Hold this shipment for review. Its temperature is outside the route policy.");
  const observedAt = fields.observedAt;
  if (!Number.isSafeInteger(observedAt) || observedAt < state.openedAt || observedAt > now || now-observedAt > 3600)
    throw Error("Use the actual observation time, within the last hour and after route opening.");
  if (BigInt(crates)*state.terms.unitPrice > state.remaining) throw Error("Escrow is insufficient for this ticket.");
  const ticket = {route,lot,crates,low,high,observedAt};
  await contract.quote(ticket);
  const scope = domain(chainId,contract.target);
  const stationSig = await station.signTypedData(scope,ticketTypes,ticket);
  if (verifyTypedData(scope,ticketTypes,ticket,stationSig) !== state.terms.station) throw Error("The signature differs from the assigned station.");
  return {version:1,chainId,contract:contract.target,ticket,stationSig};
}
