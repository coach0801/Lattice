// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title Treasury
/// @notice Holds protocol ETH and ERC-20 revenues. Only the owner may withdraw
///         funds. Accepts arbitrary ERC-20 deposits (no whitelist) and direct
///         ETH transfers.
contract Treasury is Ownable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Recipient address is the zero address.
    error ZeroRecipient();
    /// @notice ETH transfer to recipient failed.
    error EthTransferFailed();
    /// @notice Requested amount is zero.
    error ZeroAmount();

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted on every withdrawal.
    /// @param token  Token address, or address(0) for ETH.
    /// @param amount Amount withdrawn (in token's native units, or wei for ETH).
    /// @param to     Recipient address.
    event Withdrawal(address indexed token, uint256 amount, address indexed to);

    /// @notice Emitted when ETH is received.
    /// @param from   Sender address.
    /// @param amount Wei amount received.
    event EthReceived(address indexed from, uint256 amount);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() Ownable(msg.sender) {}

    // -------------------------------------------------------------------------
    // Receive ETH
    // -------------------------------------------------------------------------

    /// @notice Accept plain ETH transfers.
    receive() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    /// @notice Accept ETH sent with data (fallback).
    fallback() external payable {
        emit EthReceived(msg.sender, msg.value);
    }

    // -------------------------------------------------------------------------
    // Withdraw
    // -------------------------------------------------------------------------

    /// @notice Withdraw tokens or ETH from the treasury.
    /// @dev    Pass `address(0)` as `token` to withdraw native ETH.
    /// @param token  ERC-20 token address to withdraw, or address(0) for ETH.
    /// @param amount Amount to withdraw (in token's native units, or wei for ETH).
    /// @param to     Recipient address.
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroRecipient();
        if (amount == 0) revert ZeroAmount();

        if (token == address(0)) {
            // Native ETH withdrawal.
            (bool success,) = to.call{value: amount}("");
            if (!success) revert EthTransferFailed();
        } else {
            // ERC-20 withdrawal.
            IERC20(token).safeTransfer(to, amount);
        }

        emit Withdrawal(token, amount, to);
    }
}
