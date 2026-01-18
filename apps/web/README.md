# League Uploads Web

React + Vite frontend for uploading and reviewing documents.

## Requirements
- Node.js 18+
- API running at `http://localhost:8080`

## Run
From `apps/web`:
- `npm run dev`

## Build
- `npm run build`

## Tests
- Unit: `npm run test`
- E2E: `npm run test:e2e`

## Notes
- Agents see all documents; users only see their own.
- Uploads are available only to `USER` role.
