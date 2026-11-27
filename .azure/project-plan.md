# Project Plan

**Status**: Integrated
**Created**: 2026-11-22
**Mode**: NEW

---

## 1. Project Overview

**Goal**: Reconstruct StudentHub as an AI-powered student services platform for hostel discovery, roommate matching, mess dining, a verified marketplace, messaging, and role-based account management.

**App Type**: SPA + API

**API Login**: Yes

**Mode**: NEW

**Deployment Plan**: No deployment plan found

---

## 2. Backend - FastAPI

| Component | Technology |
|-----------|------------|
| **Language** | Python |
| **Runtime** | CPython |
| **Framework** | FastAPI |
| **Package Manager** | pip |
| **Test Runner** | pytest |
| **Mocking Library** | unittest.mock |
| **Test Command** | .venv/Scripts/python -m pytest |
| **Orchestration** | docker-compose |

The API manages authentication and roles, hostel and room inventory, roommate matching, mess subscriptions and dining, marketplace listings, chat, uploads, support, reports, moderation, and AI-assisted ranking and triage. It uses SQLAlchemy for PostgreSQL persistence and Azure service integrations for managed storage and AI capabilities.

---

## 3. Frontend - Web App

| Component | Technology |
|-----------|------------|
| **Language** | TypeScript |
| **Framework** | React + Vite |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | npm test |

The responsive frontend includes sign-in and role flows, a student dashboard, hostel search and roommate matches, mess dining and subscriptions, marketplace listings and saved items, messaging, reports, AI chat, profile management, and role-specific owner, mess, seller, and admin screens.

---

## 4. Services Required

| Azure Service | Role in App | Environment Variable | Default Value (Local) | Classification |
|---------------|------------|---------------------|----------------------|----------------|
| PostgreSQL | Primary relational store for users, listings, bookings, matches, messages, subscriptions, reports, and moderation | DATABASE_URL | postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/studenthub | Essential |
| Blob Storage | Store hostel photos, profile images, marketplace product photos, documents, and repair attachments | STORAGE_CONNECTION_STRING | UseDevelopmentStorage=true | Essential |
| Azure OpenAI | Power semantic search, roommate explanation, listing quality checks, pricing support, and chat triage | AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY | No local emulator | Enhancement |

---

## 5. Prerequisites

### Run

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Python | studenthub-backend | ❓ | CPython 3.14.6150.1013 detected; compatible local Functions runtime unconfirmed |
| pip | studenthub-backend | ✅ | pip 26.1.2 |
| Node.js | studenthub-frontend | ✅ | v24.22.0 |
| npm | studenthub-frontend | ✅ | Detected; exact version unconfirmed |
| PostgreSQL 18 client | studenthub-backend, PostgreSQL | ✅ | 18.0.6 |
| Git | * | ✅ | 2.55.0 |

### Debug

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Docker | PostgreSQL, Blob Storage, Azure OpenAI | ❓ | Docker CLI not detected |
| Docker Compose | PostgreSQL, Blob Storage, Azure OpenAI | ❓ | Docker Compose provider not detected |
| Chrome or Edge | studenthub-frontend | ❓ | Browser executable unconfirmed |
| ms-azuretools.vscode-azurefunctions | studenthub-backend | ❓ | Extension not found in the available extension folders |
| ms-python.python | studenthub-backend | ✅ | ms-python.python-2026.10.0 |
| ms-python.debugpy | studenthub-backend | ✅ | ms-python.debugpy-2026.6.0 |

Double-check every ❓ prerequisite in the host environment before running the project. Docker is the default container runtime because neither Docker nor Podman was confirmed.

---

## 6. Design System & UI

**Component Library**: Fluent UI v9

**Style Direction**: Warm, practical student services console with calm navy surfaces, high-contrast saffron accents, compact information density, 8px radius, and clear state-focused controls.

**Typography**: Segoe UI Variable

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#5589d3` | Primary navigation, action buttons, selected states, and account links |
| `accent` | `#4f46e5` | Roommate matches, marketplace highlights, badges, and key calls to action |
| `surface` | `#f8fafc` | Page background and neutral application canvas |
| `text` | `#172033` | Main labels, headings, listings, and operational data |
| `muted` | `#475569` | Captions, timestamps, secondary metadata, and helper text |
| `border` | `#e2e8f0` | Card dividers, field borders, table rules, and panel boundaries |

### Pages

| Page | Route | Purpose | Layout |
|------|-------|---------|--------|
| Dashboard | `/` | Summarize room availability, mess plans, saved listings, and roommate matches | header, sidebar, main, kpi, card-grid |
| Hostels | `/hostels` | Browse verified hostels and inspect room, amenity, and proximity details | header, sidebar, main, split(filters|list), card-grid |
| Roommate Matches | `/roommates` | Review compatibility-ranked student match suggestions | header, sidebar, main, table, action-bar |
| Mess Dining | `/mess` | View today’s menu, subscriptions, and mess service status | header, sidebar, main, two-column(main+schedule), card-list |
| Marketplace | `/marketplace` | Discover and save verified second-hand listings | header, sidebar, main, grid, card-grid |
| Messages | `/messages` | Manage conversations and support threads | header, sidebar, main, split(conversations|thread) |

