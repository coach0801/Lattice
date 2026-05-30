// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title LTC — Lattice Token
/// @notice Fixed-supply ERC-20 governance and utility token for the Lattice Protocol.
///         1,000,000,000 LTC are minted to the deployer at construction; no further
///         minting is possible. Supports EIP-2612 gasless permit approvals.
/// @dev Inherits OpenZeppelin v5 ERC20, ERC20Permit, and Ownable.
contract LTC is ERC20, ERC20Permit, Ownable {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Total fixed supply: 1,000,000,000 LTC (18 decimals).
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 10 ** 18;

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Deploys the LTC token, minting the full supply to `initialOwner`.
    /// @param initialOwner Address that receives the full supply and contract ownership.
    constructor(address initialOwner)
        ERC20("Lattice Token", "LTC")
        ERC20Permit("Lattice Token")
        Ownable(initialOwner)
    {
        _mint(initialOwner, TOTAL_SUPPLY);
    }
}
