# Lattice Protocol API Reference

Base URL: `https://lattice-protocol.vercel.app`

All endpoints return JSON. All timestamps are ISO 8601 UTC strings.

---

## Authentication

Include your API key in the request header:

```
X-API-Key: lp_your_api_key_here
```

Public endpoints (score lookups, network health) work without authentication but are subject to lower rate limits. Write endpoints and webhook management require a valid API key.

To obtain an API key, contact `api@lattice-protocol.xyz`.

---

## Rate Limiting

| Tier | Limit | Window |
|------|-------|--------|
| Unauthenticated | 20 req | per minute |
| Authenticated (default) | 100 req | per minute |
| Authenticated (partner) | Custom | per minute |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1731657600
```

When the limit is exceeded, the API returns `429 Too Many Requests`.

---

## Error Codes

All error responses share the shape:

```json
{
  "error": "Human-readable error message",
  "code": "MACHINE_READABLE_CODE"
}
```

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| `400` | `VALIDATION_ERROR` | Invalid request parameters |
| `401` | `UNAUTHORIZED` | Missing or invalid API key |
| `403` | `FORBIDDEN` | API key lacks permission for this operation |
| `404` | `NOT_FOUND` | Resource does not exist |
| `422` | `UNPROCESSABLE` | Request is valid but cannot be processed |
| `429` | `RATE_LIMITED` | Rate limit exceeded |
| `500` | `INTERNAL_ERROR` | Unexpected server error |
| `503` | `SERVICE_UNAVAILABLE` | Dependency (DB, chain) temporarily unavailable |

---

## Endpoints

### Score Queries

#### `GET /api/v1/score/:network/:nodeId`

Returns the current integrity score for a node.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `network` | `string` | One of: `hivemapper`, `geodnet`, `weatherxm`, `dimo`, `nubila` |
| `nodeId` | `string` | The node's unique identifier within the network |

**Response caching:** `Cache-Control: public, s-maxage=10, stale-while-revalidate=30`

**Response `200 OK`:**

```json
{
  "network": "hivemapper",
  "nodeId": "hm-cam-8b3c",
  "score": 82,
  "band": "watch",
  "attestedAt": "2024-11-15T08:23:00Z",
  "attestationId": "0xabc123def456...",
  "subScores": {
    "gpsPlausibility": 91,
    "timingAnomaly": 78,
    "sensorReplay": 85,
    "geographicCluster": 72,
    "crossNetworkLinkage": 88
  }
}
```

**Score bands:**

| Band | Score Range |
|------|-------------|
| `clean` | 85-100 |
| `watch` | 60-84 |
| `suspicious` | 30-59 |
| `sybil` | 0-29 |

**Error responses:**
- `404` if the node is not found in the Lattice database
- `400` if `network` is not a valid slug

---

#### `GET /api/v1/node/:network/:nodeId`

Returns full detail for a node, including score history and active detection flags.

**Path parameters:** Same as above.

**Response `200 OK`:**

```json
{
  "network": "weatherxm",
  "nodeId": "wxm-7f2a",
  "score": 67,
  "band": "watch",
  "attestedAt": "2024-11-14T12:00:00Z",
  "attestationId": null,
  "subScores": { "gpsPlausibility": 90, "sensorReplay": 60 },
  "ownerWallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "firstSeen": "2024-01-10T00:00:00Z",
  "lastSeen": "2024-11-15T08:20:00Z",
  "scoreHistory": [
    { "ts": "2024-11-14T12:00:00Z", "score": 67 },
    { "ts": "2024-10-30T12:00:00Z", "score": 74 },
    { "ts": "2024-10-15T12:00:00Z", "score": 81 }
  ],
  "activeFlags": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "detector": "sensor_replay",
      "severity": "medium",
      "confidence": 0.73,
      "detectedAt": "2024-11-01T06:00:00Z",
      "evidence": { "similarity_score": 0.93, "reference_nodeId": "wxm-5a1b" }
    }
  ],
  "clusterMemberships": [
    { "clusterId": "7c9e6679-7425-40de-944b-e07fc1f90ae7", "confidence": 0.81 }
  ]
}
```

---

### Network Queries

#### `GET /api/v1/networks`

Returns health summaries for all supported networks.

**Response `200 OK`:**

```json
[
  {
    "network": "hivemapper",
    "totalNodes": 142800,
    "meanScore": 81.2,
    "flaggedPct": 4.2,
    "clusterCount": 47,
    "scoreDistribution": [
      { "band": "clean", "count": 98000 },
      { "band": "watch", "count": 32000 },
      { "band": "suspicious", "count": 9800 },
      { "band": "sybil", "count": 3000 }
    ]
  }
]
```

---

#### `GET /api/v1/network/:network`

Returns aggregate health metrics for one network.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `network` | `string` | Network slug |

**Response `200 OK`:** Same shape as a single element from the `/api/v1/networks` list.

---

### Cluster Queries

#### `GET /api/v1/clusters`

Lists detected Sybil operator clusters.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | `integer` | `20` | Max results (1-100) |
| `offset` | `integer` | `0` | Pagination offset |
| `status` | `string` | `active` | Filter by `active` or `dissolved` |

**Response `200 OK`:**

```json
[
  {
    "clusterId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "memberCount": 14,
    "networkCount": 2,
    "networks": ["hivemapper", "dimo"],
    "meanConfidence": 0.87,
    "firstDetected": "2024-09-03T14:22:00Z",
    "status": "active"
  }
]
```

---

#### `GET /api/v1/clusters/:clusterId`

Returns full cluster detail including member nodes.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `clusterId` | `string` | UUID of the cluster |

**Response `200 OK`:**

```json
{
  "clusterId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "memberCount": 14,
  "networkCount": 2,
  "networks": ["hivemapper", "dimo"],
  "meanConfidence": 0.87,
  "firstDetected": "2024-09-03T14:22:00Z",
  "status": "active",
  "members": [
    {
      "network": "hivemapper",
      "nodeId": "hm-cam-9z4k",
      "ownerWallet": "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
      "confidence": 0.94
    },
    {
      "network": "dimo",
      "nodeId": "dimo-v-3311",
      "ownerWallet": "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
      "confidence": 0.91
    }
  ]
}
```

---

### Webhook Management

#### `POST /api/v1/webhooks`

Registers a new webhook subscription. **Requires authentication.**

**Request body:**

```json
{
  "callbackUrl": "https://your-app.com/hooks/lattice",
  "eventTypes": ["score.threshold_crossed", "cluster.detected"],
  "hmacSecret": "your-secret-min-16-chars"
}
```

**Request body schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `callbackUrl` | `string` | Yes | HTTPS URL to receive POST events |
| `eventTypes` | `string[]` | Yes | Array of event type strings |
| `hmacSecret` | `string` | Yes | Shared secret for `X-Lattice-Signature` HMAC (min 16 chars) |

**Response `201 Created`:**

```json
{
  "subscriptionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

**Available event types:**

| Event | Triggered when |
|-------|----------------|
| `score.threshold_crossed` | A node's band changes (e.g. watch → suspicious) |
| `cluster.detected` | A new Sybil cluster is identified |
| `cluster.dissolved` | A cluster status changes to `dissolved` |
| `dispute.opened` | An on-chain dispute is opened |
| `dispute.resolved` | A dispute is resolved |
| `attestation.revoked` | An on-chain attestation is revoked |

---

### Webhook Event Payloads

All webhook calls are `POST` requests with `Content-Type: application/json` and the following headers:

```
X-Lattice-Signature: <hex-encoded HMAC-SHA256 of the raw body using your hmacSecret>
X-Lattice-Event: score.threshold_crossed
X-Lattice-Delivery: <unique delivery UUID>
```

**`score.threshold_crossed` payload:**

```json
{
  "type": "score.threshold_crossed",
  "ts": "2024-11-15T09:00:00Z",
  "data": {
    "network": "dimo",
    "nodeId": "dimo-v-7721",
    "previousBand": "watch",
    "currentBand": "suspicious",
    "previousScore": 62,
    "currentScore": 44
  }
}
```

**`cluster.detected` payload:**

```json
{
  "type": "cluster.detected",
  "ts": "2024-11-15T09:05:00Z",
  "data": {
    "clusterId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "memberCount": 8,
    "networks": ["hivemapper"],
    "meanConfidence": 0.82
  }
}
```

---

## CORS

All API endpoints accept cross-origin requests from any origin:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-API-Key
```

Pre-flight `OPTIONS` requests are handled automatically.

---

## SDK

The official TypeScript SDK wraps this API with full type safety:

```bash
npm install @lattice-protocol/sdk
```

See [packages/sdk/README.md](../packages/sdk/README.md) for full SDK documentation.
