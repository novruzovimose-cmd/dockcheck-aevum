# Operating DockCheck on Aevum

| Parameter | Value |
| --- | --- |
| Network | QDay Aevum Testnet |
| Chain ID | 44005 / 0xabe5 |
| RPC | https://rpc-test.qday.info |
| Explorer | https://explorer-test.qday.info |
| Gas | tQDAY |
| Settlement token | tUSD8 · 6 decimals · 0x456569838f1d43009A91ebA4263147Afd7233483 |
| Contract build | solc 0.8.28+commit.7893614a, optimizer 200, Shanghai |

Only use test tokens. The buyer needs enough test gas for deployment and funding and at least 0.10 tUSD8 for the faucet-sized pilot. The separate CLI relayer needs test gas. The receiving station and scoped agent do not need gas. The official faucet is https://faucet.qday.info/. Its eligibility requirements can change. The observed public form required an eligible wallet with a qualifying Ethereum-mainnet balance. The event FAQ also lists its Discord faucet for verified members. The challenge page links to official funding channels. No real-money purchase is part of this project.

Run `npm run simulate:aevum` to execute the constructor on the official RPC at its latest block and compare the returned runtime to the build. This read-only call requires no tokens and creates no contract address.

## Inspect the completed pilot

The repository includes the mined [Aevum pilot](../evidence/aevum-pilot.json). From a source checkout run `npm ci`, `npm run verify:source` and `npm run audit -- evidence/aevum-pilot.json`. All three chain checks (funding, payment and refund) are read-only. The source check compiles the published Solidity standard input and checks the original deployment calldata and the current runtime. [The Aevum explorer reports full verification.](https://explorer-test.qday.info/address/0x181BA084DCb2946EB65Cb020B85dA5e8ED44431e?tab=contract)

## Browser path

The deployment desk prefills the mined pilot contract address. Choose **Use existing contract** to check its runtime and open a new route there.

1. Open the release. Verify a settlement by hash without a wallet, or select **Open buyer workspace → Connect to Aevum** for a funded route. The wallet must select chain 44005.
2. Select **Use existing contract** to reuse the public deployment. The browser checks its bytecode and token. A separate deployment is optional.
3. Enter the carrier payout address, independent station address and agent address. Set budget, price per crate, per-ticket cap, temperature band and validity. Review all fields, then approve the exact allowance and the deposit. If funding is interrupted after approval, the funding review also allows clearing the allowance.
4. Select **Export route configuration**. Give this public JSON to the station and agent and set `ROUTE_CONFIG_FILE` to its path on each machine. Provide the private signing material only in the appropriate local environment. The loader accepts the contract, route and role identifiers. The RPC and signing keys come from each operator’s environment. Conflicting settings cause an error.
5. The clerk opens **Receive a delivery and sign a ticket**, enters the route and actual observations, reviews them and signs with the registered station wallet. Transfer the downloaded JSON to the agent and run `npm run agent -- ticket.json`. Reuse the original lot reference on retries. A CLI-only station can use the commands below. Use **Sync recent blocks** to import the payment, or verify an older receipt by hash.
6. Reconnect and resume the same route after a browser restart. The assigned signers remain usable on their own machines. The buyer can close the route to refund its remaining balance. Older routes still require the originally assigned signers. Legacy in-tab keys that were lost cannot be recovered; the buyer can close that route.

## One-command public pilot

This can run from localhost. First check an Aevum address without exposing a signing key:

```sh
npm run mine -- check 0xYOUR_PUBLIC_ADDRESS
```

The official QDay challenge page links to its Discord. Verified members can use `/faucet` in `#faucet` with their **public testnet address**. Confirm the result using the check command. The browser wallet flow above works without an exported private key.

For the CLI pilot, use a dedicated test-only signer in the local `.env` file as BUYER_KEY. From the source directory:

```sh
npm ci
npm run mine -- send
```

This sends five Aevum transactions: deployment, exact approval, funding, payment, and closing. The route starts with 0.10 tUSD8. Six accepted crates pay 0.06 tUSD8. Closing returns 0.04 tUSD8. The CLI writes each signed transaction before sending it and recovers completed stages on rerun. If a stage is pending, rerun using the same directory and signer. Keep the `.dockcheck/` directory private because it holds disposable test signing material. The resulting `verified-pilot.json` contains only public receipt evidence.

```sh
npm run audit -- /path/to/verified-pilot.json
```

Open **Audit a route** in the app and enter the packet's funding, settlement, and refund hashes for an independent check. The verifier checks receipts and actual token transfers against one contract, route, carrier, and buyer. It rejects out-of-order, unrelated, and incomplete transactions.

## Separated actors and an unattended agent

Install dependencies with `npm ci`. Copy `.env.example` to `.env` locally. Use separate environment files on separate machines for a merchant deployment. Public identifiers can be shared. Scope each private key to the process in the table. The CLI loads a local .env file on startup. Never publish it. All CLI write commands target chain 44005.

| Variable | Used by | Meaning |
| --- | --- | --- |
| AEVUM_RPC_URL | All live commands | Optional HTTPS JSON-RPC override for the same chain |
| DOCK_ADDRESS | Commands after deployment | DockCheck release with an exact runtime match |
| ROUTE_ID | Status, close, station, agent | 32-byte ID printed when the buyer opens the route |
| ROUTE_CONFIG_FILE | Station, agent, buyer | Optional exported JSON with the route ID, contract and public roles |
| ROUTE_POLICY_FILE | Buyer CLI open | Optional path to budget and price in tUSD8, cap, temperatures in °C and validity in hours. See examples/route-policy.json. Without this option, the CLI uses the historical 4.50 tUSD8 policy. |
| ROUTE_SALT | Open | Persistent random 32-byte value for idempotent route creation |
| CARRIER_ADDRESS | Open | Fixed freight recipient |
| STATION_ADDRESS / AGENT_ADDRESS | Open | Distinct signing addresses, both distinct from the carrier |
| BUYER_KEY | Deploy, open, close, clear-allowance | Test-only buyer signer |
| STATION_KEY | Ticket | Independent receiving-station signer |
| AGENT_KEY | Agent | Route-authorized release signer |
| RELAYER_KEY | Agent | Dedicated test gas payer. Run one worker per relayer account. |

1. Run `npm run route -- check`. Use `npm run route -- deploy` with the buyer's test key. Set DOCK_ADDRESS to the printed address.
2. Choose stable actor addresses. For a random ROUTE_SALT run `node -e "console.log('0x'+require('node:crypto').randomBytes(32).toString('hex'))"`. Persist the salt before opening. Set CARRIER_ADDRESS, STATION_ADDRESS and AGENT_ADDRESS. Run `npm run route -- open`. Set ROUTE_ID to its result. Reusing the salt recovers the same route. `npm run route -- status` reads actual balances and terms.
3. At receiving, create a 32-byte random lot ID **once for that physical lot**, then reuse it on retries. The example measurement uses a fixed fictional lot. Temperatures are integer tenths of a degree. Real integration supplies observedAt as Unix seconds taken at receiving. The example uses "now" for a fresh demo observation.
4. Run `npm run ticket -- examples/measurement.json ticket.json` with the station key. Move the resulting signed file to the agent. The station does not need to send a chain transaction.
5. Run `npm run agent -- ticket.json`. Or run `npm run agent -- --watch ./inbox` and have the station atomically rename completed JSON tickets into that directory. The worker constrains every input to its configured network, contract and route. It simulates the authorized call, signs and journals one relay transaction, then waits for its receipt.
6. The agent prints the path of its verified proof under `.dockcheck/`. Run `npm run proof -- path/to/proof.json`. The same command accepts a browser evidence export. To retrieve an older receipt or recover from a lost browser export, run `npm run proof -- --tx 0xTRANSACTION_HASH`. The command resolves the contract from the transaction. The web verifier accepts the same hash and offers a public proof link.
7. Run `npm run route -- close` to revoke and claim the remaining escrow. `npm run route -- clear-allowance` clears any residual approval after interrupted setup.

## Source verification and public evidence

Open the contract address on the Aevum explorer. If its verification UI is available, choose Solidity standard JSON input, select **0.8.28+commit.7893614a**, and upload **artifacts/standard-input.json**. Select `contracts/DockCheck.sol:DockCheck`. The single constructor argument is the official tUSD8 address encoded as one ABI address. Generate it with:

```sh
node --input-type=module -e "import {AbiCoder} from 'ethers'; console.log(AbiCoder.defaultAbiCoder().encode(['address'],['0x456569838f1d43009A91ebA4263147Afd7233483']).slice(2))"
```

The original DockCheck contract passed the explorer's standard JSON verification. Its published input reproduces both creation and deployed bytecode. DeliveryReserve has a separate compiler input and requires its own deployment.

Submission evidence to collect: deployment hash and address, opened route ID and funding hash, successful settlement hash, signed proof JSON, actual tUSD8 Transfer log, revocation/refund hash, and useful explorer links. Keep the local and public chain IDs visible in video footage.
