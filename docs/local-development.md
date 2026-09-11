# Local development

The authoritative setup for running Smarteam on a development machine.

**Docker is not required.** Smarteam runs against native services: PostgreSQL and a
Redis-compatible server installed as ordinary OS services, and real AWS S3 for file storage.
There is no MinIO, no S3 emulator, no filesystem fallback and no fake storage.

The storage path is identical to production. The same `StorageService`, the same AWS SDK client,
the same presigned-URL flow and the same authorization. Only the credentials differ: a developer
uses an access key, production resolves an IAM role.

## Required software

| Component | Notes |
|---|---|
| Node.js 22 | `engines` requires `>=20.9 <25` |
| pnpm 10 | via corepack |
| PostgreSQL 16+ | installed as a Windows service; 18 is what this was verified on |
| Memurai (or Redis) | Redis-compatible, installed as a Windows service |
| An AWS account | one private S3 bucket and one IAM user |

Docker is optional and used by nothing here.

## PostgreSQL

Install PostgreSQL for Windows and let the installer register the service. Then create the
database:

```bash
createdb -U postgres smarteam
```

`DATABASE_URL` points at it exactly as it does in production — the application has no local
special case:

```
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/smarteam?schema=public
```

Confirm the service is the one answering, rather than a container that happens to hold the port:

```bash
psql -U postgres -d smarteam -c "select version()"
```

A native Windows install reports `x86_64-windows`; a container reports a Linux build.

## Redis

**Redis is required, not optional.** Three things depend on it:

- **Rate limiting** — request, auth and federation interceptors.
- **Background jobs** — three BullMQ queues: `webhook-delivery`, `outbox-dispatch` and
  `file-lifecycle`. The last one is what eventually deletes a soft-deleted file's S3 object.
- **Readiness** — `/health/ready` reports `unavailable` without it.

Rate limiting **fails open**: with Redis down the API keeps serving, and the only symptom is that
nothing is rate-limited any more. That is a deliberate availability choice and it is exactly why
running without Redis is not a supported local mode — it looks like it works.

On Windows, [Memurai](https://www.memurai.com/) is a Redis-compatible service. Install it, or run
Redis under WSL2, and leave the default:

```
REDIS_URL=redis://localhost:6379
```

## AWS

### Bucket

One private bucket per environment:

- **Object Ownership** ACLs disabled, bucket owner enforced
- **Block Public Access** all four settings on
- **Default encryption** SSE-S3 (`AES256`) — the API signs every upload with
  `ServerSideEncryption: AES256`, which S3 supports natively; no KMS key is needed
- **Bucket policy** none — every read and write goes through a presigned URL the API issues after
  it has authorized the caller
- **Versioning** optional

### IAM

A dedicated user for local development, with only what the application actually does.
`HeadObject`, used to verify a completed upload, is covered by `s3:GetObject`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::YOUR-BUCKET/*"
    }
  ]
}
```

No `s3:ListBucket`. The application never lists a bucket — it addresses objects by keys recorded
in PostgreSQL — so granting it would only let a leaked key enumerate every tenant's objects.

In production prefer an instance or task role and leave `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` empty; the SDK resolves the role with no code change.

### CORS

The browser PUTs directly to S3, so the bucket needs CORS. This is bucket configuration — nothing
in the repository sets it.

`AllowedHeaders` is not arbitrary. A presigned URL is a signature over an exact request, and the
browser sends `x-amz-server-side-encryption` because the API signed it. A preflight that does not
permit that header fails every upload before a byte moves.

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "x-amz-server-side-encryption",
      "x-amz-checksum-sha256"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

`http://localhost:3000` is web-org; add `http://localhost:3001` if you work on web-admin. Never
`*`, and never a wildcard header list.

## Environment

Copy `.env.example` to `.env` — gitignored, never committed — and fill in:

```
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/smarteam?schema=public
REDIS_URL=redis://localhost:6379

AWS_REGION=eu-north-1
AWS_S3_BUCKET=your-bucket-name
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_S3_ENDPOINT=
AWS_S3_FORCE_PATH_STYLE=false
```

Leave `AWS_S3_ENDPOINT` empty. Setting it is the one thing that would send your uploads somewhere
other than AWS, and removing that difference is the point of this setup. The two endpoint
variables exist solely for CI, which runs the storage suite against a MinIO container.

The frontend never receives AWS credentials. Only the API talks to S3.

## Run it

```bash
pnpm install
pnpm db:deploy && pnpm db:seed
pnpm dev
```

- API — http://localhost:4000
- web-org — http://localhost:3000
- web-admin — http://localhost:3001

Check the API is talking to both services:

```bash
curl http://localhost:4000/health/ready
```

`{"status":"ok", ...}` with `database` and `redis` both `up`.

For a populated tenant to sign in with:

```bash
node scripts/seed-ui-tenant.mjs
```

It writes the credentials to `.seed-credentials.local` (gitignored, mode 0600) rather than
printing the password.

## Verify

```bash
pnpm verify:files
```

45 checks over the full lifecycle against the real bucket: presigned upload, a real byte PUT
carrying the signed SSE header, completion with size and checksum verification, a download whose
bytes are compared to what was sent, deletion, and cross-tenant rejection of both download and
delete. It creates throwaway tenants and cleans up after itself.

An unreachable bucket fails rather than skipping. Skipping is how two crashes stayed hidden.

The other suites need no AWS at all:

```bash
pnpm verify:auth && pnpm verify:payroll && pnpm verify:leave
```

## Troubleshooting

**`CredentialsProviderError: Could not load credentials`** — `AWS_ACCESS_KEY_ID` or
`AWS_SECRET_ACCESS_KEY` is empty. Everything except files still works.

**Uploads fail in the browser but `verify:files` passes** — CORS. The Node client is not subject
to preflight; the browser is. Check `x-amz-server-side-encryption` is in `AllowedHeaders`.

**`/health/ready` reports redis down** — the Memurai service is stopped, or a container is
holding 6379. Both cannot bind it; whichever starts second loses.

**Port 5432 or 6379 already in use** — a leftover container. `docker ps` and stop it; the native
service takes the port on its next restart.

**`pnpm db:deploy` cannot connect** — check `DATABASE_URL` and that the PostgreSQL service is
running.

## What is *not* required

- **Docker** — `docker-compose.yml` is an optional fallback for a machine with no native
  databases, and cannot run alongside them because both would bind the same ports. Nothing in
  `pnpm dev`, `pnpm test`, `pnpm verify:*` or `pnpm db:*` touches it.
- **MinIO** — not used locally. It exists only inside `.github/workflows/ci.yml`, as an
  S3-compatible test double so the storage suite stays gated without long-lived AWS keys in
  GitHub. No application code knows it exists.
- **LocalStack, an S3 emulator, or a filesystem fallback** — none of these exist, deliberately.
  Local storage behaviour that differs from production is the bug this setup removes.
