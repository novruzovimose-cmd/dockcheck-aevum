import pilot from "../evidence/aevum-pilot.json" with { type: "json" };
import { compareInvoice } from "./invoice.mjs";
import {
  BrowserProvider,
  JsonRpcProvider,
  Contract,
  Wallet,
  ZeroAddress,
  getAddress,
  formatEther,
  keccak256,
} from "ethers";
import {
  net,
  desk,
  tokenABI,
  assertDesk,
  deployDesk,
  localSession,
  head,
  demoTerms,
  pilotBudget,
  randomId,
  routeId,
  fixtureLot,
  stationTicket,
  releaseFor,
  settleSigned,
  parseEvent,
  asJSON,
  money,
  describeError,
} from "./protocol.mjs";

import { inspectSettlement, proofFromHash } from "./verify.mjs";
import { auditRoute, exactToken } from "./audit.mjs";
import { runRehearsal } from "./rehearsal.mjs";
const $ = (id) => document.getElementById(id),
  modal = $("modal");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const facts = (items) =>
  '<dl class="facts">' +
  items
    .map(
      ([k, v]) => "<div><dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd></div>",
    )
    .join("") +
  "</dl>";
const button = (id, label, style = "primary") =>
  '<button class="' + style + '" id="' + id + '">' + label + "</button>";
const unit = () => (session?.chainId === 44005 ? "tUSD8" : "LOCAL");
const short = (h) => (h ? h.slice(0, 9) + "…" + h.slice(-5) : "");
let session = null,
  state = null,
  history = [],
  pending = null,
  last = null,
  lotIndex = 1,
  preset = "normal",
  locked = false,
  connected = null;
const key = "dockcheck.live.v1";
function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}
function saveMeta(data) {
  try {
    localStorage.setItem(key, asJSON({ ...loadMeta(), ...data }));
  } catch {}
}
function openModal(kicker, title, body) {
  $("modal-kicker").textContent = kicker;
  $("modal-title").textContent = title;
  $("modal-body").innerHTML =
    body + '<p class="dialog-note" role="status" id="dialog-note"></p>';
  if (!modal.open) modal.showModal();
}
$("dismiss").onclick = () => modal.close();
function notice(message, kind = "") {
  const n = $("notice");
  n.textContent = message;
  n.className = "notice " + kind;
}
function uiLock(value) {
  locked = value;
  for (const id of [
    "review",
    "network",
    "policy",
    "normal",
    "warm",
    "repeat",
    "rehearse",
    "verify",
    "audit-route",
  ]) {
    $(id).disabled =
      value || (!session && id === "review") || (id === "repeat" && !last);
  }
  for (const b of modal.querySelectorAll("button:not(.close)"))
    b.disabled = value;
}
async function action(fn) {
  if (locked) return;
  uiLock(true);
  try {
    await fn();
  } catch (e) {
    const msg = describeError(e, session?.contract || connected?.contract);
    notice(msg, "bad");
    if (modal.open && $("dialog-note")) $("dialog-note").textContent = msg;
  } finally {
    uiLock(false);
  }
}
function bind(id, fn) {
  $(id).onclick = () => action(fn);
}
function setPreset(name) {
  preset = name;
  for (const id of ["normal", "warm", "repeat"]) {
    $(id).classList.toggle("selected", name === id);
    $(id).setAttribute("aria-pressed", String(name === id));
  }
  const val =
    name === "repeat" && last
      ? last.envelope.ticket
      : { crates: 6, low: 24, high: name === "warm" ? 103 : 67 };
  $("crates").value = val.crates;
  $("low").value = Number(val.low) / 10;
  $("high").value = Number(val.high) / 10;
  for (const id of ["crates", "low", "high"])
    $(id).readOnly = name === "repeat";
  quote();
}
for (const k of ["normal", "warm", "repeat"]) $(k).onclick = () => setPreset(k);
for (const k of ["crates", "low", "high"])
  $(k).oninput = () => {
    quote();
    if (preset !== "repeat")
      for (const n of ["normal", "warm"]) {
        $(n).classList.remove("selected");
        $(n).setAttribute("aria-pressed", "false");
      }
  };
