// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {IntegrityAttester} from "./IntegrityAttester.sol";

/// @title IntegrityOracle
/// @notice Read-only convenience contract for partner DePIN networks to query
///         node integrity scores from the Lattice Protocol.
/// @dev All functions are pure view wrappers over IntegrityAttester. No state
///      is stored here; the oracle is stateless beyond its reference to the
///      attester. A node is considered a Sybil candidate when its score < 30.
contract IntegrityOracle {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Score threshold below which a node is flagged as a potential Sybil.
    uint8 public constant SYBIL_THRESHOLD = 30;

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @notice Reference to the IntegrityAttester contract.
    IntegrityAttester public immutable attesterContract;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Provided attester address is the zero address.
    error ZeroAttesterAddress();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param attesterAddr Address of the deployed IntegrityAttester contract.
    constructor(address attesterAddr) {
        if (attesterAddr == address(0)) revert ZeroAttesterAddress();
        attesterContract = IntegrityAttester(attesterAddr);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Retrieve the latest integrity score for a single DePIN node.
    /// @param networkId  keccak256 of the network name string.
    /// @param nodeIdHash keccak256 of the node identifier string.
    /// @return score     Latest integrity score (0–100). Returns 0 if no attestation exists.
    /// @return updatedAt Unix timestamp of the latest attestation. Returns 0 if none.
    /// @return isSybil_  True if the score is below SYBIL_THRESHOLD (30).
    function getScore(bytes32 networkId, bytes32 nodeIdHash)
        external
        view
        returns (uint8 score, uint64 updatedAt, bool isSybil_)
    {
        (score, updatedAt, ) = attesterContract.getScore(networkId, nodeIdHash);
        isSybil_ = _isSybilScore(score, updatedAt);
    }

    /// @notice Batch-retrieve integrity scores for multiple nodes in a single call.
    /// @param networkId    keccak256 of the network name string.
    /// @param nodeIdHashes Array of keccak256 node identifier hashes.
    /// @return scores      Array of integrity scores, one per node.
    /// @return updatedAts  Array of last-updated timestamps, one per node.
    /// @return sybilFlags  Array of Sybil flags (true = potential Sybil), one per node.
    function getScores(bytes32 networkId, bytes32[] calldata nodeIdHashes)
        external
        view
        returns (
            uint8[]  memory scores,
            uint64[] memory updatedAts,
            bool[]   memory sybilFlags
        )
    {
        uint256 len = nodeIdHashes.length;
        scores     = new uint8[](len);
        updatedAts = new uint64[](len);
        sybilFlags = new bool[](len);

        for (uint256 i = 0; i < len; ++i) {
            (scores[i], updatedAts[i], ) =
                attesterContract.getScore(networkId, nodeIdHashes[i]);
            sybilFlags[i] = _isSybilScore(scores[i], updatedAts[i]);
        }
    }

    /// @notice Quick Sybil check for a single node.
    /// @param networkId  keccak256 of the network name string.
    /// @param nodeIdHash keccak256 of the node identifier string.
    /// @return True if the node's latest score is below SYBIL_THRESHOLD or if
    ///         no attestation exists (unattested nodes are treated as Sybil).
    function isSybil(bytes32 networkId, bytes32 nodeIdHash)
        external
        view
        returns (bool)
    {
        (uint8 score, uint64 updatedAt, ) =
            attesterContract.getScore(networkId, nodeIdHash);
        return _isSybilScore(score, updatedAt);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Returns true when a node should be treated as Sybil: either no
    ///      attestation exists (updatedAt == 0) or score < SYBIL_THRESHOLD.
    function _isSybilScore(uint8 score, uint64 updatedAt) internal pure returns (bool) {
        if (updatedAt == 0) return true;   // unattested → treat as Sybil
        return score < SYBIL_THRESHOLD;
    }
}
