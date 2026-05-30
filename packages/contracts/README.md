# Lattice Protocol — Smart Contracts

Solidity contracts for the Lattice Protocol DePIN anti-Sybil detection system.
Deployed on **OP Sepolia** (chain ID 11155420).

---

## Contract overview

| Contract | Description |
|---|---|
| `LTC` | ERC-20 governance/utility token (1 B fixed supply, EIP-2612 permit) |
| `IntegrityAttester` | Stores node integrity attestations with a 24-hour dispute window |
| `IntegrityOracle` | Read-only façade for partner DePINs (batch score queries, Sybil flag) |
| `DisputeManager` | Dispute lifecycle — bond in LTC, 7-day resolution window |
| `Treasury` | Holds protocol revenues; owner-controlled ETH + ERC-20 withdrawals |

---

## Prerequisites

### 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
```

Verify: `forge --version`

### 2. Install OpenZeppelin Contracts (v5)

```bash
forge install OpenZeppelin/openzeppelin-contracts
```

This populates `lib/openzeppelin-contracts/`. The `remappings.txt` file maps
`@openzeppelin/` to that path automatically.

---

## Build

```bash
forge build
```

---

## Test

```bash
forge test -vv
```

Run a single test file:

```bash
forge test --match-path test/LTC.t.sol -vv
```

Run with gas reports:

```bash
forge test --gas-report
```

---

## Deploy to OP Sepolia

### Set environment variables

```bash
export PRIVATE_KEY=<your-hex-private-key>
export ETHERSCAN_API_KEY=<your-op-etherscan-api-key>
```

Or place them in a `.env` file (never commit it):

```
PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=...
```

Then load with:

```bash
source .env
```

### Run the deployment script

```bash
forge script script/Deploy.s.sol \
  --rpc-url op_sepolia \
  --broadcast \
  --verify
```

The script logs all deployed addresses on completion.

---

## Directory structure

```
packages/contracts/
├── foundry.toml          # Foundry config (RPC endpoints, Etherscan)
├── remappings.txt        # @openzeppelin/ → lib/openzeppelin-contracts/
├── src/
│   ├── LTC.sol
│   ├── IntegrityAttester.sol
│   ├── IntegrityOracle.sol
│   ├── DisputeManager.sol
│   └── Treasury.sol
├── test/
│   ├── LTC.t.sol
│   └── IntegrityAttester.t.sol
└── script/
    └── Deploy.s.sol
```

---

## Security notes

- All contracts use custom `error` types (no `require` strings) for lower deployment gas.
- `SafeERC20` is used for all ERC-20 transfers in `DisputeManager` and `Treasury`.
- Bond slashing in `DisputeManager` is deferred to v1; bonds are returned to disputants in v0.
- `setAttestationStatus` on `IntegrityAttester` is owner-gated in v0. In production, transfer
  ownership to the `DisputeManager` so it is the only caller.
