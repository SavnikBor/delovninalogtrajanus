# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Delovni Nalog ("Work Order") is a Slovenian-language print shop work order management system for Trajanus. It is a monorepo with a Node.js/Express backend and a React/Vite/TypeScript frontend.

### Services

| Service | Port | Start command |
|---------|------|---------------|
| Backend API (Express) | 5000 | `cd backend && node server.js` |
| Frontend (Vite dev) | 5173 | `cd frontend && npm run dev` |

Both can be started together from the root with `npm run dev` (uses `concurrently`).

### Key caveats

- **Backend entry point**: The production backend runs `backend/server.js` (plain JS, ~3170 lines), **not** the TypeScript `src/app.ts` (which is a partial rewrite with fewer endpoints). The root `npm run server` script uses `node server.js`.
- **MSSQL dependency**: The backend requires a Microsoft SQL Server database. Without a reachable MSSQL instance and valid `DB_*` credentials in `backend/.env`, the backend still starts and serves non-DB endpoints (healthcheck, AI parsing, scan log), but all data-fetching endpoints (`/api/kupec`, `/api/delovninalog`, etc.) will fail with connection errors. No Docker Compose or local DB setup is provided—an external MSSQL instance is expected.
- **Backend .env**: Must be created at `backend/.env` with `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`, `DB_PORT`. The file is gitignored.
- **SMTP**: Configured via `process.env` at the repo root (committed). Points to an internal corporate gateway (`gw.trajanus.si:465`) unreachable from external networks. Email-sending features won't work externally but don't block other functionality.
- **OpenAI**: The AI email-parsing feature (`/api/parse-email`) requires `OPENAI_API_KEY` in `backend/.env`. Without it, only AI endpoints are affected.
- **Frontend .env**: Contains `VITE_API_URL=http://localhost:5000/api` (already committed).

### Lint / Build / Test

- **Lint (frontend)**: `cd frontend && npx eslint .` — pre-existing lint errors exist (~236 errors, mostly `@typescript-eslint/no-explicit-any`); these are in the original codebase.
- **TypeScript check (frontend)**: `cd frontend && npx tsc -b` — pre-existing TS errors exist.
- **TypeScript check (backend)**: `cd backend && npx tsc --noEmit` — pre-existing TS errors exist in `src/app.ts`; the production server uses `server.js` (plain JS).
- **No automated test suite** is present in this codebase.

### Package manager

This project uses **npm** with `package-lock.json` at the root and in `backend/`. The `frontend/` directory has no lockfile.

### Node.js version

Tested and working with Node.js v22.x (the version available in the cloud VM).
