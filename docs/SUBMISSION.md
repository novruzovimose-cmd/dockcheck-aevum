# Aevum Builder Challenge 1 · Invoice Payments

[Open the live app](https://raw.githack.com/novruzovimose-cmd/dockcheck-aevum/site-v1.6.0/index.html) · [Watch the local demo without signing in](https://raw.githack.com/novruzovimose-cmd/dockcheck-aevum/site-v1.6.0/DockCheck-demo.mp4) · [Download the packaged app](https://github.com/novruzovimose-cmd/dockcheck-aevum/releases/tag/v1.6.0)

| Requirement | Evidence |
|---|---|
| Public open source | MIT license, contract sources, locked dependencies, compiler inputs and reproducible tests in this repository |
| End-to-end Aevum tUSD8 flow | Choose Verify the public payment. The RPC verifies the original deposit of 0.10, the station and agent signatures, the carrier's 0.06 transfer and the buyer's 0.04 refund on chain 44005. Each movement has an explorer link. |
| Verified source | [Deployed DockCheck contract](https://explorer-test.qday.info/address/0x181BA084DCb2946EB65Cb020B85dA5e8ED44431e?tab=contract); the explorer API reported is_verified and is_fully_verified. Run npm run verify:source to reproduce the creation and runtime match. |
| Working deployment | Browser app, Windows and Linux launchers, and the Docker image in delivery/. |
| Documentation and presentation | [README](../README.md), [operator guide](AEVUM.md), [protocol](PROTOCOL.md), [live pitch](PITCH.md). Registration, team details and finalist attendance are entrant actions. |

## What to show a judge

1. Open the public verifier without a wallet. Click a transaction to inspect the public receipt and linked contract.
2. Check an example bill for eight crates and 0.08 against the six crates actually paid. Correct it to six and 0.06 to show the match.
3. Demonstrate the scoped agent, expiry, duplicate protection and ledger import. Show the local held-crate extension separately: pay for six, inspect two, release one, refund one. The reserve statement checks individual token transfers.
4. Explain the proposed per-site support model for distributors, the receiving team's role, and the pilot in [Delivery reserve](DELIVERY-RESERVE.md). Time savings and willingness to pay require external validation.

The starter kit assigns 15 points for UX, 10 for demo, 10 for documentation, 20 for originality, 15 for integration, 15 for utility, and 15 for safety. DockCheck uses application-scoped signing roles and budgets. ERC-4337 and ERC-8004 are not implemented. The original payment runs on Aevum. DeliveryReserve is a separate local extension. The video is a local walkthrough, and a finalist must perform the live presentation. Submit via DoraHacks before December 11 at 08:00 UTC.

[Organizer](https://qday.io/builder-challenge) · [Official starter kit](https://drive.google.com/file/d/1ZE4rrswrxrOzzdRDmXlC6khPuk1JKit_/view)