function quote() {
  const n = Number($("crates").value);
  $("quote").textContent =
    state && Number.isInteger(n) && n > 0
      ? money(BigInt(n) * state.terms.unitPrice) + " " + unit()
      : "—";
}
function record(row) {
  history.unshift(row);
  if (session?.chainId === 44005) saveMeta({ history });
  drawHistory();
}
async function syncChain() {
  const top = await session.provider.getBlockNumber(),
    from = Math.max(0, top - 999);
  const records = await session.contract.queryFilter(
    session.contract.filters.Settled(session.route),
    from,
    top,
  );
  let imported = 0;
  for (const log of records) {
    if (
      history.some(
        (item) => item.proof?.transactionHash === log.transactionHash,
      )
    )
      continue;
    const proof = await proofFromHash(
      session.provider,
      session.contract,
      log.transactionHash,
    );
    record({
      kind: "settled",
      tag: "Settled",
      title: proof.crates + " crates accepted",
      detail: "Reconstructed from chain · Block " + proof.blockNumber,
      amount: money(proof.amountBaseUnits) + " " + unit(),
      proof,
    });
    imported++;
  }
  await refresh();
  notice(
    "Scanned blocks " +
      from +
      "–" +
      top +
      ". Imported " +
      imported +
      " settlement(s). Older receipts can be verified by transaction hash.",
    "good",
  );
}
bind("sync", syncChain);
function drawHistory() {
  $("history").innerHTML = history.length
    ? history
        .map((r) => {
          const hash = r.proof?.transactionHash || r.hash;
          const link =
            hash && session.chainId === 44005
              ? '<a href="' +
                net.explorer +
                "/tx/" +
                esc(hash) +
                '" target="_blank" rel="noreferrer">' +
                esc(short(hash)) +
                "</a>"
              : esc(short(hash));
          return (
            '<div class="event" role="listitem"><div><span class="tag ' +
            esc(r.kind) +
            '">' +
            esc(r.tag) +
            "</span> <b>" +
            esc(r.title) +
            "</b><small>" +
            esc(r.detail) +
            '</small></div><div class="event-side">' +
            esc(r.amount || "") +
            "<br>" +
            link +
            (r.proof
              ? '<br><button class="receipt-link" data-receipt="' +
                esc(hash) +
                '">Inspect receipt</button>'
              : "") +
            "</div></div>"
          );
        })
        .join("")
    : '<p class="empty">Confirmed payments and policy decisions appear here.</p>';
  $("export").disabled = !history.length;
  $("sync").hidden = session?.chainId !== 44005;
}
async function refresh() {
  state = await session.contract.routeOf(session.route);
  const t = state.terms;
  $("available").textContent = money(state.remaining);
  $("paid").textContent = money(state.released);
  $("rate").textContent = money(t.unitPrice);
  $("range").textContent = Number(t.floor) / 10 + "–" + Number(t.ceiling) / 10;
  $("route-status").textContent = state.closed
    ? "Route revoked"
    : Number(t.expiry) <= (await head(session.provider))
      ? "Route expired"
      : "Route funded";
  $("network-text").textContent =
    session.chainId === 44005 ? "Aevum testnet" : "Local rehearsal";
  for (const el of document.querySelectorAll(".currency,#esc-unit"))
    el.textContent = unit();
  $("limits").textContent =
    Number(t.floor) / 10 +
    "–" +
    Number(t.ceiling) / 10 +
    " °C · Up to " +
    t.maxCrates +
    " crates per receipt";
  quote();
  drawHistory();
}
async function loadLocalEngine() {
  if (!window.Ganache) {
    await new Promise((ok, bad) => {
      const script = document.createElement("script");
      script.src = "./local-evm.js";
      script.onload = ok;
      script.onerror = () =>
        bad(
          Error(
            "Local EVM could not load. Refresh the desk or open the prebuilt app with the included server.",
          ),
        );
      document.head.append(script);
    });
  }
  return window.Ganache;
}
async function bootLocal() {
  const engine = await loadLocalEngine();
  const previous = session;
  connected = null;
  session = await localSession(engine);
  if (previous?.raw) await previous.raw.disconnect();
  history = [];
  last = null;
  lotIndex = 1;
  pending = null;
  await refresh();
  setPreset("normal");
  record({
    kind: "",
    tag: "Funded",
    title: "Route opened",
    detail: "Rehearsal escrow funded on local chain 31337.",
    amount: "4.50 LOCAL",
    hash: session.openHash,
  });
  document.querySelector(".checks").classList.remove("pass");
  notice(
    "Ready for a signed receiving ticket. All rehearsal balances are local.",
  );
}
function policy() {
  if (!state) {
    notice("The desk is initializing.");
    return;
  }
  const t = state.terms;
  openModal(
    "Buyer controls",
    "Route policy",
    facts([
      ["Buyer", state.owner],
      ["Carrier · fixed payee", t.carrier],
      ["Receiving station", t.station],
      ["Scoped agent", t.agent],
      ["Budget", money(t.budget) + " " + unit()],
      ["Per-ticket limit", t.maxCrates + " crates"],
      [
        "Temperature band",
        Number(t.floor) / 10 + "–" + Number(t.ceiling) / 10 + " °C",
      ],
      ["Valid until", new Date(Number(t.expiry) * 1000).toISOString()],
      ["Route ID", session.route],
      ["Contract", session.contract.target],
    ]) +
      "<p>Revocation closes the route and returns available escrow to the buyer once confirmed.</p>" +
      (!state.closed
        ? '<div class="modal-actions">' +
          button("revoke", "Review revocation", "danger") +
          "</div>"
        : ""),
  );
  if ($("revoke"))
    $("revoke").onclick = () => {
      openModal(
        "Buyer controls",
        "Revoke this route?",
        facts([
          ["Refund to", state.owner],
          ["Available escrow", money(state.remaining) + " " + unit()],
        ]) +
          '<p>Once confirmed, all outstanding tickets on this route stop settling.</p><div class="modal-actions">' +
          button("revoke-yes", "Revoke and refund", "danger") +
          "</div>",
      );
      bind("revoke-yes", async () => {
        if (getAddress(await session.buyer.getAddress()) !== state.owner)
          throw Error("Switch to the buyer account to revoke this route.");
        const tx = await session.contract.close(session.route),
          rec = await tx.wait();
        const ev = parseEvent(rec, session.contract, "Closed");
        await refresh();
        record({
          kind: "",
          tag: "Revoked",
          title: "Unspent escrow returned",
          detail: "Buyer closed the route.",
          hash: rec.hash,
          amount: money(ev.returnedAmount) + " " + unit(),
        });
        modal.close();
        notice("Route revoked. The refund is confirmed.", "good");
        const payments = history.filter((row) => row.proof);
        const funding =
          history.find((row) => row.tag === "Funded")?.hash || session.openHash;
        if (funding && payments.length === 1) {
          const hashes = {
            funding,
            settlement: payments[0].proof.transactionHash,
            refund: rec.hash,
          };
          openAudit(hashes, true);
        }
      });
    };
}
$("policy").onclick = policy;
function held(e, ticket) {
  const message = describeError(e, session.contract);
  document.querySelector(".checks").classList.remove("pass");
  record({
    kind: "held",
    tag: "Held · preflight",
    title: "Delivery held",
    detail: message,
    lot: ticket?.lot,
    amount: "0.00 " + unit(),
  });
  notice(message + " No transfer broadcast.", "bad");
}
$("ticket-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    if (!session.station || !session.agent)
      throw Error(
        "This route uses external signers. Submit the signed ticket with the CLI agent, or open a new demo route from Network.",
      );
    const t = {
      lot: fixtureLot(session.route, lotIndex),
      crates: Number($("crates").value),
      low: Math.round(Number($("low").value) * 10),
      high: Math.round(Number($("high").value) * 10),
    };
    const env =
      preset === "repeat" && last
        ? last.envelope
        : await stationTicket(session, t);
    let release;
    try {
      release = await releaseFor(
        session.contract,
        session.chainId,
        env,
        session.agent,
      );
    } catch (e) {
      held(e, env.ticket);
      return;
    }
    document.querySelector(".checks").classList.add("pass");
    pending = { env, release };
    openModal(
      "Transfer review",
      "Release freight payment",
      facts([
        [
          "Network",
          session.chainId === 44005
            ? "QDay Aevum · 44005"
            : "Local EVM · 31337",
        ],
        ["Recipient", state.terms.carrier],
        ["Accepted crates", env.ticket.crates],
        [
          "Recorded range",
          Number(env.ticket.low) / 10 +
            "–" +
            Number(env.ticket.high) / 10 +
            " °C",
        ],
        ["Release amount", money(release.amount) + " " + unit()],
        ["Lot commitment", env.ticket.lot],
      ]) +
        '<p>Station and agent signatures passed contract simulation. Confirm to relay the signed ticket.</p><div class="modal-actions">' +
        button("confirm", "Confirm settlement") +
        "</div>",
    );
    bind("confirm", async () => {
      const { env, release } = pending;
      try {
        const proof = await settleSigned(
          session.contract,
          env,
          release,
          (hash) => {
            notice("Broadcast " + short(hash) + ". Waiting for confirmation…");
            if (session.chainId === 44005) saveMeta({ pendingHash: hash });
          },
        );
        last = proof;
        lotIndex++;
        await refresh();
        record({
          kind: "settled",
          tag: "Settled",
          title: proof.crates + " crates accepted",
          detail: "Two signatures verified · Block " + proof.blockNumber,
          amount: money(proof.amountBaseUnits) + " " + unit(),
          proof,
        });
        if (session.chainId === 44005) saveMeta({ pendingHash: null });
        pending = null;
        modal.close();
        setPreset("normal");
        notice(
          "Carrier paid " +
            money(proof.amountBaseUnits) +
            " " +
            unit() +
            ". Receipt recorded.",
          "good",
        );
      } catch (e) {
        if (await session.contract.paid(env.ticket.route, env.ticket.lot)) {
          await refresh();
          modal.close();
          notice(
            "This lot is already settled. Check the audit log or explorer before retrying.",
          );
        } else throw e;
      }
    });
  });
};
$("export").onclick = () => {
  const blob = new Blob(
    [
      asJSON({
        product: "DockCheck",
        chainId: session.chainId,
        environment:
          session.chainId === 44005
            ? "Aevum testnet"
            : "Ephemeral local rehearsal",
        contract: session.contract.target,
        route: session.route,
        events: history,
      }),
    ],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dockcheck-" + session.chainId + "-evidence.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("guide").onclick = () =>
  openModal(
    "Operator handbook",
    "Field guide",
    '<ol class="guide-list"><li><b>Receive a delivery.</b> Choose In range. Review the signed crate count, temperature and fixed payee. Confirm the transfer.</li><li><b>Check a warm load.</b> A high reading of 10.3 °C exceeds the 8 °C ceiling. The agent holds the ticket before broadcasting.</li><li><b>Replay last.</b> Reuse the exact paid receipt. The contract rejects a second payment for that lot.</li><li><b>Revoke.</b> Open Route policy to close the budget and return unspent funds.</li></ol><p>The initial desk runs Solidity on a fresh, in-browser EVM. Reloading clears local activity. Use the network menu for the official testnet.</p>',
  );
$("source").onclick = () =>
  openModal(
    "Reproducible build",
    "Contract source",
    '<p>Solidity 0.8.28, optimizer 200 runs, Shanghai. The client checks the complete deployed runtime bytecode and pinned testnet token.</p><p><a href="./DockCheck.sol" target="_blank">Open DockCheck.sol</a></p><p><a href="./standard-input.json" download>Download compiler input with dependencies</a></p>',
  );
async function checkNetwork() {
  const provider = new JsonRpcProvider(net.rpc, undefined, {
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  try {
    const n = await provider.getNetwork(),
      t = new Contract(net.token, tokenABI, provider);
    const [b, decimals, code] = await Promise.all([
      provider.getBlock("latest"),
      t.decimals(),
      provider.getCode(net.token),
    ]);
    if (n.chainId !== 44005n || decimals !== 6n || code === "0x")
      throw Error("Aevum identity check failed.");
    openModal(
      "Live network read",
      "Aevum connection",
      facts([
        ["Chain ID", n.chainId],
        ["Latest block", b.number],
        ["Block time", new Date(b.timestamp * 1000).toISOString()],
        ["Official token", net.token],
        ["Decimals", decimals],
        ["Token runtime hash", keccak256(code)],
      ]) +
        '<p>This checks the official network and token. A DockCheck settlement has its own receipt.</p><a target="_blank" rel="noreferrer" href="' +
        net.explorer +
        "/block/" +
        b.number +
        '">View block on Aevum</a>',
    );
  } finally {
    provider.destroy();
  }
}
function networkMenu() {
  openModal(
    "Network",
    "Choose a workspace",
    "<p><b>Local rehearsal</b><br>Runs the compiled contracts in this browser with temporary test balances. A new rehearsal clears its history.</p>" +
      button("local", "Start fresh rehearsal", "secondary") +
      "<hr><p><b>QDay Aevum testnet</b><br>Chain 44005 · tUSD8 (6 decimals). Use an EVM wallet with test gas. The buyer reviews every wallet transaction.</p>" +
      button("connect", "Connect to Aevum") +
      " " +
      button("network-read", "Check live network", "secondary") +
      ' <a href="https://faucet.qday.info/" target="_blank" rel="noreferrer">Testnet faucet</a>',
  );
  bind("local", async () => {
    await bootLocal();
    modal.close();
  });
  bind("connect", connectLive);
  bind("network-read", checkNetwork);
}
$("network").onclick = networkMenu;
async function connectLive() {
  if (!window.ethereum)
    throw Error(
      "Open DockCheck in a browser with an EVM wallet, or use the CLI from the downloadable project.",
    );
  const w = window.ethereum;
  await w.request({ method: "eth_requestAccounts" });
  try {
    await w.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: net.hex }],
    });
  } catch (e) {
    if (e.code !== 4902) throw e;
    await w.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: net.hex,
          chainName: "QDay Aevum Testnet",
          nativeCurrency: { name: "Test QDAY", symbol: "tQDAY", decimals: 18 },
          rpcUrls: [net.rpc],
          blockExplorerUrls: [net.explorer],
        },
      ],
    });
  }
  const provider = new BrowserProvider(w, undefined, { cacheTimeout: -1 }),
    buyer = await provider.getSigner();
  if ((await provider.getNetwork()).chainId !== 44005n)
    throw Error("Select QDay Aevum in your wallet.");
  const token = new Contract(net.token, tokenABI, buyer);
  if ((await token.decimals()) !== 6n)
    throw Error("Unexpected decimals at the official token address.");
  connected = {
    provider,
    buyer,
    token,
    chainId: 44005,
    account: await buyer.getAddress(),
  };
  const [gas, budget] = await Promise.all([
    provider.getBalance(connected.account),
    token.balanceOf(connected.account),
  ]);
  connected.balances = { gas, budget };
  liveSetup();
}
function liveSetup() {
  const m = loadMeta(),
    c = connected;
  openModal(
    "QDay Aevum",
    "Deployment desk",
    facts([
      ["Connected buyer", c.account],
      ["Network", "44005 · tQDAY gas"],
      ["Test gas", formatEther(c.balances.gas) + " tQDAY"],
      ["Test balance", exactToken(c.balances.budget) + " tUSD8"],
      ["Pilot deposit", exactToken(pilotBudget) + " tUSD8"],
      ["Token", net.token],
    ]) +
      '<label>Existing DockCheck address<input id="desk-address" placeholder="0x…" value="' +
      esc(c.contract?.target || m.contract || pilot.contract) +
      '"></label><div class="modal-actions">' +
      button("attach", "Use existing contract") +
      button("deploy", "Deploy new contract", "secondary") +
      "</div>",
  );
  bind("attach", async () => {
    c.contract = (
      await assertDesk(c.provider, getAddress($("desk-address").value.trim()))
    ).connect(c.buyer);
    routeSetup();
  });
  bind("deploy", async () => {
    if ((await c.provider.getBalance(c.account)) === 0n)
      throw Error("This wallet needs testnet tQDAY for deployment gas.");
    c.contract = await deployDesk(c.buyer, net.token);
    saveMeta({
      contract: c.contract.target,
      route: null,
      history: [],
      deploymentHash: c.contract.deploymentTransaction().hash,
    });
    routeSetup();
  });
}
function routeSetup() {
  const c = connected,
    m = loadMeta(),
    same = m.contract === c.contract.target;
  openModal(
    "QDay Aevum",
    "Fund or resume a route",
    '<p class="address">Contract ' +
      esc(c.contract.target) +
      '</p><label>Carrier payout address<input id="carrier" placeholder="0x…"></label><p>The demo uses two temporary in-tab signers for the station and agent. They expire on reload. The buyer can still resume and refund. For independent operators, use the CLI with separate keys.</p>' +
      '<label>Route size<select id="route-size"><option value="pilot">Faucet-sized pilot · 0.10 tUSD8 · 0.01 per crate</option><option value="standard">Full rehearsal terms · 4.50 tUSD8 · 0.125 per crate</option></select></label><p>Both routes use a 2–8 °C receiving policy and expire in 24 hours.</p>' +
      button("fund", "Review route funding") +
      '<hr><label>Existing route ID<input id="resume-id" placeholder="0x… (32 bytes)" value="' +
      esc(same ? m.route || "" : "") +
      '"></label>' +
      button("resume", "Resume existing route", "secondary"),
  );
  bind("fund", async () => {
    const carrier = getAddress($("carrier").value.trim());
    if (carrier === ZeroAddress || carrier === c.contract.target)
      throw Error("Enter the carrier’s receiving address.");
    const station = Wallet.createRandom(),
      agent = Wallet.createRandom(),
      terms = demoTerms(
        carrier,
        station.address,
        agent.address,
        await head(c.provider),
        $("route-size").value === "pilot",
      );
    const budget = BigInt(terms.budget);
    if ((await c.token.balanceOf(c.account)) < budget)
      throw Error(
        "The buyer needs " + exactToken(budget) + " test tUSD8 for this route.",
      );
    openModal(
      "Wallet review",
      "Fund carrier escrow",
      facts([
        ["Buyer", c.account],
        ["Carrier", carrier],
        ["Spender contract", c.contract.target],
        ["Maximum transfer", exactToken(budget) + " tUSD8"],
        ["Expires", new Date(terms.expiry * 1000).toISOString()],
      ]) +
        '<p>Your wallet will request an exact token allowance if needed and then a separate escrow deposit. If you decline the deposit, you can clear the leftover allowance below.</p><div class="modal-actions">' +
        button("cancel-allow", "Clear allowance", "secondary") +
        button("open-route", "Approve and fund") +
        "</div>",
    );
    bind("cancel-allow", async () => {
      await (await c.token.approve(c.contract.target, 0)).wait();
      routeSetup();
    });
    bind("open-route", async () => {
      const allowance = await c.token.allowance(c.account, c.contract.target);
      if (allowance !== budget)
        await (await c.token.approve(c.contract.target, budget)).wait();
      const salt = randomId();
      const rid = routeId(c.account, salt);
      const tx = await c.contract.open(salt, terms);
      saveMeta({
        contract: c.contract.target,
        route: rid,
        openHash: tx.hash,
        history: [],
      });
      const rec = await tx.wait();
      const route = parseEvent(rec, c.contract, "Opened").route;
      await activate(
        {
          ...c,
          route,
          station,
          agent,
          carrier,
          openHash: tx.hash,
          openBlock: rec.blockNumber,
        },
        [],
      );
      record({
        kind: "",
        tag: "Funded",
        title: "Route opened on Aevum",
        detail: "Exact tUSD8 deposit confirmed.",
        hash: tx.hash,
        amount: exactToken(budget) + " tUSD8",
      });
      modal.close();
    });
  });
  bind("resume", async () => {
    const rid = $("resume-id").value.trim();
    if (!/^0x[\da-f]{64}$/i.test(rid)) throw Error("Enter a 32-byte route ID.");
    const r = await c.contract.routeOf(rid);
    if (r.owner === ZeroAddress)
      throw Error("Route does not exist on this contract.");
    const old =
      session?.chainId === 44005 &&
      session.contract.target === c.contract.target &&
      session.route === rid
        ? session
        : {};
    const sameRoute = same && m.route === rid;
    await activate(
      {
        ...c,
        station: old.station,
        agent: old.agent,
        route: rid,
        carrier: r.terms.carrier,
      },
      sameRoute ? m.history || [] : [],
    );
    modal.close();
    if (sameRoute && m.pendingHash) {
      notice(
        "Previous transaction " +
          m.pendingHash +
          " is recorded. Check its explorer receipt before retrying.",
      );
    }
  });
}
async function activate(s, rows) {
  session = s;
  history = rows;
  state = null;
  pending = null;
  last = rows.find((r) => r.proof)?.proof || null;
  lotIndex = rows.filter((r) => r.proof).length + 1;
  saveMeta({ contract: s.contract.target, route: s.route, history: rows });
  await refresh();
  setPreset("normal");
  notice(
    "Connected to QDay Aevum. Balances and policy are read from the contract.",
    "good",
  );
}
if (window.ethereum?.on) {
  for (const event of ["accountsChanged", "chainChanged"])
    window.ethereum.on(event, () => {
      if (connected || session?.chainId === 44005) location.reload();
    });
}
document.querySelectorAll("nav a").forEach(
  (link) =>
    (link.onclick = () => {
      document
        .querySelectorAll("nav a")
        .forEach((a) => a.classList.toggle("active", a === link));
    }),
);
$("history").onclick = (event) => {
  const hash = event.target.closest("[data-receipt]")?.dataset.receipt;
  if (!hash || locked) return;
  if (session.chainId === 44005) return openVerifier(hash);
  action(async () =>
    showVerified(await inspectSettlement(session.provider, hash), false),
  );
};

