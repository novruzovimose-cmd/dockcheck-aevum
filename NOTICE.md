# Third-party notices

DockCheck application code, the original route illustration, contract, CLI, and documentation use the MIT license in LICENSE. Dependencies retain their upstream licenses. The two fonts use the SIL Open Font License 1.1. The standalone HTTP binary includes Go’s BSD-licensed standard library.

| Component | Role | License / upstream |
| --- | --- | --- |
| OpenZeppelin Contracts 5.1.0 | ERC-20 interface, safe transfers, ECDSA recovery, reentrancy guard, local test token base | MIT · https://github.com/OpenZeppelin/openzeppelin-contracts |
| ethers 6.15.0 | Wallets, signatures, ABI, JSON-RPC | MIT · https://github.com/ethers-io/ethers.js |
| Ganache 7.9.2 | Isolated development EVM | MIT with bundled upstream notices · https://github.com/trufflesuite/ganache |
| solc-js 0.8.28 | Solidity compiler wrapper and pinned compiler input | MIT wrapper, Solidity compiler GPL-3.0 · https://github.com/ethereum/solc-js |
| esbuild 0.25.12 | Browser bundling | MIT · https://github.com/evanw/esbuild |
| Barlow and IBM Plex Mono | Locally served typefaces | SIL OFL 1.1 · https://fontsource.org |
| Go standard library | HTTP server inside the packaged image | BSD-3-Clause · https://go.dev |

Exact package versions are locked in package-lock.json. Upstream notices are in licenses/. The standard compiler input retains the source headers in the imported OpenZeppelin files. DockCheck uses its own receipt and agent implementation. No organizer starter contract is copied. QDay and Aevum are the network and event names.
