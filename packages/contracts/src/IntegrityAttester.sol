// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title IntegrityAttester
/// @notice Stores integrity attestations for DePIN nodes. Authorised attesters
///         submit scores (0–100) with IPFS evidence bundles. After a 24-hour
///         challenge window with no dispute, an attestation may be finalised as
///         FINALIZED_VALID.
/// @dev Attestation IDs are derived as keccak256(networkId, nodeIdHash, attestedAt).
contract IntegrityAttester is Ownable {
    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Represents a single integrity attestation for a DePIN node.
    struct Attestation {
        /// @dev keccak256 of the network name string.
        bytes32 networkId;
        /// @dev keccak256 of the node identifier string.
        bytes32 nodeIdHash;
        /// @dev Integrity score in the range [0, 100].
        uint8 score;
        /// @dev IPFS CID pointing to the off-chain evidence bundle.
        string evidenceCid;
        /// @dev Unix timestamp (seconds) when the attestation was created.
        uint64 attestedAt;
        /// @dev Lifecycle status of this attestation.
        ///      0 = CREATED
        ///      1 = FINALIZED_VALID
        ///      2 = DISPUTED
        ///      3 = FINALIZED_UPHELD
        ///      4 = FINALIZED_OVERTURNED
        uint8 status;
    }

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Minimum seconds before a CREATED attestation can be finalised.
    uint256 public constant CHALLENGE_PERIOD = 24 hours;

    // Status codes — kept as public constants for external consumers.
    uint8 public constant STATUS_CREATED             = 0;
    uint8 public constant STATUS_FINALIZED_VALID     = 1;
    uint8 public constant STATUS_DISPUTED            = 2;
    uint8 public constant STATUS_FINALIZED_UPHELD    = 3;
    uint8 public constant STATUS_FINALIZED_OVERTURNED = 4;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Mapping from attestation ID to Attestation struct.
    mapping(bytes32 => Attestation) private _attestations;

    /// @notice Latest attestation ID per (networkId, nodeIdHash) pair.
    mapping(bytes32 => bytes32) private _latestAttestation;

    /// @notice Whether an address is an authorised attester.
    mapping(address => bool) public isAttester;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Caller is not an authorised attester.
    error NotAttester();
    /// @notice Score must be in the range [0, 100].
    error InvalidScore(uint8 score);
    /// @notice Attestation with this ID does not exist.
    error AttestationNotFound(bytes32 attestationId);
    /// @notice Attestation is not in CREATED status.
    error NotFinalizable(bytes32 attestationId, uint8 currentStatus);
    /// @notice 24-hour challenge period has not elapsed yet.
    error ChallengePeriodActive(bytes32 attestationId, uint64 availableAt);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when a new attestation is recorded.
    /// @param attestationId Unique identifier for the attestation.
    /// @param networkId     keccak256 of the network name.
    /// @param nodeIdHash    keccak256 of the node identifier.
    /// @param score         Integrity score assigned (0–100).
    event Attested(
        bytes32 indexed attestationId,
        bytes32 networkId,
        bytes32 nodeIdHash,
        uint8 score
    );

    /// @notice Emitted when an attestation transitions to FINALIZED_VALID.
    /// @param attestationId Attestation that was finalised.
    event AttestationFinalized(bytes32 indexed attestationId);

    /// @notice Emitted when an attester's authorisation changes.
    /// @param attester Address whose status changed.
    /// @param active   New authorisation status.
    event AttesterSet(address indexed attester, bool active);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // -------------------------------------------------------------------------
    // Attester management
    // -------------------------------------------------------------------------

    /// @notice Grant or revoke attester privileges for an address.
    /// @param attester Address to update.
    /// @param active   `true` to grant, `false` to revoke.
    function setAttester(address attester, bool active) external onlyOwner {
        isAttester[attester] = active;
        emit AttesterSet(attester, active);
    }

    // -------------------------------------------------------------------------
    // Core write functions
    // -------------------------------------------------------------------------

    /// @notice Submit a new integrity attestation for a DePIN node.
    /// @param networkId   keccak256 of the network name string.
    /// @param nodeIdHash  keccak256 of the node identifier string.
    /// @param score       Integrity score in the range [0, 100].
    /// @param evidenceCid IPFS CID of the off-chain evidence bundle.
    /// @return attestationId Unique identifier for the recorded attestation.
    function attest(
        bytes32 networkId,
        bytes32 nodeIdHash,
        uint8 score,
        string calldata evidenceCid
    ) external returns (bytes32 attestationId) {
        if (!isAttester[msg.sender]) revert NotAttester();
        if (score > 100) revert InvalidScore(score);

        uint64 ts = uint64(block.timestamp);
        attestationId = keccak256(abi.encodePacked(networkId, nodeIdHash, ts));

        _attestations[attestationId] = Attestation({
            networkId:   networkId,
            nodeIdHash:  nodeIdHash,
            score:       score,
            evidenceCid: evidenceCid,
            attestedAt:  ts,
            status:      STATUS_CREATED
        });

        // Track the latest attestation for this (network, node) pair.
        bytes32 nodeKey = keccak256(abi.encodePacked(networkId, nodeIdHash));
        _latestAttestation[nodeKey] = attestationId;

        emit Attested(attestationId, networkId, nodeIdHash, score);
    }

    /// @notice Finalise an attestation once the 24-hour challenge period has passed.
    /// @dev    Reverts if the attestation is not in CREATED status or if the
    ///         challenge period is still active.
    /// @param attestationId ID of the attestation to finalise.
    function finalizeAttestation(bytes32 attestationId) external {
        Attestation storage a = _attestations[attestationId];
        if (a.attestedAt == 0) revert AttestationNotFound(attestationId);
        if (a.status != STATUS_CREATED) revert NotFinalizable(attestationId, a.status);

        uint64 availableAt = a.attestedAt + uint64(CHALLENGE_PERIOD);
        if (uint64(block.timestamp) < availableAt) {
            revert ChallengePeriodActive(attestationId, availableAt);
        }

        a.status = STATUS_FINALIZED_VALID;
        emit AttestationFinalized(attestationId);
    }

    // -------------------------------------------------------------------------
    // DisputeManager interface (status updates)
    // -------------------------------------------------------------------------

    /// @notice Update the status of an attestation.
    /// @dev    Only callable by the owner (who should set this to the DisputeManager
    ///         address in production, or keep as deployer for v0).
    /// @param attestationId Attestation to update.
    /// @param newStatus     New status value.
    function setAttestationStatus(bytes32 attestationId, uint8 newStatus) external onlyOwner {
        Attestation storage a = _attestations[attestationId];
        if (a.attestedAt == 0) revert AttestationNotFound(attestationId);
        a.status = newStatus;
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Return the latest score for a DePIN node.
    /// @param networkId  keccak256 of the network name string.
    /// @param nodeIdHash keccak256 of the node identifier string.
    /// @return score         Latest integrity score (0–100). Returns 0 if no attestation exists.
    /// @return attestedAt    Timestamp of the latest attestation. Returns 0 if none.
    /// @return attestationId ID of the latest attestation. Returns bytes32(0) if none.
    function getScore(bytes32 networkId, bytes32 nodeIdHash)
        external
        view
        returns (uint8 score, uint64 attestedAt, bytes32 attestationId)
    {
        bytes32 nodeKey = keccak256(abi.encodePacked(networkId, nodeIdHash));
        attestationId = _latestAttestation[nodeKey];
        if (attestationId == bytes32(0)) {
            return (0, 0, bytes32(0));
        }
        Attestation storage a = _attestations[attestationId];
        score      = a.score;
        attestedAt = a.attestedAt;
    }

    /// @notice Return the full Attestation struct for a given ID.
    /// @param id Attestation identifier.
    /// @return Full Attestation struct (all fields).
    function getAttestation(bytes32 id) external view returns (Attestation memory) {
        if (_attestations[id].attestedAt == 0) revert AttestationNotFound(id);
        return _attestations[id];
    }
}