function showVerified({ proof, terms }, live) {
  const ticket = proof.envelope.ticket;
  const network = live
    ? "QDay Aevum testnet · 44005"
    : "Local Solidity rehearsal · 31337";
  const label = live ? "tUSD8" : "LOCAL";
  openModal(
    network,
    "Verified carrier payment",
    '<p class="verified-note">Transaction, two signatures and token transfer agree.</p>' +
      facts([
        ["Accepted crates", proof.crates],
        [
          "Freight calculation",
          proof.crates +
            " × " +
            money(terms.unitPrice) +
            " = " +
            money(proof.amountBaseUnits) +
            " " +
            label,
        ],
        [
          "Measured temperature",
          Number(ticket.low) / 10 + "–" + Number(ticket.high) / 10 + " °C",
        ],
        [
          "Permitted temperature",
          Number(terms.floor) / 10 + "–" + Number(terms.ceiling) / 10 + " °C",
        ],
        ["Fixed carrier", proof.carrier],
        ["Receiving station", terms.station],
        ["Authorized agent", terms.agent],
        ["Lot commitment", proof.lot],
        ["Transaction", proof.transactionHash],
        ["Block", proof.blockNumber],
      ]) +
      (live
        ? '<div class="modal-actions"><a target="_blank" rel="noreferrer" href="' +
          net.explorer +
          "/tx/" +
          esc(proof.transactionHash) +
          '">View on Aevum explorer</a>' +
          button("share-proof", "Copy verifier link", "secondary") +
          "</div>"
        : "<p>This receipt can be verified in the browser while its local chain is running.</p>"),
  );
  $("modal-body").insertAdjacentHTML(
    "beforeend",
    button("proof-invoice", "Check carrier invoice", "secondary"),
  );
  $("proof-invoice").onclick = () =>
    showInvoice(proof, live ? "Verified on Aevum" : "Verified on local chain");
  if (live)
    bind("share-proof", async () => {
      const url = new URL(location.pathname, location.origin);
      url.searchParams.set("tx", proof.transactionHash);
      await navigator.clipboard.writeText(url.href);
      $("dialog-note").textContent =
        "Verifier link copied. It opens wherever this same desk address is available.";
    });
}

