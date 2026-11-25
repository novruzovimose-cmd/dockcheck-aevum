# Resolve a held delivery

This flow serves buyers and carriers who agree on freight per accepted crate. Both use the same numbered manifest before delivery. One prepaid delivery supports up to 256 crate positions and one final review. The receiving station attests to physical acceptance. The contract does not measure temperature or independently identify a physical crate. A different manifest reference creates a different delivery, so the buyer must keep that reference unique to the shipment.

| Moment | Default eight-crate case at 0.01 per crate |
|---|---|
| Fund | Buyer commits 0.08 with a fixed carrier, station, reviewer and deadlines. |
| Receive | Station signs for crates 1–6. Carrier receives 0.06. The contract retains 0.02. |
| Review | Reviewer signs for crate 7. Carrier receives 0.01. The buyer recovers 0.01 for crate 8. |
| Reconcile | One record contains all eight crate outcomes, both decisions’ reason hashes and the transaction references. |

Either decision may be submitted by any relayer. EIP-712 signatures bind the contract, network, delivery ID, exact crate selection and reason hash. Review also signs the initial accepted selection. Zero releases rejects every held crate. All crates accepted at intake closes immediately. When a deadline passes, anyone can call expire. It refunds outstanding funds to the original buyer. No scheduler is bundled. An expired unresolved crate is marked expired, distinct from reviewer rejection. Keep the original reasons with the manifest to interpret their public hashes. Settlement finality governs freight payment only.

## Run with test tokens on Aevum

Install Node 22 and run npm ci and npm run build. Use separate assigned signer wallets. The buyer and relayer need test gas. The buyer needs official test tUSD8. Keep signer environment variables on the machine of their respective operator. The included combined signing/relay command assumes access to the decision signer and a gas relayer; applications may sign offline and pass the signed arguments to the contract separately.

1. Set BUYER_KEY and run `npm run reserve -- deploy`. Set RESERVE_ADDRESS to its output.
2. Create terms.json using the structure below. Replace all addresses and the placeholder deadlines with Unix timestamps. Receipt must precede review and both must be within the next 30 days. Price is in six-decimal token base units.
3. Run `npm run reserve -- fund terms.json`. Set DELIVERY_ID and FUNDING_BLOCK from its output. Retrying with the same buyer and normalized manifest reference cannot fund the manifest twice on this contract.
4. Set STATION_KEY and RELAYER_KEY. Run `npm run reserve -- intake intake.json`.
5. Set REVIEWER_KEY and RELAYER_KEY. Run `npm run reserve -- review review.json`. After the applicable deadline use `npm run reserve -- expire` to refund outstanding funds.
6. Use `node scripts/reserve.mjs statement > statement.json` to reconstruct the accounting record without any private key. It reads state and contract events through the same block. Transaction hashes are suitable for explorer lookup. The legacy SQLite importer takes individual route payment entries; this export is one reserve statement with two possible payments.

Example input files, in order:

```json
{"manifestReference":"DOCK-042","terms":{"carrier":"CARRIER_ADDRESS","station":"STATION_ADDRESS","reviewer":"REVIEWER_ADDRESS","price":"10000","crates":8,"receiptBy":0,"reviewBy":0}}
```

```json
{"crates":[1,2,3,4,5,6],"reason":"Packaging damage on crates 7 and 8"}
```

```json
{"crates":[7],"reason":"Crate 7 cleared at inspection; crate 8 rejected"}
```

## Field trial

Replay a de-identified manifest with a receiving clerk and a payables operator. Record their original time to resolve the invoice and the time with DockCheck. Compare accepted positions, total carrier payment and final buyer refund against the actual resolution. Ask whether the assigned reviewer and deadline fit their agreement. Record any goods that required more than one review or lacked traceable crate identifiers. Those outcomes establish whether this workflow fits a real site. Adoption and savings remain unmeasured.
