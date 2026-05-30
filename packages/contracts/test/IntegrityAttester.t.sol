// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {IntegrityAttester} from "../src/IntegrityAttester.sol";

/// @title IntegrityAttesterTest
/// @notice Foundry tests for IntegrityAttester: attesting, access control,
///         score retrieval, and post-challenge-period finalisation.
contract IntegrityAttesterTest is Test {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    IntegrityAttester internal attesterContract;

    address internal owner       = makeAddr("owner");
    address internal attesterEOA = makeAddr("attester");
    address internal stranger    = makeAddr("stranger");

    bytes32 internal constant NETWORK_ID    = keccak256("helium");
    bytes32 internal constant NODE_ID_HASH  = keccak256("node-abc-123");
    uint8   internal constant SCORE         = 85;
    string  internal constant EVIDENCE_CID  = "bafybeigdyrztb3oeqfjcyg3e7ht4igpbqfwimr6m7ahcfgrqvw5lfqjnua";

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        vm.prank(owner);
        attesterContract = new IntegrityAttester();

        // Grant attester role.
        vm.prank(owner);
        attesterContract.setAttester(attesterEOA, true);
    }

    // -------------------------------------------------------------------------
    // testAttest
    // -------------------------------------------------------------------------

    /// @notice An authorised attester can submit an attestation; the Attested
    ///         event is emitted and the score is immediately readable.
    function testAttest() public {
        // checkTopic1=false because the attestation ID is not known ahead of time.
        // checkTopic2/3=false; checkData=false. We verify data fields via getAttestation below.
        vm.expectEmit(false, false, false, false, address(attesterContract));
        emit IntegrityAttester.Attested(bytes32(0), NETWORK_ID, NODE_ID_HASH, SCORE);

        vm.prank(attesterEOA);
        bytes32 id = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);

        assertTrue(id != bytes32(0), "attestation ID must be non-zero");

        // Verify stored data via getAttestation.
        IntegrityAttester.Attestation memory a = attesterContract.getAttestation(id);
        assertEq(a.networkId,   NETWORK_ID);
        assertEq(a.nodeIdHash,  NODE_ID_HASH);
        assertEq(a.score,       SCORE);
        assertEq(a.evidenceCid, EVIDENCE_CID);
        assertEq(a.status,      attesterContract.STATUS_CREATED());
    }

    // -------------------------------------------------------------------------
    // testOnlyAttesterCanAttest
    // -------------------------------------------------------------------------

    /// @notice A non-attester caller is rejected with NotAttester.
    function testOnlyAttesterCanAttest() public {
        vm.prank(stranger);
        vm.expectRevert(IntegrityAttester.NotAttester.selector);
        attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);
    }

    /// @notice Revoking attester rights prevents future attestations.
    function testRevokedAttesterCannotAttest() public {
        vm.prank(owner);
        attesterContract.setAttester(attesterEOA, false);

        vm.prank(attesterEOA);
        vm.expectRevert(IntegrityAttester.NotAttester.selector);
        attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);
    }

    /// @notice Score > 100 reverts with InvalidScore.
    function testInvalidScoreReverts() public {
        vm.prank(attesterEOA);
        vm.expectRevert(abi.encodeWithSelector(IntegrityAttester.InvalidScore.selector, 101));
        attesterContract.attest(NETWORK_ID, NODE_ID_HASH, 101, EVIDENCE_CID);
    }

    // -------------------------------------------------------------------------
    // testFinalizeAfter24h
    // -------------------------------------------------------------------------

    /// @notice Finalisation succeeds after the 24-hour challenge period.
    function testFinalizeAfter24h() public {
        vm.prank(attesterEOA);
        bytes32 id = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);

        // Warp exactly 24 hours + 1 second.
        vm.warp(block.timestamp + 24 hours + 1);

        vm.expectEmit(true, false, false, false, address(attesterContract));
        emit IntegrityAttester.AttestationFinalized(id);

        attesterContract.finalizeAttestation(id);

        IntegrityAttester.Attestation memory a = attesterContract.getAttestation(id);
        assertEq(a.status, attesterContract.STATUS_FINALIZED_VALID());
    }

    /// @notice Finalisation before 24 hours reverts with ChallengePeriodActive.
    function testFinalizeBeforeChallengePeriodReverts() public {
        vm.prank(attesterEOA);
        bytes32 id = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);

        // Warp only 12 hours — still inside challenge window.
        vm.warp(block.timestamp + 12 hours);

        vm.expectRevert(); // ChallengePeriodActive selector; sufficient to check revert
        attesterContract.finalizeAttestation(id);
    }

    /// @notice Double-finalisation reverts with NotFinalizable.
    function testDoubleFinalizeReverts() public {
        vm.prank(attesterEOA);
        bytes32 id = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);

        vm.warp(block.timestamp + 24 hours + 1);
        attesterContract.finalizeAttestation(id);

        vm.expectRevert();
        attesterContract.finalizeAttestation(id);
    }

    // -------------------------------------------------------------------------
    // testGetScore
    // -------------------------------------------------------------------------

    /// @notice getScore returns the latest score and timestamp for a node.
    function testGetScore() public {
        vm.prank(attesterEOA);
        bytes32 id = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, SCORE, EVIDENCE_CID);

        (uint8 score, uint64 attestedAt, bytes32 returnedId) =
            attesterContract.getScore(NETWORK_ID, NODE_ID_HASH);

        assertEq(score,      SCORE);
        assertTrue(attestedAt > 0, "attestedAt must be non-zero");
        assertEq(returnedId, id);
    }

    /// @notice getScore for an unknown node returns zeros.
    function testGetScoreUnknownNode() public view {
        (uint8 score, uint64 attestedAt, bytes32 id) =
            attesterContract.getScore(keccak256("unknown-net"), keccak256("unknown-node"));

        assertEq(score,      0);
        assertEq(attestedAt, 0);
        assertEq(id,         bytes32(0));
    }

    /// @notice Second attestation for the same node supersedes the first.
    function testGetScoreReturnsLatest() public {
        vm.prank(attesterEOA);
        attesterContract.attest(NETWORK_ID, NODE_ID_HASH, 50, EVIDENCE_CID);

        // Warp 1 second so timestamps differ.
        vm.warp(block.timestamp + 1);

        vm.prank(attesterEOA);
        bytes32 id2 = attesterContract.attest(NETWORK_ID, NODE_ID_HASH, 90, EVIDENCE_CID);

        (uint8 score,, bytes32 returnedId) = attesterContract.getScore(NETWORK_ID, NODE_ID_HASH);
        assertEq(score,      90);
        assertEq(returnedId, id2);
    }

    // -------------------------------------------------------------------------
    // testGetAttestation
    // -------------------------------------------------------------------------

    /// @notice getAttestation reverts for a non-existent ID.
    function testGetAttestationNotFoundReverts() public {
        vm.expectRevert();
        attesterContract.getAttestation(keccak256("does-not-exist"));
    }

    // -------------------------------------------------------------------------
    // Attester management tests
    // -------------------------------------------------------------------------

    /// @notice Only the owner can call setAttester.
    function testOnlyOwnerCanSetAttester() public {
        vm.prank(stranger);
        vm.expectRevert();
        attesterContract.setAttester(stranger, true);
    }
}
