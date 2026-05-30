// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import {Script, console} from "forge-std/Script.sol";
import {LTC} from "../src/LTC.sol";
import {IntegrityAttester} from "../src/IntegrityAttester.sol";
import {IntegrityOracle} from "../src/IntegrityOracle.sol";
import {DisputeManager} from "../src/DisputeManager.sol";
import {Treasury} from "../src/Treasury.sol";

/// @title DeployScript
/// @notice Foundry broadcast script that deploys the full Lattice Protocol
///         contract suite to OP Sepolia (or any configured RPC endpoint).
///
/// Required environment variables:
///   - PRIVATE_KEY       — hex-encoded private key of the deployer EOA.
///   - ETHERSCAN_API_KEY — API key for contract verification on OP Etherscan.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url op_sepolia --broadcast --verify
contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        address deployer = vm.addr(pk);

        // 1. Deploy LTC — full supply minted to deployer.
        LTC ltc = new LTC(deployer);

        // 2. Deploy IntegrityAttester.
        IntegrityAttester attester = new IntegrityAttester();

        // 3. Deploy IntegrityOracle (read-only, references attester).
        IntegrityOracle oracle = new IntegrityOracle(address(attester));

        // 4. Deploy DisputeManager (references attester + LTC).
        DisputeManager disputes = new DisputeManager(address(attester), address(ltc));

        // 5. Deploy Treasury.
        Treasury treasury = new Treasury();

        // 6. Authorise the deployer as an attester for initial operation.
        attester.setAttester(deployer, true);

        vm.stopBroadcast();

        // Log deployed addresses for downstream scripts / CI.
        console.log("LTC:               ", address(ltc));
        console.log("IntegrityAttester: ", address(attester));
        console.log("IntegrityOracle:   ", address(oracle));
        console.log("DisputeManager:    ", address(disputes));
        console.log("Treasury:          ", address(treasury));
    }
}
