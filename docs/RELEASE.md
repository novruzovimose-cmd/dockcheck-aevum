# DockCheck 1.5.0

DeliveryReserve introduces prepaid manifests, numbered crate positions, immediate payment on intake, review of held freight and deadline refunds. Choose **Resolve held crates** for the interactive workflow or use the Aevum operator CLI described in [Delivery reserve](DELIVERY-RESERVE.md). The public payment evidence is from the earlier DockCheck route contract. The new reserve has local execution evidence only.

The accounting verifier links a signed receiving exception to its exact mined payment. A reference SQLite importer supports duplicate handling, later attachment of inspection evidence, and conflict review. The browser desk and CLI also reconcile multiple payouts on a closed route. Accepted quantity and the token transfer remain independently verifiable when a station attachment is unavailable.

Receiving clerks can record delivered and accepted quantities separately. Partial receipts include a second EIP-712 signature binding the delivered count and exception reason to the payment ticket. The agent checks an attached exception before relay. Only accepted crates are payable. A settled lot is final. Held crates cannot be settled later under the same lot identifier.

Try **Try a partial delivery** on localhost for the eight-crate case. The isolated blockchain pays for six and returns remaining escrow when the buyer closes the route. The public Aevum receipt is a separate, earlier payment. Use the exported walkthrough record to inspect the signatures. Station observations are human attestations.


Receiving stations can open **Receive a delivery and sign a ticket**, enter their route and actual measurements, review the ticket, sign with their assigned wallet, and download agent-compatible JSON. The agent consumes it with `npm run agent -- ticket.json`. Use the same physical lot reference on every retry. A full 32-byte lot ID is preserved for CLI interoperability. Other references are uppercased and hashed. The station attests to the measurements.

This release serves buyers, receiving stations, carriers and accounts-payable teams on the Aevum public testnet (44005). The default workspace verifies existing carrier payments. Route funding uses buyer-defined terms and independently held station and agent signing keys. The signed delivery and escrow contracts are compatible with the existing deployed contract.

Download the versioned ZIP and its SHA-256 file. Extract the ZIP, then open START-WINDOWS.cmd on Windows x64. The archive includes native Windows and Linux x64 servers, a Node server for other systems, a loadable Linux x64 Docker image, source, public receipts, compiler evidence and the local walkthrough film. The desktop launchers bind to your machine’s loopback address. Browser data and CLI signer journals are stored locally.

For upgrades, extract into a new folder. Retain the original signer environment and private worker journal when continuing an active route. New browser-funded routes use independent station and agent addresses; lost temporary keys from older browser-created routes remain unrecoverable. Only the buyer can refund remaining escrow. The checked-in Aevum evidence is a completed test-token payment. An independent third-party security audit and an explorer-issued source badge have not been established.
