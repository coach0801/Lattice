# @lattice-protocol/sdk

Official TypeScript SDK for **Lattice Protocol** — anti-Sybil integrity attestations for DePIN networks.

## Installation

```bash
npm install @lattice-protocol/sdk
# or
yarn add @lattice-protocol/sdk
# or
pnpm add @lattice-protocol/sdk
```

## Quick Start

```ts
import { LatticeClient } from '@lattice-protocol/sdk'

const client = new LatticeClient({
  apiKey: 'lp_your_api_key_here',
})

// Get a node's current integrity score
const score = await client.getScore('hivemapper', 'node-abc123')
console.log(score.score)  // 0-100
console.log(score.band)   // 'clean' | 'watch' | 'suspicious' | 'sybil'

if (client.isSybil(score)) {
  console.warn('Node is a high-confidence Sybil — consider reward gating')
}
```

## Configuration

```ts
const client = new LatticeClient({
  apiKey: 'lp_your_api_key_here',    // Optional for public endpoints
  baseUrl: 'https://lattice-protocol.vercel.app', // Default
  chainId: 11155420,                  // OP Sepolia (default)
  rpcUrl: 'https://sepolia.optimism.io', // Optional, for on-chain reads
})
```

## API Reference

### Score Queries

#### `client.getScore(network, nodeId)`

Returns the current integrity score for a node.

```ts
const score: NodeScore = await client.getScore('weatherxm', 'wxm-station-7f2a')
// {
//   network: 'weatherxm',
//   nodeId: 'wxm-station-7f2a',
//   score: 82,
//   band: 'watch',
//   attestedAt: '2024-11-15T08:23:00Z',
//   attestationId: '0xabc123...',
//   subScores: {
//     gpsPlausibility: 91,
//     timingAnomaly: 78,
//     sensorReplay: 85,
//     geographicCluster: 72,
//     crossNetworkLinkage: 88,
//   }
// }
```

**Score bands:**
| Band | Score Range | Meaning |
|------|-------------|---------|
| `clean` | 85-100 | No significant anomalies |
| `watch` | 60-84 | Minor anomalies, monitoring recommended |
| `suspicious` | 30-59 | Multiple anomaly signals |
| `sybil` | 0-29 | High-confidence Sybil activity |

#### `client.getNode(network, nodeId)`

Returns full node detail including score history and active detection flags.

```ts
const detail: NodeDetail = await client.getNode('hivemapper', 'hm-cam-8b3c')
console.log(detail.scoreHistory)   // [{ ts: '...', score: 91 }, ...]
console.log(detail.activeFlags)    // DetectionFlag[]
console.log(detail.clusterMemberships) // [{ clusterId: '...', confidence: 0.87 }]
```

### Network Queries

#### `client.getNetworkHealth(network)`

Returns aggregate health metrics for one DePIN network.

```ts
const health: NetworkHealth = await client.getNetworkHealth('geodnet')
// {
//   network: 'geodnet',
//   totalNodes: 8240,
//   meanScore: 91.7,
//   flaggedPct: 1.1,
//   clusterCount: 4,
//   scoreDistribution: [
//     { band: 'clean', count: 7200 },
//     { band: 'watch', count: 800 },
//     ...
//   ]
// }
```

#### `client.listNetworks()`

Returns health summaries for all five supported networks.

```ts
const networks: NetworkHealth[] = await client.listNetworks()
```

**Supported networks:** `hivemapper`, `geodnet`, `weatherxm`, `dimo`, `nubila`

### Cluster Queries

#### `client.listClusters(opts?)`

List detected Sybil operator clusters.

```ts
const clusters: Cluster[] = await client.listClusters({ limit: 20, offset: 0 })
```

#### `client.getCluster(clusterId)`

Get full cluster details including member nodes.

```ts
const cluster: ClusterDetail = await client.getCluster('550e8400-e29b-41d4-a716-446655440000')
console.log(cluster.members)
// [{ network: 'hivemapper', nodeId: '...', ownerWallet: '0x...', confidence: 0.94 }]
```

### Webhook Management

#### `client.subscribeWebhook(subscription)`

