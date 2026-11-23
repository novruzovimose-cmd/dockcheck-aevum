# A judge's benchmark for DockCheck

These are ten hypothetical entries a judge could compare against DockCheck. They describe credible products with an advantage over the previous build.

| Competing concept | What a judge would see | Where it would beat the old desk | What DockCheck takes from it |
| --- | --- | --- | --- |
| Sensor-backed cold-chain settlement | A temperature chart with excursion markers, device signature and calibration date beside the split invoice | More believable measurements than an operator typing two numbers | Show precisely which party signed the reading. Put calibrated sensors and attestation on the pilot roadmap. The receiving station still attests to the reading. |
| Proof-of-delivery escrow | A mobile scan opens the shipment, displays the two signers, and ends with a settlement receipt | A clearer physical handoff with less typing | Present the lot, receiving signature, authorization and transfer in the same verified receipt. |
| Freight controller's reconciliation desk | A three-column journal showing funded, paid and refunded, plus a downloadable packet | Faster independent accounting and review | Verify all three legs from canonical receipts, reconcile exact base units, and export the packet across browser and CLI. |
| Split-delivery invoice matcher | Ordered, received and accepted crates side by side, with partial payment calculated on-screen | Makes shortages, partial acceptance and carrier incentives understandable | Surface accepted quantity × fixed rate in the verified receipt. Keep broader inventory reconciliation out of this release. |
| Route exception and dispute desk | A chronological queue with reason codes, ownership and action buttons | Gives an operator a way to respond when telemetry or shipment data is disputed | Make warm, replay and revoked states repeatable. Leave adjudication and override authority to a later pilot design. |
| Carrier proof portal | A tiny read-only screen opened from an explorer hash or invoice | A carrier can check that it was paid without operating the buyer's desk | Keep the no-wallet hash verifier and add a closed-route audit that needs only three block explorer hashes. |
| Delegated fleet wallet | One screen for authorized signers, caps, expiration, and a revocation timeline | Makes control boundaries easier to demonstrate and explain | Tie recovered signers to the exact approved route and show that a closed route rejects further releases. |
| Privacy-preserving customs escrow | A verifier sees a policy result without receiving the raw contents of a shipping record | Protects sensitive shipment details | Use opaque lot IDs and keep shipment names and invoices off-chain. Publish the current limits on the confidentiality of quantities and readings. |
| Gas-sponsored merchant payments | The buyer sees the testnet budget, funding readiness and a single status timeline | A judge gets to an actual payment faster | Put both wallet balances in setup, offer a 0.10 tUSD8 pilot, and journal each signed transaction so reruns recover the same sequence. |
| Pay-by-result operations SDK | A small integration with a shipment webhook and a code sample that reproduces the exact result | Another team can use the payment primitive without recreating a dashboard | Make route auditing a module and a CLI entry point. Demonstrate both with one packet schema and replayable fixtures. |

## The entry I would submit

A buyer escrows freight money. A receiving station and scoped agent sign the same cold-chain ticket. The carrier is paid once for the accepted crates. The buyer closes the route and reclaims the balance. The judge independently reconciles the whole flow using **three transaction hashes**. Bad deliveries and repeated lots do not generate another transfer.

Run **Run the walkthrough**, then **Inspect route audit** to see that result immediately. For public Aevum evidence, run the faucet-sized pilot, save the packet, and paste the three hashes in **Audit a route**. Its audit intentionally covers one payout, so incomplete evidence for a multi-payout route is rejected. The CLI can re-verify the packet from any local checkout.

## What could still outrank this

A competitor with real carrier feedback and a mined Aevum receipt has stronger evidence even if its interface is simpler. A competitor with verifiable sensor provenance has a stronger answer to dishonest temperature input. The next comparison should measure a live Aevum run and feedback from one freight operator. Treat adoption, automated sensor truth, and public settlement as claims that need their own evidence.

Reference points for the product concepts include structured electronic trade documents and QDay's published ecosystem capabilities. See [CargoX](https://cargox.io/create-documents), [QDay Wiki](https://wiki.qday.info/guide/handbook/ecosystem/) and the [challenge rubric](https://qday.io/builder-challenge).
