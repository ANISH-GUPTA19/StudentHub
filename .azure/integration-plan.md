# Integration Plan

## Backend
- Project: `services/studenthub-api/`
- Framework: FastAPI + SQLAlchemy + PostgreSQL
- Run: `services/studenthub-api/.venv/Scripts/python -m uvicorn app.main:app --app-dir services/studenthub-api --reload --host 0.0.0.0 --port 8000`
- Build/compile: `python -m compileall -q services/studenthub-api`
- Health: `GET /api/health`
- Docker: `docker compose up --build`
- Database migration tool: integrate to add Alembic. Migration directory: `services/studenthub-api/alembic/`
- Database connection: `DATABASE_URL=postgresql+psycopg://studenthub:studenthub@localhost:5432/studenthub`
- Explicit requirement: create schema migrations only; do not seed data.

## Frontend
- Project: `services/web/`
- Build: `npm --prefix services/web run build`
- Dev: `npm --prefix services/web run dev`
- API seam: `services/web/src/api/index.ts`
- Seam types: `services/web/src/api/types.ts`
- Mock client to delete after live wiring: `services/web/src/api/mockClient.ts`
- Mock data to delete: `services/web/src/mocks/data.ts`
- Preview state to delete: `services/web/src/api/previewState.ts`
- Live wiring: change `src/api/index.ts` to export a typed live client implementing `ApiClient`; do not rewrite page imports.

## API Routes
- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/hostels`
- `GET /api/roommates/matches`
- `GET /api/mess/menu`
- `GET /api/marketplace/listings`
- `POST /api/uploads/presign`
- `GET /api/conversations`
- `POST /api/reports`

## Shared Contracts
- Frontend entities: `services/web/src/types/entities.ts`
- Backend Pydantic contracts: `services/studenthub-api/app/schemas/contracts.py`
- Error format: `{ "error": { "code", "message", "details?" } }`

## Azure Services
- Essential: PostgreSQL, Blob Storage
- Enhancement: Azure OpenAI

## Integrate Checklist
1. Add SQLAlchemy/Alembic migrations; no seed data.
2. Swap the frontend API seam to a live typed client; delete mock-only files.
3. Smoke-test every route.
4. Start frontend and backend together and verify end-to-end navigation and auth.

## Integration Results
- Alembic migration `20261122_0001_initial_schema` applied to PostgreSQL; `users`, `hostels`, and `alembic_version` exist. No seed or fixture data was created.
- Backend route inventory smoke-tested: health, register, login, hostels, roommate matches, mess menu, marketplace listings, upload presign, conversations, and reports all returned successful responses.
- Frontend is wired to `src/api/client.ts`; the Vite `/api` proxy targets `http://localhost:8000`; mock client, mock data, and preview-state switcher were removed.
- Frontend build passed. Vite and FastAPI ran concurrently; `GET http://127.0.0.1:5173/api/hostels` returned live data (3 hostels) through the proxy.
