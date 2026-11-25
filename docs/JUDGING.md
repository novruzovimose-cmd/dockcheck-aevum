# Ten questions DockCheck has to answer

The organizer puts 20 points on originality and 15 each on presentation, integration, utility, and safety. The first build's strongest feature was the contract. Its weakest point was how much a judge had to take on trust. The walkthrough and receipt verifier make the good outcome and the failure cases reproducible.

| Question a judge could ask | What DockCheck can show |
| --- | --- |
| 1. Who needs this and where does it hurt? | A produce distributor and its carrier must reconcile accepted quantities and temperature exceptions. The proposed pilot starts with one receiving dock and a small carrier group. Customer validation is still open. |
| 2. Why is it more than a stablecoin checkout? | A buyer escrows the budget before arrival. A station attests to the delivery, an agent checks the scope, and the contract pays a fixed rate per accepted crate. The audit ties freight to the specific receiving event. |
| 3. Why do we need an agent? | The receiving event may arrive after the buyer is away. The worker can evaluate, sign and submit its limited release automatically. The station signs independently in CLI mode. |
| 4. What can a compromised agent do? | The agent cannot sign for the station, change the carrier or rate, exceed the funded pool, or revive a closed route. Losing both keys is a different threat. Treat station identity and physical sensor integrity as part of the pilot. |
| 5. Can I try it before making a wallet? | The public walkthrough opens a fresh local EVM, deploys the same Solidity build, and shows six verified steps without wallet prompts. The existing interactive desk remains available for manual use. |
| 6. Can I catch a fake success screen? | The Aevum verifier accepts a transaction hash or shareable link. It reconstructs both signatures from the settlement calldata and validates the canonical receipt, contract code, exact tUSD8 transfer, carrier, and measured policy. A missing, reverted, or unrelated transaction never gets a success result. |
| 7. What happens when something goes wrong? | The walkthrough checks exact contract reverts for overheating, duplicate delivery, and post-revocation release. It verifies that rejected receipts leave balances unchanged and reconciles escrow to 0.75 paid and 3.75 returned. |
| 8. Is the payment actually on Aevum? | The wallet and CLI target chain 44005, the constructor enforces the official tUSD8 address, and the receipt verifier checks the configured network. The live RPC simulated the constructor and returned the expected runtime bytecode. A funded deployment and successful public receipt are still required for submission. |
| 9. Can I reproduce the result from source? | The public repository, locked dependencies, compiler input, tests and downloadable rehearsal include the minimum required to rebuild and run the demo. The browser and CLI walkthrough share one implementation. |
| 10. Can it become a product? | A pilot compares dock-to-payment time and manual reconciliation rate against the present process. A depot can pay for warehouse integration, reconciliation and support. The open contract and receipt format are reusable. |

## What would most improve the score now

Publish one actual Aevum settlement, share its hash through the verifier, and link the contract address and verification evidence. This is the eligible demo path. Capture the operator's actual result and the funding, settlement and refund receipts. A conversation with one receiving or freight operator is a stronger test of the workflow than adding another unrelated feature.

Organizer rubric: https://qday.io/builder-challenge

## Who would use this first?

A produce distributor with a receiving clerk and a separate freight-payables operator is the proposed pilot customer. GS1’s EANCOM receiving-advice examples already distinguish accepted quantities and damage-related variances. That supports the choice of workflow. DockCheck currently works at the lot level and exports its own JSON. A production EDI connector would still need item identifiers, order-line mapping and the receiving partner’s conventions. [GS1 receiving advice, section 6](https://www.gs1.org/sites/default/files/docs/eancom/s3/recadv.pdf)

Start a shadow trial using historical, de-identified delivery slips. Ask a clerk to record accepted quantities without coaching, then ask payables to match each result to its bill. Record time to a match, mistaken approvals, how often the same slip is imported twice, and how often held goods are later accepted. Compare with the existing process on the same slips. Stop the pilot if a partial receipt causes the carrier to be booked twice or if a later release is required under the same lot. The release currently treats each settled lot as final.

The commercial hypothesis is a per-site integration and support fee for distributors. The first distribution experiment would be an introduction through a warehouse software integrator. Willingness to pay, costs and operator adoption remain unmeasured.
