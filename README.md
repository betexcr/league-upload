# League Upload Management System

Production-ready backend + UI for resumable document uploads, scanning, and review workflows.

## Repo Overview
- `apps/api`: NestJS API (uploads, documents, auth, scan worker).
- `apps/web`: React + Vite frontend.
- `apps/mobile`: Expo client (optional).
- `packages/*`: shared UI and client libraries.
- `docs/`: architecture and system notes.
- `infra/localstack`: LocalStack + Terraform helpers.

## Quick Start (Local)
1) Install deps:
   - `npm install`
2) Start Postgres (local or Docker).
3) API:
   - `cd apps/api`
   - `npm run prisma:migrate`
   - `npm run prisma:seed`
   - `npm run start:dev`
4) Web:
   - `cd apps/web`
   - `npm run dev`

Default frontend URL: `http://localhost:5173`  
Default API URL: `http://localhost:8080`

## Environment
API is configured via `apps/api/.env`. Key flags:
- `LOCAL_STORAGE=true|false`: local filesystem storage (default true).
- `USE_LOCALSTACK=true|false`: use LocalStack for S3/SQS (default false).
- `AUTH_MODE=local|cognito`: login mode (feature flags apply).
- `SCAN_ENGINE=CLAMAV|AWS|NONE`: scan behavior.

See `docs/app-overview.md` for a current module/service summary.

## Docs
- `docs/app-overview.md`: architecture snapshot.
- `infra/localstack/README.md`: LocalStack usage.

## App Readmes
- `apps/api/README.md`
- `apps/web/README.md`
- `apps/mobile/README.md`
