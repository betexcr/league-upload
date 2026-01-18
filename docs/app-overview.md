# League Uploads - Current Architecture Overview

This document describes how the app works right now, including backend modules, services, and frontend pieces.

## Backend (NestJS)

### Modules
- Auth: JWT login/logout, role enforcement (MEMBER/AGENT/ADMIN). Login returns role based on email.
- Documents: List, fetch, update metadata, soft delete/restore, mark signed.
- Uploads: Init multipart upload, complete upload, preview URL issuance.
- Claims: Claim-to-document list lookup.
- Scan: Queue consumer that processes scan jobs and updates version status.
- Storage: S3 + SQS adapters and local-storage endpoints (when local storage is enabled).
- Common: Prisma client, audit logging, request metadata, guards.
- Proxy (optional): Not currently used for watermarking; preview uses signed URLs.

### Services
- PrismaService: DB access (Postgres).
- S3Service: Multipart init/sign/complete, presigned GET for previews, read object buffer.
- SqsService: Send scan jobs and receive/delete scan messages.
- UploadsService: Validates file policy, creates Document + Version, completes upload, enqueues scan.
- DocumentsService: Access control, list/search/filter, soft delete/restore, mark signed, preview URL lookup.
- ScanEngineService: Picks scan engine (local/placeholder/AWS).
- ScanWorkerService: Pulls from SQS, runs scan, updates Version status and latestVersionId.
- AuditService: Write audit events for create/update/delete/restore/preview/signed.

### Storage and Queue
- S3:
  - Used for multipart uploads and preview URLs.
  - Local storage fallback writes to `.local-storage` when `LOCAL_STORAGE=true`.
  - Localstack support when `USE_LOCALSTACK=true` and `LOCALSTACK_ENDPOINT` is set.
- SQS:
  - Used for scan job queue after upload completion.
  - Localstack support when `USE_LOCALSTACK=true`.

### Scan
- Current scan engine options:
  - Local ClamAV (via socket) when `SCAN_ENGINE=CLAMAV` and `SCAN_FEATURE_CLAMAV=true`.
  - Placeholder AWS mode for GuardDuty/Macie when flags are enabled.
  - The worker updates `Version.status` to CLEAN or BLOCKED.

## Frontend (React)

### Major Components
- Login screen: uses email/password, role is returned by API (no role picker).
- UploaderWidget: multipart uploads with queue persistence (IndexedDB).
- DocumentGallery: grid/list view, click card to open preview, delete/restore/signed controls.
- DocumentViewer: inline preview for images/PDFs; click to open large preview modal.

### UI Behavior
- Agents see all documents; users only see their own.
- Agents can mark signed and restore deleted documents.
- Users cannot edit/delete signed documents.
- Deleted documents are filtered via status dropdown (agent only).
- Optimistic updates for delete/restore/signed.

## Request Flow Summary

### Upload (USER only)
1. `POST /v1/uploads` creates Document + Version and returns multipart URLs.
2. Client uploads parts to S3 (or local storage).
3. `POST /v1/uploads/:id/complete` validates parts, completes multipart upload, enqueues scan.
4. Scan worker updates version status; first CLEAN version sets `Document.latestVersionId`.

### Preview
- `GET /v1/documents/:id/preview-url` returns a short-lived signed URL.
- Images/PDFs render inline; clicking opens a large modal view.

### Document CRUD
- `GET /v1/documents` supports filters: ownerId, ownerEmail, linkType/linkId, category, q, status, deleted.
- `PATCH /v1/documents/:id` updates metadata (optimistic on FE).
- `DELETE /v1/documents/:id` sets `deletedAt` (soft delete).
- `POST /v1/documents/:id/restore` clears `deletedAt`.
- `POST /v1/documents/:id/signed` marks as signed (agent/admin).

## Environment Flags (Current)
- `LOCAL_STORAGE=true|false`: local filesystem for objects.
- `USE_LOCALSTACK=true|false`: use LocalStack for S3/SQS.
- `AWS_ENDPOINT_URL` / `LOCALSTACK_ENDPOINT`: LocalStack endpoints.
- `SQS_SCAN_QUEUE_URL`, `AWS_S3_BUCKET`: queue/bucket targets.
- `SCAN_ENGINE=CLAMAV|AWS|NONE`: scan engine selection.
- `SCAN_FEATURE_CLAMAV`, `SCAN_FEATURE_GUARDDUTY`, `SCAN_FEATURE_MACIE`: toggle scan options.

## Tests
- Backend: Jest + supertest (upload init/complete, CRUD, ACL, scan callback).
- Frontend: Playwright coverage for UI flows.
