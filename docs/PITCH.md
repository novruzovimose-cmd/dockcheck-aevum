# DockCheck presentation and submission

## First sentence

A carrier delivers six accepted crates. How does the buyer pay exactly once, even if the receiving system retries the same message?

## Live presentation · 3 minutes 35 seconds

| Time | What to show | What to say |
| --- | --- | --- |
| 0:00–0:25 | Receiving desk, funded route, Aevum network badge | A produce buyer agrees to pay a refrigerated carrier per accepted crate. The dock decides what actually arrived. Manual reconciliation sits between those two events. |
| 0:25–0:55 | Route policy, fixed recipient, session expiry and caps | For the faucet-sized pilot, the buyer puts up 0.10 tUSD8. Each crate earns 0.01, the per-ticket cap is 10, and the allowed range is 2–8 °C. The agent cannot choose its own payee or change its rate. |
| 0:55–1:40 | In range → Review delivery → Confirm settlement | Six crates came in at 2.4–6.7 °C. The station signs those details. The agent verifies them and signs its release. Show the review screen and the buyer's relay confirmation, then the 0.06 tUSD8 payout and 0.04 available escrow. |
| 1:40–2:10 | Open the actual explorer receipt | Open Verify payment and paste the settlement hash. Open the explorer and point to the transfer of 60,000 base units to the carrier. The judge can independently reconstruct the same receipt. |
| 2:10–2:40 | Warm load, then Replay last | The warm load reaches 10.3 °C and is held. The second attempt at the first receipt is also held. The carrier still has exactly 0.06 tUSD8 from this route. Neither preflight produced a transaction hash. |
| 2:40–3:05 | Revoke and refund | The buyer closes the route and takes back the balance. Audit the three hashes to independently reconcile the deposit, carrier payment, and refund. |
| 3:05–3:35 | Evidence export and closing slide or dashboard | A pilot would start with one depot, one receiving system, and a small carrier group. Measure time to reconcile and the rate of manual exceptions. A depot could pay for integrations and reconciliation while the payment protocol stays open. |

Run the final presentation on Aevum after a real settlement is available. Keep a funded spare route ready before the call. The included short video is labeled local execution and works as a rehearsal or explanatory clip. The organizer says at least one team member must attend the finalist live presentation.

## Project description to adapt for DoraHacks

**DockCheck** turns a receiving ticket into a capped freight payment. The buyer funds one route in tUSD8, fixes the carrier and price per crate, and sets a temperature band, per-ticket limit and expiry. A receiving station signs the lot measurement. An agent verifies the ticket, simulates settlement and co-signs the release. A relayer pays gas, and the contract transfers exactly the accepted amount to the carrier once. The buyer can revoke the route and recover available escrow. An independent verifier binds the token Transfer event, payment event and signed receipt to the canonical transaction.

The open-source package includes a receiving desk, Solidity escrow, separate buyer/station/agent commands, a persistent relayer journal, a proof verifier, test cases and a packaged offline demo. The reference route is fictional. Prospective users include produce distributors and refrigerated freight operators.

## What to supply before submitting

- Include the public GitHub repository in the submission. Include contracts, src, public, scripts, tests, docs, artifacts, the lockfile, MIT license, notices, and the CI workflow. The ZIP intentionally excludes .env, private keys, and private worker journals. The delivery image can be attached to a GitHub release.
- Use the Aevum runbook. Fill in the evidence table below from your successful public run. Include the packaged image or an independently hosted judge demo URL. Localhost is appropriate for screen-sharing; a judge can run the package on their own machine.
- For a public static demo, deploy the contents of dist/ to any HTTPS static host. The app uses relative paths, so a repository subpath is supported. To use GitHub Pages, publish the contents of dist/ at the root of a Pages branch and select that branch in Pages settings.
- Validate the public repo and demo from a signed-out browser. Capture the brief Aevum demonstration with the badge and actual mined receipt visible. Add it to the repository or release. Review the event’s eligibility requirements in your own registration.
- The organizer lists submission close as 11 December 2026 at 08:00 UTC, **12:00 noon in Tbilisi**. Finalist Demo Day begins 15 December at 06:00 UTC, **10:00 in Tbilisi**. Check the event page before submission.

| Submission item | State in this archive |
| --- | --- |
| Public GitHub URL | https://github.com/novruzovimose-cmd/dockcheck-aevum |
| Judge-accessible live demo | Localhost via the packaged image in delivery/ |
| Aevum contract address and deployment hash | Pending funded testnet deployment |
| Funding, payment and refund transaction hashes | Pending Aevum run |
| Explorer source-verification status | Check availability after deployment; compiler input and runtime verifier are included |
| Live Aevum token/network read | evidence/aevum-network.json |
| Local execution, test and demo artifacts | evidence/local-run.json, evidence/test-results.txt, delivery/DockCheck-demo.mp4 |
| Verified on-chain proof JSON | Generate after the Aevum payment with npm run proof |

DoraHacks: https://dorahacks.io/hackathon/qday/detail
Organizer rules: https://qday.io/builder-challenge