Register a webhook to receive real-time Lattice events.

```ts
const { subscriptionId } = await client.subscribeWebhook({
  callbackUrl: 'https://your-app.com/webhooks/lattice',
  eventTypes: ['score.threshold_crossed', 'cluster.detected'],
  hmacSecret: 'your-secret-at-least-16-chars',
})
console.log('Subscription ID:', subscriptionId)
```

**Available event types:**
- `score.threshold_crossed` — A node's band changed
- `cluster.detected` — A new Sybil cluster was found
- `cluster.dissolved` — A cluster was dissolved
- `dispute.opened` — An on-chain dispute was opened
- `dispute.resolved` — A dispute was resolved
- `attestation.revoked` — An on-chain attestation was revoked

### Utility Methods

#### `client.isSybil(score)`

Quick check if a score is in the sybil band.

```ts
const score = await client.getScore('dimo', 'dimo-vehicle-z9x1')
if (client.isSybil(score)) {
  // gate reward payout
}
```

#### `client.getBand(score)`

Map a raw numeric score to a band string.

```ts
client.getBand(92) // 'clean'
client.getBand(71) // 'watch'
client.getBand(44) // 'suspicious'
client.getBand(18) // 'sybil'
```

## Webhook Integration

Verify incoming webhook payloads using `verifyWebhookSignature`:

```ts
import { verifyWebhookSignature } from '@lattice-protocol/sdk'
import type { Request, Response } from 'express'

export function latticeWebhookHandler(req: Request, res: Response) {
  const signature = req.headers['x-lattice-signature'] as string
  const rawBody = req.rawBody // ensure you capture the raw body string

  const isValid = verifyWebhookSignature(rawBody, signature, process.env.LATTICE_WEBHOOK_SECRET!)
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid webhook signature' })
  }

  const event = JSON.parse(rawBody)
  switch (event.type) {
    case 'score.threshold_crossed':
      console.log('Node band changed:', event.data)
      break
    case 'cluster.detected':
      console.log('New cluster:', event.data.clusterId)
      break
  }

  res.status(200).json({ received: true })
}
```

## On-Chain Reading

Compute a node's on-chain identifier using `hashNodeId`:

```ts
import { hashNodeId } from '@lattice-protocol/sdk'
import { createPublicClient, http } from 'viem'
import { optimismSepolia } from 'viem/chains'

const nodeHash = hashNodeId('hivemapper', 'hm-cam-8b3c')
// '0x3a7f2b...' — keccak256(abi.encodePacked(network, nodeId))

// Use with the LatticeAttestation contract
const publicClient = createPublicClient({
  chain: optimismSepolia,
  transport: http(),
})

const attestation = await publicClient.readContract({
  address: '0xYourLatticeContractAddress',
  abi: latticeAbi,
  functionName: 'getAttestation',
  args: [nodeHash],
})
```

## Error Handling

```ts
import {
  LatticeClient,
  LatticeApiError,
  LatticeNetworkError,
  LatticeValidationError,
} from '@lattice-protocol/sdk'

const client = new LatticeClient({ apiKey: 'lp_key' })

try {
  const score = await client.getScore('hivemapper', 'node-xyz')
} catch (err) {
  if (err instanceof LatticeApiError) {
    if (err.isNotFound) {
      console.log('Node not found')
    } else if (err.isRateLimited) {
      console.log('Rate limited — back off and retry')
    } else {
      console.error(`API error ${err.statusCode}: ${err.message}`)
    }
  } else if (err instanceof LatticeNetworkError) {
    console.error('Could not reach Lattice API:', err.message)
  } else if (err instanceof LatticeValidationError) {
    console.error(`Invalid input (${err.field}): ${err.message}`)
  }
}
```

## TypeScript

All types are exported from the package root:

```ts
import type {
  Network,
  ScoreBand,
  NodeScore,
  NodeDetail,
  DetectionFlag,
  Cluster,
  ClusterDetail,
  NetworkHealth,
  LatticeConfig,
  WebhookSubscription,
  WebhookEventType,
} from '@lattice-protocol/sdk'
```

## License

MIT
