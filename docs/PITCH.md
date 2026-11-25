# DockCheck presentation and submission

## First sentence

A carrier invoices for eight crates. The receiving dock signed for six. Which two were billed above the accepted count, and what has the carrier already been paid?

## Live presentation · 3 minutes 35 seconds

| Time | What to show | What to say |
| --- | --- | --- |
| 0:00–0:30 | View mined receipt | A buyer on Aevum escrowed 0.10 tUSD8. The station accepted six crates at 0.01 each. Point to the mined carrier transfer and buyer refund. |
| 0:30–1:10 | Check carrier invoice → Compare invoice | An example carrier bill says eight crates and 0.08. Show the two-crate discrepancy, the exact 0.02 difference, and the printable report with its transaction hash. Correct the bill to six and 0.06 to show a match. |
| 1:10–2:00 | Reopen the pilot receipt → Recheck on Aevum | Verify the three prefilled hashes on the public chain. Show the fixed carrier, deposit, payout and refund. The entrant can also reproduce the evidence from the CLI. |
| 2:00–3:05 | Try a partial delivery | Label this chain as local. Follow the signed receipt through settlement, a warm load, a repeated lot and revocation. Select Inspect signed exception. Show the two crates held for packaging damage. Download the verified entry for accounts payable. |
| 3:05–3:35 | Print the variance report | A distributor could pilot this with one receiving station and one carrier. Measure time spent resolving each disputed invoice line. No commercial trial or customer savings are claimed. |

The recorded public receipt is available offline in the desk. A fresh chain check requires an Internet connection. The bundled video demonstrates the separate local run.

## Project description to adapt for DoraHacks

**DockCheck** turns a receiving ticket into a capped freight payment. The buyer funds one route in tUSD8, fixes the carrier and price per crate, and sets a temperature band, per-ticket limit and expiry. A receiving station signs the lot measurement. An agent verifies the ticket, simulates settlement and co-signs the release. A relayer pays gas, and the contract transfers exactly the accepted amount to the carrier once. The buyer can revoke the route and recover available escrow. An independent verifier binds the token Transfer event, payment event and signed receipt to the canonical transaction.

The open-source package includes a receiving desk, Solidity escrow, separate buyer/station/agent commands, a persistent relayer journal, a proof verifier, test cases and a packaged offline demo. The reference route is fictional. Prospective users include produce distributors and refrigerated freight operators.

## What to supply before submitting

- Include the public GitHub repository in the submission. Include contracts, src, public, scripts, tests, docs, artifacts, the lockfile, MIT license, notices, and the CI workflow. The ZIP intentionally excludes .env, private keys, and private worker journals. The delivery image can be attached to a GitHub release.
- Use the Aevum runbook. The evidence table below contains the completed pilot. Include the packaged image or an independently hosted judge demo URL. Localhost is appropriate for screen-sharing; a judge can run the package on their own machine.
- For a public static demo, deploy the contents of dist/ to any HTTPS static host. The app uses relative paths, so a repository subpath is supported. To use GitHub Pages, publish the contents of dist/ at the root of a Pages branch and select that branch in Pages settings.
- Validate the public repo and demo from a signed-out browser. Capture the brief Aevum demonstration with the badge and actual mined receipt visible. Add it to the repository or release. Review the event’s eligibility requirements in your own registration.
- The organizer lists submission close as 11 December 2026 at 08:00 UTC, **12:00 noon in Tbilisi**. Finalist Demo Day begins 15 December at 06:00 UTC, **10:00 in Tbilisi**. Check the event page before submission.

| Submission item | State in this archive |
| --- | --- |
| Public GitHub URL | https://github.com/novruzovimose-cmd/dockcheck-aevum |
| Judge-accessible live demo | Localhost via the packaged image in delivery/ |
| Aevum contract address and deployment hash | [contract](https://explorer-test.qday.info/address/0x181BA084DCb2946EB65Cb020B85dA5e8ED44431e) · [deployment](https://explorer-test.qday.info/tx/0xb1432ef83b86d979c1f687fd3a10967c85c51d65bffd10474043e7964781f1ea) |
| Funding, payment and refund transaction hashes | [funding](https://explorer-test.qday.info/tx/0xa9534597038e065c352d880b9b53c7d85879dbe177278ff1eceaca3179702099) · [settlement](https://explorer-test.qday.info/tx/0xb0dde94cdef82452a2113eae4a74871ef5e432ea528bccf8c684e7623c0030ad) · [refund](https://explorer-test.qday.info/tx/0x3f0a89e1bd8226661836f791923a0591cee3a5e9acb7f0f2ccb3a20c04822c0a) |
| Explorer source-verification status | Independent source/deployment match in evidence/aevum-source-match.json. Explorer badge unconfirmed. |
| Live Aevum token/network read | evidence/aevum-network.json |
| Local execution, test and demo artifacts | evidence/local-run.json, evidence/test-results.txt, delivery/DockCheck-demo.mp4 |
| Verified on-chain proof JSON | evidence/aevum-pilot.json |

DoraHacks: https://dorahacks.io/hackathon/qday/detail
Organizer rules: https://qday.io/builder-challenge
