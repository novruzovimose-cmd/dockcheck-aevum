# Protocol and operating assumptions

## Life of a freight payment

The buyer calls open(salt, terms) after granting an exact ERC-20 allowance. The contract transfers the route budget into escrow atomically. Its ID is keccak256(abi.encode(buyer, salt)). Reusing a buyer's salt cannot fund a second route. Terms bind one carrier, one receiving station, one payment agent, unit price, budget, maximum crates, temperature floor and ceiling in tenths of a degree, and expiry. Fresh demo routes last 24 hours; the contract limits any route to 30 days.

The station creates a route-scoped opaque lot identifier and signs a ticket. The agent reads the route, checks the station signature, obtains a quote via eth_call, signs a release and simulates settle. Any relayer can pay the gas. During settlement the contract rechecks every rule, consumes the lot marker and decrements escrow before transferring tokens. One route cannot spend another route's budget. A token transfer failure rolls back the entire transaction. Close can only be called by that route's owner and refunds its exact remaining escrow.

## Data and API

EIP-712 domain fields are name "DockCheck", version "1", chainId, and verifyingContract. The receiver and agent sign different types. The release binds the complete typed ticket hash, including its chain and contract.

```text
Ticket(bytes32 route,bytes32 lot,uint32 crates,int16 low,int16 high,uint64 observedAt)
Release(bytes32 ticketHash)
```

| Contract API | Caller | Effect |
| --- | --- | --- |
| open(bytes32 salt, Terms terms) | Buyer | Pull exact budget and store immutable route policy |
| routeOf(bytes32 id) | Anyone | Read buyer, available escrow, released total, opening time, closed state and terms |
| ticketHash(Ticket ticket) | Anyone | Compute Solidity's domain-bound receiver digest |
| quote(Ticket ticket) | Anyone | Check public rules, return amount or typed error |
| paid(bytes32 route, bytes32 lot) | Anyone | Check whether this lot has settled |
| settle(Ticket, bytes stationSig, bytes agentSig) | Any gas relayer | Verify both signers and policy; transfer to the fixed carrier |
| close(bytes32 id) | Route owner | Revoke future payments and return remainder |

Events are Opened, Settled and Closed. Settled includes route, lot, carrier, crate count, amount in base units and ticket hash. The token emits its separate Transfer log. Backend systems can import the helpers directly:

```js
import { releaseFor, settleSigned } from "./src/protocol.mjs";
import { verifyPayment, proofFromHash } from "./src/verify.mjs";

const release = await releaseFor(contract, 44005, signedStationEnvelope, scopedAgent);
const proof = await settleSigned(contract.connect(relayer), signedStationEnvelope, release);
const result = await verifyPayment(provider, proof);
const reconstructed = await proofFromHash(provider, contract, proof.transactionHash);
```

The public API example assumes its parameters have already been initialized with the selected route and Aevum wallets. scripts/agent.mjs is the runnable reference including retry journaling. A proof contains the chain, contract, block number/hash, transaction hash, route, lot, carrier, human-checkable quantities, original ticket, station signature and agent signature. Opaque lot IDs should be generated from secure random bytes and kept stable for retries. Keep any mapping to internal shipment IDs off-chain.

## Conditions for acceptance

| Check | Enforced at settlement |
| --- | --- |
| Freshness | Observation must be at or after route opening, no more than 1 hour old, and no later than the current block time |
| Expiry and revocation | Payment block must precede route expiry. A mined close prevents future settlements |
| Quality | Signed minimum must not exceed signed maximum. Both must be within the inclusive policy band |
| Quantity | From 1 through maxCrates. Amount equals crates × unitPrice and fits available escrow |
| Payee | Always the carrier in the funded route. No recipient comes from a job file |
| Authorization | Receiver signature and agent release over the same EIP-712 ticket. The authorized station and agent addresses must differ |
| Replay | Each route and lot pair can settle once. Reopening with the same owner salt is forbidden |
| Ledger | Sum of released and remaining equals original budget while open. At close, released plus refund equals original budget |

## Trust, privacy and operational limits

