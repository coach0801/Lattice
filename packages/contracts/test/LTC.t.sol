// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Test} from "forge-std/Test.sol";
import {LTC} from "../src/LTC.sol";

/// @title LTCTest
/// @notice Foundry tests for the LTC (Lattice Token) ERC-20 contract.
contract LTCTest is Test {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    LTC internal ltc;

    address internal deployer = makeAddr("deployer");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        vm.prank(deployer);
        ltc = new LTC(deployer);
    }

    // -------------------------------------------------------------------------
    // Metadata tests
    // -------------------------------------------------------------------------

    /// @notice Token name and symbol are set correctly.
    function testMetadata() public view {
        assertEq(ltc.name(),     "Lattice Token");
        assertEq(ltc.symbol(),   "LTC");
        assertEq(ltc.decimals(), 18);
    }

    // -------------------------------------------------------------------------
    // Supply tests
    // -------------------------------------------------------------------------

    /// @notice Total supply equals 1 billion LTC at 18 decimals.
    function testTotalSupply() public view {
        uint256 expected = 1_000_000_000 * 10 ** 18;
        assertEq(ltc.totalSupply(), expected);
    }

    /// @notice The full supply is minted to the deployer on construction.
    function testDeployerReceivesFullSupply() public view {
        assertEq(ltc.balanceOf(deployer), ltc.totalSupply());
    }

    // -------------------------------------------------------------------------
    // Transfer tests
    // -------------------------------------------------------------------------

    /// @notice Standard transfer moves tokens between accounts.
    function testTransfer() public {
        uint256 amount = 1_000 * 10 ** 18;

        vm.prank(deployer);
        ltc.transfer(alice, amount);

        assertEq(ltc.balanceOf(alice),    amount);
        assertEq(ltc.balanceOf(deployer), ltc.totalSupply() - amount);
    }

    /// @notice Transfer to the zero address reverts (OZ ERC-20 invariant).
    function testTransferToZeroAddressReverts() public {
        vm.prank(deployer);
        vm.expectRevert();
        ltc.transfer(address(0), 1);
    }

    /// @notice Transfer more than balance reverts.
    function testTransferInsufficientBalanceReverts() public {
        uint256 aliceBalance = ltc.balanceOf(alice);
        vm.prank(alice);
        vm.expectRevert();
        ltc.transfer(bob, aliceBalance + 1);
    }

    // -------------------------------------------------------------------------
    // Permit (EIP-2612) tests
    // -------------------------------------------------------------------------

    /// @notice A valid permit signature increases the spender's allowance without a tx from the owner.
    function testPermit() public {
        uint256 ownerPk  = 0xA11CE;
        address owner    = vm.addr(ownerPk);
        address spender  = alice;
        uint256 value    = 500 * 10 ** 18;
        uint256 deadline = block.timestamp + 1 hours;

        // Build the EIP-712 digest.
        bytes32 domainSeparator = ltc.DOMAIN_SEPARATOR();
        bytes32 permitTypehash  = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(permitTypehash, owner, spender, value, ltc.nonces(owner), deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);

        // Anyone can submit the permit.
        ltc.permit(owner, spender, value, deadline, v, r, s);

        assertEq(ltc.allowance(owner, spender), value);
        assertEq(ltc.nonces(owner), 1);
    }

    /// @notice An expired permit reverts.
    function testPermitExpiredReverts() public {
        uint256 ownerPk  = 0xB0B;
        address owner    = vm.addr(ownerPk);
        address spender  = alice;
        uint256 value    = 1;
        uint256 deadline = block.timestamp - 1; // already expired

        bytes32 domainSeparator = ltc.DOMAIN_SEPARATOR();
        bytes32 permitTypehash  = keccak256(
            "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(permitTypehash, owner, spender, value, ltc.nonces(owner), deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerPk, digest);

        vm.expectRevert();
        ltc.permit(owner, spender, value, deadline, v, r, s);
    }

    // -------------------------------------------------------------------------
    // Ownership tests
    // -------------------------------------------------------------------------

    /// @notice Deployer is the initial owner.
    function testDeployerIsOwner() public view {
        assertEq(ltc.owner(), deployer);
    }
}