### Sample Content

Dashboard — student services:

| Metric | Current Value | Status |
|--------|---------------|--------|
| Available rooms | 34 verified rooms | 6 added this week |
| Active meal plans | North Campus Mess | Dinner at 7:30 PM |
| Roommate matches | 12 compatible students | 3 high confidence |
| Marketplace saves | 8 saved listings | 2 price drops |

Hostels — primary entity:

| Hostel | Area | Monthly Rent | Rating |
|--------|------|--------------|--------|
| The Scholar House | North Campus | ₹8,500 | 4.8 |
| Lakeview Residency | University Lake | ₹7,200 | 4.6 |
| Apex Student Homes | Metro Gate | ₹9,100 | 4.7 |

Roommate Matches — primary entity:

| Student | Course | Budget | Match |
|---------|--------|--------|-------|
| Aarav Singh | Computer Science | ₹7,000–₹9,000 | 94% |
| Meera Kapoor | Economics | ₹6,500–₹8,500 | 91% |
| Kabir Shah | Architecture | ₹8,000–₹10,000 | 88% |

Mess Dining — dining plan:

| Meal | Menu | Time | State |
|------|------|------|-------|
| Breakfast | Masala dosa, idli, fruit | 7:30–9:30 AM | Available |
| Lunch | Rajma, jeera rice, roti, salad | 12:30–2:30 PM | Serving |
| Dinner | Paneer masala, dal, rice, roti | 7:30–9:30 PM | Upcoming |

Marketplace — listing:

| Item | Seller | Price | Condition |
|------|--------|-------|-----------|
| Dell Inspiron 15 | Riya M. | ₹38,500 | Excellent |
| Engineering drawing set | Arjun P. | ₹1,200 | Like new |
| Single bed with mattress | Sana K. | ₹6,800 | Good |

Messages — conversation:

| Contact | Subject | Last Message | State |
|---------|---------|--------------|-------|
| Scholar House | Room inspection | The 4 PM slot is confirmed. | Unread |
| North Campus Mess | November plan | Your renewal is approved. | Read |
| Student Support | Document review | Please upload the revised ID proof. | Open |

---

## 7. Project Structure

```
student-hub/
├── .azure/
│   └── project-plan.md
├── .env.example
├── docker-compose.yml
├── services/
│   ├── studenthub-api/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   ├── core/
│   │   │   ├── models/
│   │   │   ├── schemas/
│   │   │   └── services/
│   │   ├── tests/
│   │   ├── requirements.txt
│   │   └── pyproject.toml
│   └── studenthub-web/
│       ├── src/
│       │   ├── components/
│       │   ├── features/
│       │   ├── pages/
│       │   ├── services/
│       │   └── test/
│       ├── package.json
│       └── vite.config.ts
└── README.md
```

---

## 8. Route Definitions

| # | Method | Path | Description | Request Body | Response Body | Status Codes |
|---|--------|------|-------------|-------------|--------------|-------------|
| 1 | GET | `/api/health` | Health check | — | `{ status, database, storage }` | 200, 503 |
| 2 | POST | `/api/auth/register` | Register a student or role account | `{ name, email, password, role }` | `{ user, session }` | 201, 409, 422 |
| 3 | POST | `/api/auth/login` | Authenticate an account | `{ email, password }` | `{ user, session }` | 200, 401, 422 |
| 4 | GET | `/api/hostels` | Search verified hostels | — | `{ hostels, pagination }` | 200, 503 |
| 5 | GET | `/api/roommates/matches` | Get ranked roommate matches | — | `{ matches }` | 200, 401, 503 |
| 6 | GET | `/api/mess/menu` | Get menu and subscription state | — | `{ menu, subscriptions }` | 200, 503 |
| 7 | GET | `/api/marketplace/listings` | Search marketplace listings | — | `{ listings, pagination }` | 200, 503 |
| 8 | POST | `/api/uploads/presign` | Create an upload authorization | `{ type, filename, contentType }` | `{ uploadUrl, objectUrl }` | 200, 401, 422 |
| 9 | GET | `/api/conversations` | List the signed-in account's conversations | — | `{ conversations }` | 200, 401, 503 |
| 10 | POST | `/api/reports` | Submit a report | `{ targetType, targetId, reason }` | `{ report }` | 201, 401, 422 |

---

## 9. Next Steps

1. Run **azure-project-scaffold** to execute this plan
2. Run **azure-project-integrate** to wire the frontend to live data, smoke-test the backend, and create the migrations
3. Run **azure-debug-plan** → **azure-debug-generate** for Docker emulators and VS Code debugging
4. Run the **azure-deploy** agent when ready; it uses **azure-app-onboard** for architecture, cost estimation, IaC generation, provisioning, and health verification
