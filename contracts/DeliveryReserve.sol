// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice One prepaid delivery, two signed decisions, one fixed carrier.
/// Bit zero represents crate 1 from the agreed manifest; each later bit represents the next crate.
contract DeliveryReserve is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Phase { Missing, Funded, Held, Closed, Expired }
    struct Terms {
        address carrier;
        address station;
        address reviewer;
        uint96 price;
        uint16 crates;
        uint64 receiptBy;
        uint64 reviewBy;
    }
    struct Delivery {
        Terms terms;
        address buyer;
        Phase phase;
        uint256 accepted;
        uint256 released;
        bytes32 holdReason;
        bytes32 decisionReason;
    }
    mapping(bytes32 => Delivery) private records;
    IERC20 public immutable token;
    bytes32 private constant INTAKE = keccak256("Intake(bytes32 delivery,uint256 accepted,bytes32 reason)");
    bytes32 private constant REVIEW = keccak256("Review(bytes32 delivery,uint256 initialAccepted,uint256 release,bytes32 reason)");
    event Funded(bytes32 indexed delivery, address indexed buyer, uint256 amount);
    event Received(bytes32 indexed delivery, uint256 accepted, bytes32 reason, uint256 paid);
    event Finalized(bytes32 indexed delivery, uint256 released, bytes32 reason, uint256 paid, uint256 refunded, bool expired);

    constructor(address asset) EIP712("DockCheck Delivery Reserve","1") {
        require(block.chainid == 31337 || (block.chainid == 44005 && asset == 0x456569838f1d43009A91ebA4263147Afd7233483), "Unsupported network or asset");
        require(asset.code.length > 0, "Missing token");
        token = IERC20(asset);
    }
    function deliveryOf(bytes32 id) external view returns (Delivery memory) { return records[id]; }
    function fund(bytes32 manifest, Terms calldata t) external nonReentrant returns (bytes32 id) {
        require(manifest != 0 && t.price > 0 && t.crates > 0 && t.crates <= 256, "Invalid manifest");
        require(t.carrier != address(0) && t.station != address(0) && t.reviewer != address(0), "Missing role");
        require(t.carrier != t.station && t.carrier != t.reviewer && t.station != t.reviewer && t.carrier != address(this), "Conflicting roles");
        require(block.timestamp < t.receiptBy && t.receiptBy < t.reviewBy && t.reviewBy <= block.timestamp + 30 days, "Invalid deadlines");
        id = keccak256(abi.encode(msg.sender,manifest));
        Delivery storage d = records[id];
        require(d.phase == Phase.Missing, "Already funded");
        d.terms = t;
        d.buyer = msg.sender;
        d.phase = Phase.Funded;
        uint256 amount = uint256(t.crates) * t.price;
        token.safeTransferFrom(msg.sender,address(this),amount);
        emit Funded(id,msg.sender,amount);
    }
    function mask(uint16 crates) private pure returns (uint256) {
        return crates == 256 ? type(uint256).max : (uint256(1) << crates) - 1;
    }
    function count(uint256 bits) private pure returns (uint256 n) {
        while (bits != 0) { bits &= bits - 1; ++n; }
    }
    function receiveCrates(bytes32 id,uint256 accepted,bytes32 reason,bytes calldata signature) external nonReentrant {
        Delivery storage d = records[id];
        require(d.phase == Phase.Funded && block.timestamp < d.terms.receiptBy, "Intake unavailable");
        uint256 all = mask(d.terms.crates);
        require((accepted & ~all) == 0 && (accepted == all || reason != 0), "Invalid intake");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(INTAKE,id,accepted,reason)));
        require(ECDSA.recover(digest,signature) == d.terms.station, "Wrong station");
        d.accepted = accepted;
        d.holdReason = reason;
        d.phase = accepted == all ? Phase.Closed : Phase.Held;
        uint256 paid = count(accepted) * d.terms.price;
        if (paid > 0) token.safeTransfer(d.terms.carrier,paid);
        emit Received(id,accepted,reason,paid);
    }
    function resolve(bytes32 id,uint256 release,bytes32 reason,bytes calldata signature) external nonReentrant {
        Delivery storage d = records[id];
        require(d.phase == Phase.Held && block.timestamp < d.terms.reviewBy, "Review unavailable");
        require(reason != 0 && (release & ~(mask(d.terms.crates) ^ d.accepted)) == 0, "Invalid release");
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(REVIEW,id,d.accepted,release,reason)));
        require(ECDSA.recover(digest,signature) == d.terms.reviewer, "Wrong reviewer");
        finish(id,d,release,reason,false);
    }
    function expire(bytes32 id) external nonReentrant {
        Delivery storage d = records[id];
        require((d.phase == Phase.Funded && block.timestamp >= d.terms.receiptBy) ||
            (d.phase == Phase.Held && block.timestamp >= d.terms.reviewBy), "Deadline pending");
        finish(id,d,0,0,true);
    }
    function finish(bytes32 id, Delivery storage d, uint256 release, bytes32 reason, bool expired) private {
        d.phase = expired ? Phase.Expired : Phase.Closed;
        d.released = release;
        d.decisionReason = reason;
        uint256 paid = count(release) * d.terms.price;
        uint256 refund = (d.terms.crates - count(d.accepted | release)) * d.terms.price;
        if (paid > 0) token.safeTransfer(d.terms.carrier,paid);
        if (refund > 0) token.safeTransfer(d.buyer,refund);
        emit Finalized(id,release,reason,paid,refund,expired);
    }
}
