// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IntegrityAttester} from "./IntegrityAttester.sol";

/// @title DisputeManager
/// @notice Manages the dispute lifecycle for Lattice Protocol attestations.
///         Any party may open a dispute by posting an LTC bond (≥ 1 000 LTC).
///         After the 7-day resolution window, the contract owner resolves the
///         dispute and either upholds or overturns the underlying attestation.
/// @dev v0 resolution logic is owner-controlled. Bond handling is simplified:
///      the bond is held in this contract and returned or forfeited by the owner
///      during resolution.
contract DisputeManager is Ownable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Minimum LTC bond (1 000 LTC, 18 decimals) required to open a dispute.
    uint256 public constant MIN_BOND = 1_000 * 10 ** 18;

    /// @notice Seconds after opening before a dispute may be resolved.
    uint256 public constant RESOLUTION_PERIOD = 7 days;

    // Dispute outcome codes.
    uint8 public constant OUTCOME_NONE     = 0;
    uint8 public constant OUTCOME_UPHELD   = 1; // attestation stands → attester wins
    uint8 public constant OUTCOME_OVERTURNED = 2; // attestation overturned → disputer wins

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Represents a single dispute.
    struct Dispute {
        /// @dev The attestation being challenged.
        bytes32 attestationId;
        /// @dev Address that opened the dispute.
        address disputer;
        /// @dev LTC bond amount locked.
        uint256 bond;
        /// @dev IPFS CID of the disputer's counter-evidence bundle.
        string evidenceCid;
        /// @dev Unix timestamp when the dispute was opened.
        uint64 openedAt;
        /// @dev Whether this dispute has been resolved.
        bool resolved;
        /// @dev Resolution outcome (OUTCOME_UPHELD or OUTCOME_OVERTURNED).
        uint8 outcome;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice The LTC ERC-20 token used for bonds.
    IERC20 public immutable ltc;

    /// @notice The IntegrityAttester contract whose attestations may be disputed.
    IntegrityAttester public immutable attester;

    /// @notice Mapping from dispute ID to Dispute struct.
    mapping(bytes32 => Dispute) private _disputes;

    /// @notice Incrementing nonce used in dispute ID derivation to prevent collisions.
    uint256 private _nonce;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Bond amount is below the minimum required.
    error InsufficientBond(uint256 provided, uint256 required);
    /// @notice Attestation does not exist in the IntegrityAttester contract.
    error AttestationNotFound(bytes32 attestationId);
    /// @notice Dispute with this ID does not exist.
    error DisputeNotFound(bytes32 disputeId);
    /// @notice The dispute has already been resolved.
    error AlreadyResolved(bytes32 disputeId);
    /// @notice The 7-day resolution period has not elapsed.
    error ResolutionPeriodActive(bytes32 disputeId, uint64 resolvableAt);
    /// @notice Outcome value is not valid.
    error InvalidOutcome(uint8 outcome);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new dispute is opened.
    /// @param disputeId    Unique identifier for the dispute.
    /// @param attestationId Attestation being challenged.
    /// @param disputer     Address that opened the dispute.
    /// @param bond         LTC bond amount locked.
    event DisputeOpened(
        bytes32 indexed disputeId,
        bytes32 indexed attestationId,
        address indexed disputer,
        uint256 bond
    );

    /// @notice Emitted when a dispute is resolved.
    /// @param disputeId Dispute that was resolved.
    /// @param outcome   OUTCOME_UPHELD or OUTCOME_OVERTURNED.
    event DisputeResolved(
        bytes32 indexed disputeId,
        uint8 outcome
    );

    /// @notice Emitted when a bond is returned to a disputer.
    /// @param disputeId Dispute whose bond was returned.
    /// @param to        Recipient address.
    /// @param amount    LTC amount returned.
    event BondReturned(bytes32 indexed disputeId, address indexed to, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param attesterAddr  Address of the deployed IntegrityAttester contract.
    /// @param ltcAddr       Address of the deployed LTC ERC-20 contract.
    constructor(address attesterAddr, address ltcAddr) Ownable(msg.sender) {
        attester = IntegrityAttester(attesterAddr);
        ltc = IERC20(ltcAddr);
    }

    // -------------------------------------------------------------------------
    // Core write functions
    // -------------------------------------------------------------------------

    /// @notice Open a dispute against an existing attestation.
    /// @dev    Caller must have approved this contract to transfer at least `bond` LTC.
    ///         Bond must be ≥ MIN_BOND. Attestation must exist.
    /// @param attestationId  ID of the attestation to dispute.
    /// @param evidenceCid    IPFS CID of the disputer's counter-evidence bundle.
    /// @param bond           LTC amount to lock as a bond (must be ≥ MIN_BOND).
    /// @return disputeId     Unique identifier for the newly created dispute.
    function openDispute(
        bytes32 attestationId,
        string calldata evidenceCid,
        uint256 bond
    ) external returns (bytes32 disputeId) {
        if (bond < MIN_BOND) revert InsufficientBond(bond, MIN_BOND);

        // Verify the attestation exists by calling getAttestation (reverts if not found).
        attester.getAttestation(attestationId);

        // Derive a unique dispute ID.
        uint256 nonce = ++_nonce;
        disputeId = keccak256(abi.encodePacked(attestationId, msg.sender, block.timestamp, nonce));

        // Lock the bond.
        ltc.safeTransferFrom(msg.sender, address(this), bond);

        _disputes[disputeId] = Dispute({
            attestationId: attestationId,
            disputer:      msg.sender,
            bond:          bond,
            evidenceCid:   evidenceCid,
            openedAt:      uint64(block.timestamp),
            resolved:      false,
            outcome:       OUTCOME_NONE
        });

        // Mark the attestation as DISPUTED in the attester contract.
        attester.setAttestationStatus(attestationId, IntegrityAttester.STATUS_DISPUTED);

        emit DisputeOpened(disputeId, attestationId, msg.sender, bond);
    }

    /// @notice Resolve a dispute after the 7-day resolution period.
    /// @dev    Only callable by the owner (v0). Owner specifies the outcome:
    ///         OUTCOME_UPHELD (1) → attestation stands; OUTCOME_OVERTURNED (2) → overturned.
    ///         Bond is returned to the disputer if the dispute is upheld (disputer was right?
    ///         — design note: in v0 the owner simply decides; bond slashing logic is reserved
    ///         for v1). In v0 the bond is always returned to the disputer regardless of outcome
    ///         to keep the mechanism non-punitive during the testnet phase.
    /// @param disputeId Dispute to resolve.
    /// @param outcome   OUTCOME_UPHELD or OUTCOME_OVERTURNED.
    function resolveDispute(bytes32 disputeId, uint8 outcome) external onlyOwner {
        Dispute storage d = _disputes[disputeId];
        if (d.openedAt == 0) revert DisputeNotFound(disputeId);
        if (d.resolved) revert AlreadyResolved(disputeId);
        if (outcome != OUTCOME_UPHELD && outcome != OUTCOME_OVERTURNED) {
            revert InvalidOutcome(outcome);
        }

        uint64 resolvableAt = d.openedAt + uint64(RESOLUTION_PERIOD);
        if (uint64(block.timestamp) < resolvableAt) {
            revert ResolutionPeriodActive(disputeId, resolvableAt);
        }

        d.resolved = true;
        d.outcome  = outcome;

        // Update attestation status in IntegrityAttester.
        uint8 newStatus = (outcome == OUTCOME_UPHELD)
            ? IntegrityAttester.STATUS_FINALIZED_UPHELD
            : IntegrityAttester.STATUS_FINALIZED_OVERTURNED;
        attester.setAttestationStatus(d.attestationId, newStatus);

        emit DisputeResolved(disputeId, outcome);

        // Return bond to disputer (v0: non-punitive; slash logic deferred to v1).
        uint256 bondAmount = d.bond;
        d.bond = 0;
        ltc.safeTransfer(d.disputer, bondAmount);
        emit BondReturned(disputeId, d.disputer, bondAmount);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Return the full Dispute struct for a given ID.
    /// @param disputeId Dispute identifier.
    /// @return Full Dispute struct.
    function getDispute(bytes32 disputeId) external view returns (Dispute memory) {
        if (_disputes[disputeId].openedAt == 0) revert DisputeNotFound(disputeId);
        return _disputes[disputeId];
    }
}
