# Running the public-testnet demo

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

The repository includes the mined [Aevum pilot](../evidence/aevum-pilot.json). From a source checkout run `npm ci`, `npm run verify:source` and `npm run audit -- evidence/aevum-pilot.json`. All three chain checks (funding, payment and refund) are read-only. The source check compiles the published Solidity standard input and checks the original deployment calldata and the current runtime. The explorer returned HTTP 403 from the release environment when checking its verification API. An explorer badge has not been confirmed.

## Browser path

The deployment desk prefills the mined pilot contract address. Choose **Use existing contract** to check its runtime and open a new route there.

1. Start the prebuilt desk. Open the **Local rehearsal** network menu. **Check live network** reads chain ID, token decimals, runtime hash and the latest block without connecting a wallet.
2. Choose **Connect to Aevum** and approve the wallet's network switch. Confirm chain 44005. **Deploy new contract** deploys DockCheck with the official token address. Keep the deployment hash from your wallet. Alternatively enter an existing address. The client requires a complete runtime-bytecode match and the official token.
3. Enter a test carrier address you control for the presentation. The browser generates distinct, temporary station and agent signing keys for this demo. Choose **Review route funding** and verify the payee, budget, expiry and spender. Choose the 0.10 tUSD8 pilot and approve the exact allowance and separate deposit. The full rehearsal terms are also available. Declining the deposit leaves the allowance available until used or cleared. The funding review provides a **Clear allowance** action.
4. Open **Route policy** and copy the route ID and contract. The valid receipt and rejection steps match the local walkthrough. The buyer wallet relays the settlement in this browser demonstration and pays test gas.
5. **Export evidence** after the first settlement. Open the linked explorer transaction and verify the tUSD8 Transfer recipient and amount. **Sync recent blocks** reconstructs externally submitted settlements for this route within the latest 1,000 blocks. For older transfers run the by-hash command below.
6. Revoke the route before the presentation ends and retain the refund hash. A reload discards the two temporary signing keys. The buyer can still use **Use existing** and **Resume existing route** to read balances and reclaim escrow. New settlements on that browser-demo route require its original signatures. Open a new route for a fresh rehearsal.

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

The organizer wiki describes a Blockscout verification flow. The starter app reports that explorer verification is currently unavailable and suggests linking the repository and deployment. Check the actual explorer at submission time. If unavailable, state that clearly and include the public source, compiler input, deployment transaction, constructor value and runtime comparison. The client compares the entire runtime with a clean compilation, including metadata, then reads token() on-chain. A runtime match is independent reproducibility evidence. Claim an explorer badge only if the explorer displays it.

Submission evidence to collect: deployment hash and address, opened route ID and funding hash, successful settlement hash, signed proof JSON, actual tUSD8 Transfer log, revocation/refund hash, and useful explorer links. Keep the local and public chain IDs visible in video footage.
