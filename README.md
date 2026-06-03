# Ordo — Campaign Management Platform

A full-stack campaign and task management platform built to explore the intersection of **Rust-based APIs**, **AI-assisted planning**, and **real-time streaming UI**. The backend is written entirely in Rust (Axum + SQLx), with a Next.js 14 frontend and Mistral AI integration for campaign planning and chat.

> Built as a portfolio project to demonstrate end-to-end product engineering — from database schema design to streaming SSE responses to mobile-responsive drag-and-drop UI.

---

## What It Does

**Ordo** lets teams plan and execute campaigns with structured task management:

- Admins create campaigns and use an **AI wizard** to generate a full task breakdown from a brief
- Tasks have **typed dependency chains** — sub-tasks nest under their parents visually, and moving a task to Done is blocked if its dependencies aren't complete
- Members are assigned tasks and move them across a **kanban board** (drag-and-drop, including mobile with dedicated touch handles)
- An **AI chat assistant** (per campaign, with persistent sessions) helps teams brainstorm and refine plans via streaming responses
- A **calendar view** aggregates all tasks across campaigns with per-campaign colour coding

---

## Technical Highlights

### Rust backend with Axum
The API server is written in Rust using Axum 0.8 and SQLx 0.8 with compile-time verified queries. The router is split into two layered middleware stacks — one for authenticated users, one for admin-only routes — so access control is enforced at the routing layer rather than scattered through handler logic.

```
Router
├── public          → /auth/register, /auth/login
├── protected       → JWT required (require_auth middleware)
│   └── admin_only  → role == "admin" (require_admin middleware)
```

### Streaming AI responses (SSE)
Both the campaign planning wizard and the AI chat use **Server-Sent Events** to stream tokens from Mistral as they arrive. The Axum handlers return `Sse<impl Stream>` using `async-stream`, and the frontend consumes the stream incrementally, updating the message bubble character-by-character.

### Task dependency graph
Tasks support arbitrary `depends_on` relationships stored in a `task_dependencies` join table. The backend computes `blocked_by_incomplete` per task on read. The frontend builds a **per-column tree** from the dependency graph — only root tasks (no in-column dependencies) are shown by default; clicking expands sub-tasks recursively. Dragging a task to Done is blocked client-side if `blocked_by_incomplete` is true.

### Role-based access (JWT + middleware)
Auth uses Argon2-hashed passwords and RS256-style JWT claims that include the user's role. The `require_admin` middleware extracts and validates claims from the `Authorization` header (with fallback to `?token=` query param for SSE connections that can't set headers).

### Optimistic UI with TanStack Query
All mutations (status change, assignee toggle, dependency edit) invalidate the relevant query key on success. Status changes from drag-and-drop call `updateTask.mutate` immediately so the board responds without waiting for the round-trip.

### Mobile drag-and-drop
Rather than making the entire card draggable (which conflicts with scroll and tap on touch screens), each card exposes a dedicated `GripVertical` handle with `touch-action: none`. The dnd-kit `PointerSensor` with a 5px distance constraint handles both mouse and touch inputs from that handle only.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Rust · Axum 0.8 · SQLx 0.8 · Tokio |
| Database | PostgreSQL 16 with SQLx migrations |
| AI | Mistral API · streaming SSE |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript |
| State | TanStack Query v5 · Zustand |
| UI | shadcn/ui (Base UI) · Tailwind CSS v4 · Lucide |
| Drag & Drop | @dnd-kit/core |
| Auth | Argon2 · JWT (jsonwebtoken) |

---

## Architecture

```
┌─────────────────────────────────┐
│           Next.js 14            │
│  App Router · TanStack Query    │
│  Zustand · shadcn/ui · dnd-kit  │
└────────────┬────────────────────┘
             │ REST + SSE  /api/v1
┌────────────▼────────────────────┐
│        Axum (Rust)              │
│  JWT middleware · Role guards   │
│  SQLx · async handlers          │
│  SSE streaming (Mistral)        │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│         PostgreSQL 16           │
│  users · campaigns · tasks      │
│  task_dependencies · assignees  │
│  chat_sessions · messages       │
└─────────────────────────────────┘
```

---

## Project Structure

