# Ordo

A campaign and task management platform with role-based access, AI-assisted campaign creation, and real-time chat. Built with a Rust/Axum backend and a Next.js 14 frontend.

## Features

- **Campaigns** — create and manage campaigns with full CRUD
- **Tasks** — per-campaign tasks with assignees, dependencies, priorities, and due dates
- **Task Families** — group related tasks under reusable family labels
- **Calendar** — unified calendar view across all campaigns and tasks
- **Campaign Wizard** — AI-driven (Mistral) multi-step wizard to generate a task plan from a brief
- **AI Chat** — persistent chat sessions powered by Mistral with campaign context
- **Role-based auth** — JWT auth with `assigner` and `member` roles; assigners can create/manage campaigns and tasks

## Stack

| Layer | Technology |
|---|---|
| Backend | Rust · Axum 0.8 · SQLx 0.8 · Tokio |
| Database | PostgreSQL 16 |
| AI | Mistral API (streaming SSE) |
| Frontend | Next.js 14 · React 18 · TypeScript |
| State | TanStack Query · Zustand |
| UI | shadcn/ui · Tailwind CSS · Lucide |
| DnD | @dnd-kit/core + sortable |
| Charts | Recharts |
| Forms | React Hook Form · Zod |

## Project Structure

```
ordo/
├── backend/                  # Rust API server
│   ├── src/
│   │   ├── auth/             # JWT auth, middleware, role guards
│   │   ├── campaigns/        # Campaign CRUD
│   │   ├── campaign_wizard/  # AI wizard handlers
│   │   ├── tasks/            # Task CRUD, assignees, dependencies
│   │   ├── families/         # Task family management
│   │   ├── calendar/         # Aggregated calendar endpoint
│   │   ├── chat/             # AI chat sessions + SSE streaming
│   │   ├── users/            # User listing
│   │   ├── wizard/           # Mistral client (shared AI logic)
│   │   ├── config.rs
│   │   ├── state.rs
│   │   └── main.rs
│   ├── migrations/           # SQLx migrations
│   ├── Cargo.toml
│   └── .env                  # Backend env vars (not committed)
├── frontend/                 # Next.js app
│   ├── app/
│   │   ├── (auth)/           # Login / register pages
│   │   └── (app)/            # Protected app routes
│   │       ├── dashboard/
│   │       ├── campaigns/
│   │       ├── calendar/
│   │       ├── my-tasks/
│   │       └── ...
│   ├── components/           # Feature components (tasks, chat, calendar, …)
│   ├── hooks/                # React Query hooks (useCampaigns, useTasks, …)
│   ├── lib/                  # API client, auth, SSE, Zustand store
│   ├── types/                # Shared TypeScript types
│   └── .env.local            # Frontend env vars (not committed)
└── docker-compose.yml        # PostgreSQL service
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (edition 2024)
- [Node.js](https://nodejs.org/) 20+
- [Docker](https://www.docker.com/) (for PostgreSQL)
- A [Mistral API key](https://console.mistral.ai/)

### 1. Start the database

```bash
docker compose up -d
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgres://campaign:campaign_secret@localhost:5432/campaign_manager
JWT_SECRET=your_jwt_secret_here
MISTRAL_API_KEY=your_mistral_api_key
PORT=4000
RUST_LOG=campaign_manager=debug,tower_http=debug
```

### 3. Run the backend

```bash
cd backend
cargo run
```

Migrations run automatically on startup via `sqlx::migrate!`.

### 4. Configure the frontend

```bash
cp frontend/.env.local.example frontend/.env.local
```

Edit `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API

All routes are prefixed with `/api/v1`.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | Register a new user |
| POST | `/auth/login` | — | Login, returns JWT |
| GET | `/auth/me` | user | Current user info |
| GET | `/campaigns` | user | List all campaigns |
| POST | `/campaigns` | assigner | Create a campaign |
| GET | `/campaigns/:id` | user | Get campaign |
| PATCH | `/campaigns/:id` | assigner | Update campaign |
| DELETE | `/campaigns/:id` | assigner | Delete campaign |
| GET | `/campaigns/:id/tasks` | user | List tasks for campaign |
| POST | `/campaigns/:id/tasks` | assigner | Create task |
| GET | `/tasks/:id` | user | Get task |
| PATCH | `/tasks/:id` | user | Update task (status, etc.) |
| DELETE | `/tasks/:id` | assigner | Delete task |
| POST | `/tasks/:id/assignees` | assigner | Add assignee |
| DELETE | `/tasks/:id/assignees/:uid` | assigner | Remove assignee |
| POST | `/tasks/:id/dependencies` | assigner | Add dependency |
| DELETE | `/tasks/:id/dependencies/:dep` | assigner | Remove dependency |
| GET | `/me/tasks` | user | Tasks assigned to current user |
| GET | `/users` | user | List all users |
| GET | `/calendar` | user | Aggregated calendar data |
| GET | `/chat/sessions` | user | List chat sessions |
| POST | `/chat/sessions` | user | Create chat session |
| DELETE | `/chat/sessions/:id` | user | Delete session |
| GET | `/chat/sessions/:id/messages` | user | List messages |
| POST | `/chat/sessions/:id/message` | user | Send message (SSE stream) |
| POST | `/campaign-wizard/start` | assigner | Start wizard session |
| POST | `/campaign-wizard/:id/message` | assigner | Wizard message (SSE stream) |
| POST | `/campaign-wizard/:id/generate` | assigner | Generate tasks from wizard |
