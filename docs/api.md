# Phoneflow public API

The public API lets your own servers place calls and read results. It lives under `/api/v1` on your API host (for example `https://api.example.com/api/v1`).

## Authentication

Create a key in **Settings > API keys**. The full key is shown once, so store it when you create it. Phoneflow keeps only a SHA-256 hash.

Send the key as a bearer token on every request:

```bash
export PHONEFLOW_API_URL="https://api.example.com"
export PHONEFLOW_API_KEY="pf_..."

curl "$PHONEFLOW_API_URL/api/v1/agents" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY"
```

- A missing, wrong, revoked or expired key returns `401` with the same body in every case.
- A session cookie does not authenticate `/api/v1`, and the API sends no CORS headers. Call it from a server, never from a browser.
- Keys belong to the organization, not the person who created them. They keep working when that person leaves. Revoke them from the settings page.

Keys have full access to the organization. There are no per-key scopes yet.

## Errors and localization

Errors are JSON with an `error` message: `{ "error": "Call not found" }`. Set `Accept-Language: es` to get them in Spanish.

| Status | Meaning |
| --- | --- |
| `400` | The request failed validation. |
| `401` | The API key is missing or not valid. |
| `402` | The organization has no credits (cloud only). |
| `404` | The resource does not exist or belongs to another organization. |
| `429` | Rate limit exceeded. Wait for the number of seconds in `Retry-After`. |
| `503` | The rate limiter is unavailable, so call-creating requests are refused. Retry shortly. |

## Rate limits

Each key can make 60 requests per minute across all endpoints. The counter resets at the start of each clock minute, so short bursts across a minute boundary can exceed 60 in any rolling 60 seconds.

If Redis is unavailable, `GET` requests continue without a limit, and `POST` requests return `503` so calls are never placed without the limiter.

## Calls

### Place a call

`POST /api/v1/calls`

```bash
curl -X POST "$PHONEFLOW_API_URL/api/v1/calls" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "6f0c1c34-6b0e-4a3f-8c55-0a3a5f6a1b11",
    "agentId": "1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22",
    "toNumber": "+34600000000",
    "variables": { "customer_name": "Ana" }
  }'
```

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `phoneNumberId` | UUID | Yes | A number in your organization with a SIP connection. |
| `agentId` | UUID | Yes | An agent in your organization. |
| `toNumber` | E.164 string | Yes | The number to call. |
| `agentVersionId` | UUID | No | A published version of the agent. Omit it to use the current draft. |
| `variables` | object of strings | No | Values for the agent's dynamic variables. |

Returns `202` with the ID the call will have:

```json
{ "id": "0b7f2f50-8f6a-4a43-9c55-3a8c7f1d4e33" }
```

The call record is created when the call connects, or when ringing times out. Until then `GET /api/v1/calls/:id` returns `404`, so poll it. If the call never reaches the agent, for example because the agent worker is down, the record is never created.

Retrying this request places a second call. There is no idempotency key yet.

### Get a call

`GET /api/v1/calls/:id`

```bash
curl "$PHONEFLOW_API_URL/api/v1/calls/0b7f2f50-8f6a-4a43-9c55-3a8c7f1d4e33" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY"
```

```json
{
  "id": "0b7f2f50-8f6a-4a43-9c55-3a8c7f1d4e33",
  "agentId": "1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22",
  "agentVersionId": null,
  "batchCallId": null,
  "channel": "phone_call",
  "direction": "outbound",
  "status": "completed",
  "fromNumber": "+34910000000",
  "toNumber": "+34600000000",
  "startedAt": "2026-11-05T10:00:00.000Z",
  "endedAt": "2026-11-05T10:03:20.000Z",
  "durationMs": 200000,
  "totalCost": "0.420000",
  "variables": { "customer_name": "Ana" },
  "createdAt": "2026-11-05T10:00:00.000Z",
  "updatedAt": "2026-11-05T10:03:20.000Z",
  "transcript": [
    { "id": "item_1", "role": "assistant", "content": "Hello Ana", "createdAt": 1793959200000 }
  ]
}
```

`status` is `in_progress`, `completed` or `no_answer`. `totalCost` is `null` on self-hosted deployments.

### List calls

`GET /api/v1/calls`

```bash
curl "$PHONEFLOW_API_URL/api/v1/calls?status=completed&agentId=1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22&page=1&pageSize=20" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY"
```

| Query parameter | Notes |
| --- | --- |
| `status` | `in_progress`, `completed` or `no_answer`. |
| `agentId` | Filter by agent. |
| `batchCallId` | Filter by batch call. |
| `page` | Starts at 1. Default 1. |
| `pageSize` | 1 to 100. Default 20. |

Returns the newest calls first, without transcripts:

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 20 }
```

## Agents

`GET /api/v1/agents`

```bash
curl "$PHONEFLOW_API_URL/api/v1/agents?page=1&pageSize=20" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY"
```

```json
{
  "items": [
    {
      "id": "1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22",
      "name": "Appointment reminders",
      "createdAt": "2026-11-01T09:00:00.000Z",
      "updatedAt": "2026-11-04T16:30:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

## Batch calls

### Create a batch call

`POST /api/v1/batch-calls`

```bash
curl -X POST "$PHONEFLOW_API_URL/api/v1/batch-calls" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "November reminders",
    "phoneNumberId": "6f0c1c34-6b0e-4a3f-8c55-0a3a5f6a1b11",
    "agentId": "1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22",
    "scheduledAt": "2026-11-06T09:00:00.000Z",
    "recipients": [
      { "toNumber": "+34600000000", "variables": { "customer_name": "Ana" } },
      { "toNumber": "+34600000001" }
    ]
  }'
```

`recipients` takes 1 to 500 entries. `scheduledAt` is optional and must be in the future; without it the batch starts right away. `agentVersionId` works as it does for a single call. Returns `201` with the batch call.

### Get a batch call

`GET /api/v1/batch-calls/:id`

```bash
curl "$PHONEFLOW_API_URL/api/v1/batch-calls/9c1e5a70-2b44-4e8d-8f11-7d6a4b3c2e44" \
  -H "Authorization: Bearer $PHONEFLOW_API_KEY"
```

```json
{
  "id": "9c1e5a70-2b44-4e8d-8f11-7d6a4b3c2e44",
  "name": "November reminders",
  "status": "scheduled",
  "phoneNumberId": "6f0c1c34-6b0e-4a3f-8c55-0a3a5f6a1b11",
  "agentId": "1d9a7c52-3d55-4c1c-9a54-5e2f6f6d2c22",
  "agentVersionId": null,
  "scheduledAt": "2026-11-06T09:00:00.000Z",
  "totalCount": 2,
  "createdAt": "2026-11-05T10:00:00.000Z",
  "updatedAt": "2026-11-05T10:00:00.000Z"
}
```

To see the result of each call in a batch, use `GET /api/v1/calls?batchCallId=...`.