async function verifyOnAevum(hash) {
  const provider = new JsonRpcProvider(net.rpc, undefined, {
    batchMaxCount: 1,
    cacheTimeout: -1,
  });
  try {
    if ((await provider.getNetwork()).chainId !== 44005n)
      throw Error("Aevum RPC returned an unexpected chain.");
    showVerified(await inspectSettlement(provider, hash), true);
  } finally {
    provider.destroy();
  }
}

function openVerifier(hash = "") {
  openModal(
    "QDay Aevum testnet · 44005",
    "Verify an Aevum payment",
    "<p>Paste a DockCheck settlement hash. The desk reconstructs the signed ticket from the transaction and checks it against the token transfer. No wallet is required.</p>" +
      '<form id="proof-form"><label>Settlement transaction hash<input id="proof-hash" required autocapitalize="none" spellcheck="false" pattern="0x[0-9A-Fa-f]{64}" value="' +
      esc(hash) +
      '" placeholder="0x…"></label><div class="modal-actions">' +
      button("proof-submit", "Verify from Aevum") +
      "</div></form>",
  );
  $("proof-form").onsubmit = (event) => {
    event.preventDefault();
    action(() => verifyOnAevum($("proof-hash").value.trim()));
  };
}

$("verify").onclick = () => openVerifier();

