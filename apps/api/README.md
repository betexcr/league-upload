# League Uploads API

NestJS backend for uploads, documents, scanning, and auth.

## Requirements
- Node.js 18+
- Postgres
- (Optional) LocalStack for S3/SQS

## Setup
1) Install deps (from repo root):
   - `npm install`
2) Configure `apps/api/.env`.
3) Run migrations + seed:
   - `npm run prisma:migrate`
   - `npm run prisma:seed`

## Run
- Dev server: `npm run start:dev`
- Worker: `npm run start:worker`
- Prod build: `npm run build && npm run start`

## Tests
- `npm run test`
- `npm run test:cov`

## Storage + Queue
By default the API uses local filesystem storage:
- `LOCAL_STORAGE=true`
To use LocalStack:
- `USE_LOCALSTACK=true`
- `LOCAL_STORAGE=false`
- `LOCALSTACK_ENDPOINT=http://localhost:4566`
- `SQS_SCAN_QUEUE_URL=http://localhost:4566/000000000000/scan-queue`

## Auth
Local auth uses email + password. Role is assigned server-side.

See `docs/app-overview.md` for module/service details.
