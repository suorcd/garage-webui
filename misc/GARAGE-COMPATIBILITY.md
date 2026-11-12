# Garage compatibility

This file records the supported Garage versions and the decision on admin API routes that the UI does not use.

## Supported versions

Source: the Garage 2.4.1 and 2.5.0 admin API source files. The deployment runs Garage 2.5.0.

| Capability | Garage 2.4.1 | Garage 2.5.0 |
| --- | --- | --- |
| Bucket, key, cluster, and browse screens | Yes | Yes |
| CORS settings | Yes | Yes |
| Lifecycle rules | Yes | Yes |
| Presigned download links | Yes | Yes |
| Key createBucket readback | Yes (via `GetKeyInfo`) | Yes (via `ListKeysInfo`) |
| Key list identifier | `id` from `ListKeys` | `accessKeyId` from `ListKeysInfo` |

Garage 2.4.1 has no `ListKeysInfo`. The keys screen falls back to `ListKeys` and reads each key's permissions from `GetKeyInfo`.

The two key list routes name the identifier differently. `ListKeys` answers with `ListKeysResponseItem` objects, which carry `id`. `ListKeysInfo` answers with `GetKeyInfoResponse` objects, which carry `accessKeyId`. The UI reads `id` everywhere, so `toKey` in `src/pages/keys/hooks.ts` maps both shapes to `id`.

## Admin API routes used by the UI

The UI uses these routes. They exist in Garage 2.4.1 and 2.5.0.

- `GET /v2/GetClusterStatus`
- `GET /v2/GetClusterLayout`
- `GET /v2/GetClusterHealth`
- `GET /v2/GetNodeInfo`
- `GET /v2/ListBuckets`
- `GET /v2/GetBucketInfo`
- `GET /v2/ListKeys`
- `GET /v2/GetKeyInfo`
- `POST /v2/CreateKey`
- `POST /v2/ImportKey`
- `POST /v2/UpdateKey`
- `POST /v2/DeleteKey`
- `POST /v2/AllowBucketKey`
- `POST /v2/DenyBucketKey`
- CORS and lifecycle S3 requests through the per-bucket S3 credentials
- Presigned GET URLs through the per-bucket S3 credentials

Garage 2.5.0 adds `ListBucketsInfo` and `ListKeysInfo`. The UI uses `ListKeysInfo` when it is present.

## Routes not used

These routes exist in Garage 2.4.1 and 2.5.0. The UI does not use them.

| Route | Possible use | Decision |
| --- | --- | --- |
| `POST /v2/CleanupIncompleteUploads` | Remove orphaned multipart uploads | Do not add now. The browse screen shows unfinished upload counts. A cleanup action needs a separate confirmation flow. |
| `GET /v2/InspectObject` | Object metadata and version inspection | Do not add now. The current object view shows the object bytes. |
| `GET /v2/GetClusterStatistics` | Richer dashboard data | Do not add now. The health and bucket screens cover the current dashboard. |
| `GET /metrics` | Prometheus metrics panel | Do not add now. Use an external Prometheus instance. |

## Lifecycle and CORS

The UI exposes only the lifecycle rule types that Garage supports: `Expiration` and `AbortIncompleteMultipartUpload`.
Garage 2.5.0 did not add another lifecycle rule type for this UI.
The CORS routes and rule shape are present in both versions. The UI uses the same rule fields in both.

## Admin API changes

Garage 2.5.0 adds `ListBucketsInfo` and `ListKeysInfo`. It removes none of the routes that the UI uses.
No admin API route used by the UI was deprecated in 2.5.0.

## Decision

Keep the current feature set. Do not add the unused admin routes until a user need and a clear flow exist.
Garage 2.4.1 and 2.5.0 both stay usable. Garage 2.5.0 fetches the key list in one `ListKeysInfo` request.