function showRouteAudit(packet, saved = false) {
  const live = packet.chainId === 44005;
  const token = live ? "tUSD8" : "LOCAL";
  const rows = [
    ["Escrow funded", packet.fundedBaseUnits, packet.funding],
    ["Carrier paid", packet.paidBaseUnits, packet.settlement],
    ["Buyer refunded", packet.refundedBaseUnits, packet.refund],
  ];
  const movements =
    '<ol class="audit-movements">' +
    rows
      .map(
        ([label, amount, receipt]) =>
          "<li><b>" +
          label +
          "</b><strong>" +
          esc(exactToken(amount)) +
          " " +
          token +
          "</strong><small>Block " +
          esc(receipt.block) +
          " · " +
          (live
            ? '<a target="_blank" rel="noreferrer" href="' +
              net.explorer +
              "/tx/" +
              esc(receipt.hash) +
              '">' +
              esc(short(receipt.hash)) +
              "</a>"
            : esc(short(receipt.hash))) +
          "</small></li>",
      )
      .join("") +
    "</ol>";
  openModal(
    live ? "QDay Aevum · 44005" : "Local Solidity rehearsal · 31337",
    saved ? "Recorded pilot receipt" : "Route reconciled",
    '<p class="verified-note">' +
      (saved
        ? "Saved from a completed Aevum run. Recheck these three transactions against the public chain at any time."
        : "Three transactions verified. Funded escrow equals the carrier payout plus the buyer refund.") +
      "</p>" +
      movements +
      facts([
        ["Escrow remaining", "0 " + token],
        ["Route", packet.route],
        ["Buyer", packet.buyer],
        ["Carrier", packet.carrier],
      ]) +
      '<div class="modal-actions">' +
      button("audit-invoice", "Check carrier invoice") +
      (saved ? button("audit-live", "Recheck on Aevum", "secondary") : "") +
      button("audit-download", "Export audit packet", "secondary") +
      "</div>",
  );
  $("audit-invoice").onclick = () =>
    showInvoice(
      packet.proof,
      saved ? recorded : live ? "Verified on Aevum" : "Verified on local chain",
      packet.settlement.hash === pilot.settlement.hash,
    );
  if (saved) $("audit-live").onclick = () => openAudit(pilotHashes);
  $("audit-download").onclick = () =>
    downloadJSON("dockcheck-route-" + packet.chainId + ".json", packet);
}