```
ordo/
├── backend/
│   ├── src/
│   │   ├── auth/             # JWT encode/decode, Argon2, middleware layers
│   │   ├── campaigns/        # Campaign CRUD
│   │   ├── campaign_wizard/  # AI wizard — multi-turn planning + task generation
│   │   ├── tasks/            # Tasks, dependency graph, assignees
│   │   ├── calendar/         # Aggregated cross-campaign calendar endpoint
│   │   ├── chat/             # Persistent AI chat sessions, SSE message streaming
│   │   ├── users/            # User listing, role management
│   │   ├── wizard/           # Shared Mistral client (complete + stream_chat)
│   │   ├── config.rs         # Env-based config
│   │   ├── state.rs          # Shared AppState (db pool + AI client)
│   │   └── main.rs           # Router composition, middleware wiring
│   └── migrations/           # Ordered SQLx migrations
│
└── frontend/
    ├── app/
    │   ├── (auth)/           # Login · Register
    │   └── (app)/            # Protected routes (auth guard in layout)
    │       ├── campaigns/    # Campaign list + AI creation wizard
    │       ├── campaigns/[id]/
    │       │   ├── page.tsx       # Kanban board with nested task tree + DnD
    │       │   ├── assignees/     # Per-member task overview
    │       │   └── chat/          # AI chat with streaming responses
    │       ├── my-tasks/     # Personal kanban across all campaigns
    │       ├── calendar/     # react-big-calendar with controlled state
    │       └── settings/     # Admin: promote/demote member roles
    ├── components/
    │   ├── layout/Sidebar.tsx     # Responsive drawer (mobile) / static (desktop)
    │   └── tasks/TaskStatusBadge.tsx
    ├── hooks/                # useCampaigns · useTasks · useUsers · useRole
    └── lib/                  # api.ts · auth.ts · store.ts · sse.ts · theme.ts
```

---

## API Reference

All routes are prefixed `/api/v1`. Auth column: `—` = public, `user` = any authenticated user, `admin` = admin role required.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register; returns JWT + user |
| POST | `/auth/login` | — | Login; returns JWT + user |
| GET | `/auth/me` | user | Current user from token |
| GET | `/users` | user | List all users |
| PATCH | `/users/:id/role` | admin | Promote / demote user role |
| GET | `/campaigns` | user | List campaigns |
| POST | `/campaigns` | admin | Create campaign |
| GET | `/campaigns/:id` | user | Get campaign |
| PATCH | `/campaigns/:id` | admin | Update campaign |
| DELETE | `/campaigns/:id` | admin | Delete campaign |
| GET | `/campaigns/:id/tasks` | user | List tasks (with extras: assignees, deps, blocked flag) |
| POST | `/campaigns/:id/tasks` | admin | Create task |
| GET | `/tasks/:id` | user | Get task |
| PATCH | `/tasks/:id` | user* | Update task fields / status |
| DELETE | `/tasks/:id` | admin | Delete task |
| POST | `/tasks/:id/assignees` | admin | Add assignee |
| DELETE | `/tasks/:id/assignees/:uid` | admin | Remove assignee |
| POST | `/tasks/:id/dependencies` | admin | Add dependency |
| DELETE | `/tasks/:id/dependencies/:dep` | admin | Remove dependency |
| GET | `/me/tasks` | user | Tasks assigned to current user |
| GET | `/calendar` | user | All tasks with dates, grouped for calendar |
| GET | `/chat/sessions` | user | List chat sessions |
| POST | `/chat/sessions` | user | Create session |
| DELETE | `/chat/sessions/:id` | user | Delete session |
| GET | `/chat/sessions/:id/messages` | user | Message history |
| POST | `/chat/sessions/:id/message` | user | Send message → SSE stream |
| POST | `/campaign-wizard/start` | admin | Start AI planning session |
| POST | `/campaign-wizard/:id/message` | admin | Continue planning → SSE stream |
| POST | `/campaign-wizard/:id/generate` | admin | Generate tasks from session |

\* `PATCH /tasks/:id` is open to any assigned member for their own tasks; admins can update any task.

---

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (stable, edition 2024)
- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (PostgreSQL)
- A [Mistral API key](https://console.mistral.ai/)

### 1. Start the database

```bash
docker compose up -d
```

### 2. Backend

```bash
cp backend/.env.example backend/.env
# edit backend/.env — set DATABASE_URL, JWT_SECRET, MISTRAL_API_KEY
cd backend && cargo run
```

Migrations run automatically on startup via `sqlx::migrate!`. The server starts on `:4000`.

### 3. Frontend

```bash
cp frontend/.env.local.example frontend/.env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
cd frontend && npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register an account — the first user can be promoted to admin via the Settings page or directly in the database (`UPDATE users SET role = 'admin' WHERE email = '...'`).
