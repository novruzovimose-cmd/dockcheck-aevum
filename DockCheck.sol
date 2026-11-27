// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fund a carrier's route, then pay once per independently signed receiving ticket.
contract DockCheck is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public constant AEVUM_TOKEN = 0x456569838f1d43009A91ebA4263147Afd7233483;
    uint256 public constant MAX_LIFETIME = 30 days;
    uint256 public constant MAX_RECEIPT_AGE = 1 hours;
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant TICKET_TYPE = keccak256("Ticket(bytes32 route,bytes32 lot,uint32 crates,int16 low,int16 high,uint64 observedAt)");
    bytes32 private constant RELEASE_TYPE = keccak256("Release(bytes32 ticketHash)");
    IERC20 public token;
    struct Terms {
        address carrier;
        address station;
        address agent;
        uint96 unitPrice;
        uint96 budget;
        uint32 maxCrates;
        int16 floor;
        int16 ceiling;
        uint64 expiry;
    }
    struct Route {
        address owner;
        uint96 remaining;
        uint96 released;
        uint64 openedAt;
        bool closed;
        Terms terms;
    }
    struct Ticket {
        bytes32 route;
        bytes32 lot;
        uint32 crates;
        int16 low;
        int16 high;
        uint64 observedAt;
    }
    mapping(bytes32 => Route) private routes;
    mapping(bytes32 => mapping(bytes32 => bool)) public paid;
    error BadTerms();
    error BadNetwork();
    error AlreadyOpened();
    error RouteUnavailable();
    error NotOwner();
    error LotAlreadyPaid();
    error TemperatureOutsideBand();
    error InvalidQuantity();
    error StaleObservation();
    error InsufficientBudget();
    error StationSignature();
    error AgentSignature();
    event Opened(bytes32 indexed route, address indexed owner, address indexed carrier, uint96 budget);
    event Settled(bytes32 indexed route, bytes32 indexed lot, address indexed carrier, uint32 crates, uint96 amount, bytes32 ticketHash);
    event Closed(bytes32 indexed route, address indexed owner, uint96 returnedAmount);

    constructor(address tokenAddress) {
        if (block.chainid != 31337 && block.chainid != 44005) revert BadNetwork();
        if (block.chainid == 44005 && tokenAddress != AEVUM_TOKEN) revert BadTerms();
        if (tokenAddress.code.length == 0) revert BadTerms();
        token = IERC20(tokenAddress);
    }
    function routeOf(bytes32 id) external view returns (Route memory) { return routes[id]; }

    function open(bytes32 salt, Terms calldata t) external nonReentrant returns (bytes32 id) {
        id = keccak256(abi.encode(msg.sender, salt));
        if (routes[id].owner != address(0)) revert AlreadyOpened();
        if (t.carrier == address(0) || t.station == address(0) || t.agent == address(0) ||
            t.station == t.agent || t.carrier == t.station || t.carrier == t.agent ||
            t.carrier == address(this) || t.unitPrice == 0 || t.budget < t.unitPrice ||
            t.maxCrates == 0 || t.floor > t.ceiling || t.expiry <= block.timestamp ||
            t.expiry > block.timestamp + MAX_LIFETIME) revert BadTerms();
        routes[id] = Route(msg.sender, t.budget, 0, uint64(block.timestamp), false, t);
        token.safeTransferFrom(msg.sender, address(this), t.budget);
        emit Opened(id, msg.sender, t.carrier, t.budget);
    }
    function _typed(bytes32 structHash) private view returns (bytes32) {
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPE, keccak256("DockCheck"), keccak256("1"), block.chainid, address(this)));
        return keccak256(abi.encodePacked(hex"1901", domain, structHash));
    }
    function ticketHash(Ticket calldata t) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(TICKET_TYPE, t.route, t.lot, t.crates, t.low, t.high, t.observedAt)));
    }
    /// @notice Also used by the agent via eth_call to surface precise policy failures.
    function quote(Ticket calldata t) public view returns (uint96) {
        Route storage r = routes[t.route];
        if (r.owner == address(0) || r.closed || block.timestamp >= r.terms.expiry) revert RouteUnavailable();
        if (t.lot == bytes32(0) || paid[t.route][t.lot]) revert LotAlreadyPaid();
        if (t.crates == 0 || t.crates > r.terms.maxCrates) revert InvalidQuantity();
        if (t.low > t.high || t.low < r.terms.floor || t.high > r.terms.ceiling) revert TemperatureOutsideBand();
        if (t.observedAt < r.openedAt || t.observedAt > block.timestamp || block.timestamp - t.observedAt > MAX_RECEIPT_AGE) revert StaleObservation();
        uint256 amount = uint256(t.crates) * r.terms.unitPrice;
        if (amount > r.remaining) revert InsufficientBudget();
        return uint96(amount);
    }
    /// @notice Any relayer may pay gas. Both scoped signatures bind the exact same ticket.
    function settle(Ticket calldata t, bytes calldata stationSig, bytes calldata agentSig) external nonReentrant {
        uint96 amount = quote(t);
        Route storage r = routes[t.route];
        bytes32 digest = ticketHash(t);
        if (ECDSA.recover(digest, stationSig) != r.terms.station) revert StationSignature();
        if (ECDSA.recover(_typed(keccak256(abi.encode(RELEASE_TYPE, digest))), agentSig) != r.terms.agent) revert AgentSignature();
        paid[t.route][t.lot] = true;
        r.remaining -= amount;
        r.released += amount;
        token.safeTransfer(r.terms.carrier, amount);
        emit Settled(t.route, t.lot, r.terms.carrier, t.crates, amount, digest);
    }
    /// @notice Owner can revoke at any time, including after expiry, and reclaim the balance.
    function close(bytes32 id) external nonReentrant {
        Route storage r = routes[id];
        if (r.owner != msg.sender) revert NotOwner();
        if (r.closed) revert RouteUnavailable();
        uint96 amount = r.remaining;
        r.closed = true;
        r.remaining = 0;
        if (amount != 0) token.safeTransfer(msg.sender, amount);
        emit Closed(id, msg.sender, amount);
    }
}