function openAudit(hashes = {}, useCurrentChain = false) {
  const input = (key, label) =>
    "<label>" +
    label +
    '<input name="' +
    key +
    '" required autocapitalize="none" spellcheck="false" pattern="0x[0-9a-fA-F]{64}" value="' +
    esc(hashes[key] || "") +
    '" placeholder="0x…"></label>';
  const local = useCurrentChain && session.chainId === 31337;
  openModal(
    local ? "Local Solidity rehearsal · 31337" : "QDay Aevum · 44005",
    "Audit a funded route",
    '<p>Check the escrow deposit, carrier payout and refund against their transaction receipts. This audit covers a route with one payment.</p><form id="audit-form">' +
      input("funding", "Funding transaction") +
      input("settlement", "Payment transaction") +
      input("refund", "Refund transaction") +
      '<div class="modal-actions">' +
      button("audit-submit", "Verify route audit") +
      "</div></form>",
  );
  $("audit-form").onsubmit = (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    action(async () => {
      const provider = local
        ? session.provider
        : new JsonRpcProvider(net.rpc, undefined, {
            batchMaxCount: 1,
            cacheTimeout: -1,
          });
      try {
        if (!local && (await provider.getNetwork()).chainId !== 44005n)
          throw Error("Aevum RPC returned an unexpected chain.");
        showRouteAudit(await auditRoute(provider, values));
      } finally {
        if (!local) provider.destroy();
      }
    });
  };
}
$("audit-route").onclick = () => openAudit();
bind("rehearse", async () => {
  openModal(
    "Local Solidity rehearsal · 31337",
    "Delivery walkthrough",
    "<p>Running the contracts on an isolated local chain. Your current route stays open in the desk.</p>" +
      '<ol class="walkthrough" id="walkthrough" aria-live="polite"></ol>' +
      '<p class="tiny" id="walk-summary">Starting the local chain…</p>',
  );
  const descriptions = {
    "Fund route": (s) => s.budget + " escrowed at " + s.rate + " per crate.",
    "Review signed receipt": (s) =>
      s.crates +
      " crates at " +
      s.lowC +
      "–" +
      s.highC +
      " °C. Two signatures authorize " +
      s.authorized +
      ".",
    "Confirm carrier payment": (s) =>
      "0.75 LOCAL paid. Reconstructed from transaction " +
      short(s.transactionHash) +
      ".",
    "Hold warm shipment": (s) =>
      "10.3 °C exceeds the 8 °C ceiling. Carrier balance stays at " +
      s.carrier +
      ".",
    "Hold duplicate receipt": (s) =>
      "The same lot cannot pay twice. Carrier balance stays at " +
      s.carrier +
      ".",
    "Revoke and refund": (s) =>
      s.refund +
      " returned to the buyer. The closed route blocks new payments.",
  };
  const result = await runRehearsal(await loadLocalEngine(), (step) => {
    const list = $("walkthrough");
    if (!list || !modal.open) return;
    list.insertAdjacentHTML(
      "beforeend",
      "<li><b>" +
        esc(step.step) +
        "</b><span>" +
        esc(descriptions[step.step](step)) +
        "</span></li>",
    );
    $("walk-summary").textContent =
      "Verified " + list.children.length + " of 6 steps";
  });
  if (!$("walk-summary") || !modal.open) return;
  $("walk-summary").textContent = "4.50 funded = 0.75 paid + 3.75 returned.";
  $("walk-summary").insertAdjacentHTML(
    "afterend",
    '<div class="modal-actions">' +
      button("walk-audit", "Inspect route audit") +
      button("walk-export", "Download run evidence", "secondary") +
      "</div>",
  );
  $("walk-audit").onclick = () => showRouteAudit(result.audit);
  $("walk-export").onclick = () =>
    downloadJSON("dockcheck-local-walkthrough.json", result);
});
function showInvoice(proof, evidence, example = false) {
  const currency = proof.chainId === 44005 ? "tUSD8" : "LOCAL";
  openModal(
    "Accounts payable · " + currency,
    "Check an invoice line",
    "<p>Compare the freight charge for this lot. Enter the line total before taxes and other fees.</p>" +
      facts([
        ["Receipt source", evidence],
        ["Carrier", proof.carrier],
        ["Lot", proof.lot],
        [
          "Accepted / paid",
          proof.crates +
            " crates · " +
            exactToken(proof.amountBaseUnits) +
            " " +
            currency,
        ],
      ]) +
      '<form id="invoice-form" class="invoice-form"><fieldset><legend>' +
      (example
        ? "Example carrier invoice · editable"
        : "Carrier invoice line") +
      '</legend><label>Invoice reference<input name="reference" maxlength="80" required></label><div class="pair">' +
      '<label>Billed crates<input name="quantity" type="number" min="1" max="999999999" step="1" required></label>' +
      "<label>Freight total (" +
      currency +
      ')<input name="total" inputmode="decimal" required></label></div>' +
      '</fieldset><button class="primary" type="submit">Compare invoice</button></form>' +
      '<div id="invoice-output" aria-live="polite"></div>',
  );
  const form = $("invoice-form"),
    result = $("invoice-output");
  if (example) {
    form.elements.reference.value = "GE-014 / sample";
    form.elements.quantity.value = "8";
    form.elements.total.value = "0.08";
  }
  form.oninput = () => {
    result.replaceChildren();
    $("dialog-note").textContent = "";
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    try {
      const report = compareInvoice(
        proof,
        Object.fromEntries(new FormData(form)),
      );
      const delta = BigInt(report.differenceBaseUnits),
        crates = report.cratesDifference;
      const quantityText =
        crates === 0
          ? "Billed and accepted quantities agree."
          : Math.abs(crates) +
            (Math.abs(crates) === 1 ? " crate" : " crates") +
            (crates > 0
              ? " billed above the accepted count."
              : " fewer billed than accepted.");
      const valueText =
        delta === 0n
          ? "The freight total matches the payment."
          : exactToken(delta < 0n ? -delta : delta) +
            " " +
            currency +
            (delta > 0n
              ? " billed above the payment."
              : " billed below the payment.");
      result.innerHTML =
        '<div class="invoice-result ' +
        (report.status === "Matched" ? "" : "review") +
        '"><h3>' +
        report.status +
        "</h3><p>" +
        esc(quantityText + " " + valueText) +
        "</p></div>" +
        facts([
          ["Invoice", report.reference],
          [
            "Billed",
            report.billedCrates +
              " crates · " +
              exactToken(report.billedBaseUnits) +
              " " +
              currency,
          ],
          [
            "Accepted and paid",
            report.acceptedCrates +
              " crates · " +
              exactToken(report.paidBaseUnits) +
              " " +
              currency,
          ],
          ["Settlement transaction", report.transaction],
        ]) +
        '<div class="modal-actions">' +
        button("invoice-print", "Print report") +
        button("invoice-export", "Export report JSON", "secondary") +
        "</div>";
      $("invoice-print").onclick = () => window.print();
      $("dialog-note").textContent = "";
      $("invoice-export").onclick = () =>
        downloadJSON("dockcheck-invoice-variance.json", {
          ...report,
          evidenceSource: evidence,
          invoiceInput: "Entered by the operator",
          measuredAgainst: "One settled lot",
        });
    } catch (error) {
      result.replaceChildren();
      $("dialog-note").textContent = error.message;
    }
  };
}

const pilotHashes = Object.fromEntries(
  ["funding", "settlement", "refund"].map((key) => [key, pilot[key].hash]),
);
const recorded =
  "Saved Aevum receipt · block " +
  pilot.settlement.block.toLocaleString("en-US");
$("pilot-summary").textContent =
  exactToken(pilot.paidBaseUnits) +
  " tUSD8 paid · " +
  exactToken(pilot.refundedBaseUnits) +
  " tUSD8 refunded · block " +
  pilot.settlement.block.toLocaleString("en-US");
$("pilot").onclick = () => showRouteAudit(pilot, true);
$("invoice-pilot").onclick = () => showInvoice(pilot.proof, recorded, true);

function downloadJSON(name, data) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([asJSON(data)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
drawHistory();
action(async () => {
  await bootLocal();
  const hash = new URLSearchParams(location.search).get("tx");
  if (hash && /^0x[0-9a-f]{64}$/i.test(hash)) {
    openVerifier(hash);
    await verifyOnAevum(hash);
  }
});