- The station attests to measurements. A compromised sensor, dishonest station or reused physical label needs operational controls outside the contract. Two addresses do not prove two independent organizations. The browser demonstration drives both keys in one tab; separate the keys and processes for an operational pilot.
- A compromised agent alone cannot change a receiving ticket or its payee. Colluding station and agent can consume the remaining route budget using invented lots. Caps bound this loss. If the station assigns two different lot IDs to the same physical delivery, the blockchain cannot recognize that duplication.
- Revocation becomes effective at inclusion in a block. A valid payment can win a race with a pending revocation. Review confirmations on the explorer before treating a refund as final.
- On-chain quantities, readings, timestamps, addresses, lot commitments, calldata signatures and token amounts are public. Customer names, contact details, invoices, and GPS traces have no fields. Predictable identifiers are linkable. Large-scale pilots should test batch commitments or zero-knowledge disclosures.
- This is an application-scoped agent authorization on the Aevum EVM. It uses testnet ERC-20, EIP-712 and native transaction gas. There is no claim of native ERC-4337, ERC-8004, x402, hardware attestation, or post-quantum protection for the application's ECDSA signers.
- The supported settlement token on chain 44005 is pinned at construction. The rehearsal token can deploy only on 31337. The app assumes normal exact ERC-20 transfer semantics. No upgrade proxy, global owner or fee withdrawal exists in DockCheck. The buyer can recover only the funds in its own funded route. Unsolicited direct token transfers have no refund path.
- The verifier checks a successful canonical receipt when queried. Chain reorganizations and upstream token changes remain possible. Re-run verification before operational reconciliation. The UI waits for one confirmation for the hackathon demo.
- Station and scope keys use EOA ECDSA. Smart-contract signature verification (EIP-1271) would be needed for contract signers. A contract wallet may own a route if it can call approve, open and close.
- The CLI worker uses deterministic policy checks without free-form instructions. It constrains chain, contract, route, payee and amount. No model or external prompt can override the on-chain bounds.

## Retry and failure recovery

| Event | Behavior |
| --- | --- |
| Repeated ticket job | Already-paid lot cannot initiate a second successful transfer. A completed file has a verified receipt |
| Worker exits after signing | Its immutable journal is written before broadcast. The same signed raw transaction and hash are reused |
| RPC unavailable or confirmation times out | The watcher retries after 60 seconds. One-shot exits with a nonzero status. Inspect hash before making another attempt |
| Multiple relayer processes | Use one dedicated gas account per worker. Duplicate receipts still cannot pay twice. Sharing a gas account across workers can cause unrelated nonce conflicts |
| Transaction reverted or nonce replaced by an unrelated transaction | Inspect the journal hash, pending nonce, on-chain lot marker and current terms. Archive the failed journal only after confirming it cannot settle and that the lot is unpaid. Submit a fresh valid ticket where appropriate |
| Browser closes after broadcast | Contract remains authoritative. Resume using the saved address and route ID, use Sync recent blocks, or reconstruct by transaction hash |
| Lost session key | Buyer can close and refund old route and issue a new route. An existing authorization never silently gains new signers |
| Unsettled rejected job | A hold is a local preflight result. It is not presented as a public chain event |

## Pilot and ecosystem contribution

The first prospective customer is a produce distributor paying a small pool of refrigerated carriers. A pilot would ingest signed warehouse receiving tickets from a barcode scanner, compare time to reconcile carrier invoices, count duplicate attempts, and measure exceptions requiring manual handling. Interview the warehouse lead and carrier accountant before asserting demand.

The pilot business model is a monthly fee per operating depot for an indexer, equipment integrations and reconciliation exports. The open-source contract has no protocol fee. A first rollout could come through a cold-storage operator or warehouse software vendor. Roadmap: separate station and agent hardware identities, multi-confirmation indexer, exception and dispute workflow, and independent security review before a mainnet decision. The proof verifier and ticket envelope can be reused for dry freight or pay-per-task workloads with a different policy contract.

Platform feedback to offer the organizers: the starter app and wiki differ on explorer verification availability. A tested standard-JSON example and explicit RPC log-range cap in the main setup guide would reduce first-deployment friction. This is a documentation observation, not a reported bug or upstream contribution.
