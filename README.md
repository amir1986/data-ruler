# DataRuler - AI-Powered Data Management Platform

A self-hosted, AI-powered data management and analytics platform. Upload any file type, get automatic processing, interactive dashboards, AI-generated reports, and chat with an AI assistant that understands your data.

Deployed on **Oracle Cloud Always-Free Tier** — 4 ARM CPUs, 24GB RAM, 200GB disk, forever free. Uses **Ollama Cloud** for AI inference — no local GPU required.

## Features

- **Universal File Upload** — Drag & drop any file: CSV, Excel, PDF, JSON, databases, images, audio, video, archives, and 100+ more formats
- **Automatic Processing** — Files are detected, parsed, profiled, and stored in the optimal database engine
- **Smart Dashboards** — Auto-generated charts and insights, plus a drag-and-drop dashboard builder with chart, KPI, table, and text widgets
- **AI-Powered Reports** — Generate professional reports from your data using 5 templates (Executive Summary, Data Deep-Dive, Monthly Report, Comparison Report, Quick Brief)
- **AI Chat Assistant** — Full-page chat interface with rich content rendering: SQL syntax highlighting, comparative bar charts, metric highlighting, and conversation history
- **Multi-Agent Architecture** — 20 specialized AI agents with input/output contracts, execution metrics, dispatch timeouts, and dead letter tracking
- **File Manager** — Visual file browser with thumbnails, tags, search, and database/archive browsing
- **Notes System** — Markdown notes with auto-save, linked to files or standalone
- **Export** — Export dashboards and reports as JSON, export data as CSV, JSON, XLSX
- **Settings** — Profile management, AI model configuration, server-side storage monitoring, and bulk file reprocessing
- **Privacy First** — All data stays on your server. LLM calls go to Ollama Cloud

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, Radix UI |
| Charts | Apache ECharts |
| State | Zustand |
| Backend API | Next.js API Routes (BFF) + Python FastAPI (AI Service) |
| Database | SQLite (catalog + user data), DuckDB (OLAP analytics) |
| AI / LLM | Ollama Cloud (gemini-3-flash-preview) |
| Auth | JWT + bcrypt, cookie-based sessions |
| Deployment | Docker Compose, Oracle Cloud Always-Free Tier, Caddy (HTTPS) |

## Quick Start (Local)

```bash
git clone <repo-url>
cd data-ruler
cp .env.example .env
# Edit .env — add your Ollama Cloud API key
nano .env
docker compose up --build -d
```

Open http://localhost:3000 and create an account.

## Deploy to Oracle Cloud Always-Free Tier ($0 Forever)

Oracle Cloud offers an **always-free** ARM VM with 4 CPUs, 24GB RAM, and 200GB disk — permanently, no time limit. You run Docker Compose on the VM with Caddy for automatic HTTPS.

### Step 1 — Create a free Oracle Cloud account

Go to [cloud.oracle.com/free](https://www.oracle.com/cloud/free/) and sign up. A credit card is required for identity verification but **you will not be charged** — the Always Free tier is permanent and separate from any trial credits.

### Step 2 — Create an Always Free VM

1. In the Oracle Cloud Console, go to **Compute → Instances → Create Instance**
2. Configure:
   - **Image:** Ubuntu 22.04 (or Oracle Linux)
   - **Shape:** Click "Change Shape" → **Ampere** → **VM.Standard.A1.Flex** → 4 OCPUs, 24GB RAM
   - **Networking:** Ensure "Assign a public IPv4 address" is checked
   - **SSH key:** Upload your public key or let Oracle generate one (download it)
3. Click **Create** and wait for the instance to be "Running"
4. Copy the **Public IP address** from the instance details page

### Step 3 — Open firewall ports

In Oracle Cloud Console:

1. Go to **Networking → Virtual Cloud Networks** → click your VCN → **Security Lists** → **Default Security List**
2. Click **Add Ingress Rules** and add:
   - **Source CIDR:** `0.0.0.0/0`, **Destination Port:** `80`, Protocol: TCP
   - **Source CIDR:** `0.0.0.0/0`, **Destination Port:** `443`, Protocol: TCP

### Step 4 — SSH into the VM and run setup

```bash
ssh ubuntu@<your-public-ip>

# Clone the repo
git clone <your-repo-url> data-ruler
cd data-ruler

# Run the setup script (installs Docker, opens OS firewall)
chmod +x setup-oracle.sh
./setup-oracle.sh
```

> After setup, log out and back in so Docker group permissions take effect:
> ```bash
> exit
> ssh ubuntu@<your-public-ip>
> cd data-ruler
> ```

### Step 5 — Configure environment

```bash
nano .env
```

Set these values:

```env
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=https://yourdomain.com
OLLAMA_CLOUD_API_KEY=your-ollama-cloud-key
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
DOMAIN=yourdomain.com
```

> **No custom domain?** Get a free subdomain from [DuckDNS](https://www.duckdns.org) — point it to your Oracle VM's IP and use that as `DOMAIN`.

### Step 6 — Set your domain in the Caddyfile

The `Caddyfile` uses the `DOMAIN` env var from `.env` automatically. No manual edit needed.

### Step 7 — Deploy

```bash
./deploy.sh prod
```

Your app is live at `https://yourdomain.com` with automatic HTTPS, 24GB RAM, persistent storage, and no usage limits.

### What you get for free, forever

| Resource | Amount |
|----------|--------|
| CPUs | 4 ARM (Ampere A1) |
| RAM | 24 GB |
| Boot Volume | 200 GB |
| Outbound Data | 10 TB/month |
| Sleep/Cold Starts | None — always running |
| Time Limit | None — permanent |

## Environment Variables

```bash
# Auth
NEXTAUTH_SECRET=your-secret-key-here
NEXTAUTH_URL=http://localhost:3000

# Service URLs
AI_SERVICE_URL=http://localhost:8000

# Ollama Cloud (AI model provider)
# Model is locked to gemini-3-flash-preview
OLLAMA_CLOUD_API_KEY=your-key
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1

# LLM settings
LLM_TIMEOUT=120

# Production domain (used by Caddy for HTTPS)
DOMAIN=localhost

# Storage paths
DATABASE_PATH=./data/databases
UPLOAD_PATH=./data/uploads
VECTOR_PATH=./data/vectors
THUMBNAIL_PATH=./data/thumbnails
TRANSCRIPTION_PATH=./data/transcriptions
EXPORT_PATH=./data/exports
```

See `.env.example` for the full template.

## Pages & UI

The UI follows a dark navy design system with emerald green accents, purple highlights, and a polished data-centric aesthetic. Full RTL support for Hebrew.

### Login (`/login`)

Centered authentication card on dark navy background. Email + password form with emerald accent buttons and link to registration. Language switcher in top corner.

![Login Page](docs/screenshots/01-login.png)

### Register (`/register`)

Account creation form with display name, email, password (8+ chars). Matches the login design with language switcher.

![Register Page](docs/screenshots/02-register.png)

### Files (`/files`)

Project Files page with breadcrumb navigation, list/grid view toggle, and Quantum Upload Gateway drop zone. File table features colored category badges, quality score bars with percentages, status dots, and pagination.

![Files](docs/screenshots/03-files-list.png)

### Dashboards (`/dashboards`)

Dashboard overview with stats cards, filter tabs, and dashboard cards showing mini chart previews, visibility badges, widget counts, and update timestamps.

![Dashboards](docs/screenshots/04-dashboards.png)

### AI Chat (`/chat`)

Full-page AI Chat Assistant with conversation history. Chat supports rich content rendering: highlighted metrics, SQL code blocks, comparative bar charts, and action buttons.

![AI Chat](docs/screenshots/13-ai-chat.png)

### Notes (`/notes`)

Notes Explorer with synced status badges and file association icons. Editor features auto-save, formatting toolbar, Linked Assets, and Preview mode.

![Notes](docs/screenshots/05-notes.png)

### Reports (`/reports`)

Report management with 5 template cards. Report cards show template icon, status badge, and metadata.

![Reports](docs/screenshots/06-reports.png)

### Settings (`/settings`)

Profile management, dark/light theme toggle, language selector (English/Hebrew with RTL), AI model configuration, storage monitoring, and bulk file reprocessing.

![Settings](docs/screenshots/07-settings.png)

## API Contracts

### REST API — AI Service (FastAPI, port 8000)

#### Health & Status
```
GET  /health                     → System health, cloud LLM status, agent count
GET  /api/health                 → Same (alias)
```

#### Chat (Streaming SSE)
```
POST /api/chat/chat              → Stream AI chat response via orchestrator pipeline
     Body: { message, user_id, context_file_id?, context_id?, conversation_history[] }
     Response: SSE stream of { content, intent?, context_id? } chunks
```

#### File Processing Pipeline
```
POST /api/files/process          → Trigger async file processing
     Body: { file_id, user_id, file_path, original_name }
GET  /api/files/status/{file_id} → Get processing status
```

#### Agent Management & Observability
```
GET  /api/agents/                → List all agents with status and execution metrics
GET  /api/agents/metrics         → Aggregated metrics for all agents
GET  /api/agents/bus-stats       → Message bus stats + recent dead letters
GET  /api/agents/{name}          → Agent detail (contract, circuit state, token budget, metrics)
POST /api/agents/reset-circuit   → Reset circuit breaker for agent
```

#### Orchestration Pipelines
```
POST /api/pipelines/orchestrate  → Full LLM-powered orchestration
     Body: { message, user_id, file_id?, schema_context?, action? }
POST /api/pipelines/query        → Natural language → SQL query
     Body: { query, user_id, schema_context? }
POST /api/pipelines/analyze      → Run analytics pipeline
POST /api/pipelines/visualize    → Generate ECharts visualization
```

### REST API — Web BFF (Next.js, port 3000)

#### Auth
```
POST /api/auth/register          → Create account
POST /api/auth/login             → Login (sets auth-token cookie)
POST /api/auth/logout            → Logout
GET  /api/auth/me                → Current user
PUT  /api/auth/profile           → Update user profile (display name)
```

#### Files
```
GET    /api/files                → List user files (paginated, filterable)
POST   /api/files/upload         → Upload files (multipart)
GET    /api/files/{id}           → File details
PATCH  /api/files/{id}           → Update file metadata
DELETE /api/files/{id}           → Delete file
GET    /api/files/{id}/preview   → Preview file data
GET    /api/files/{id}/profile   → Data quality profile
```

#### Chat
```
POST /api/chat/message           → Send message (proxies to AI service, SSE)
GET  /api/chat/history           → Chat history
```

#### Dashboards
```
GET    /api/dashboards           → List dashboards
POST   /api/dashboards           → Create dashboard
GET    /api/dashboards/{id}      → Get dashboard with widgets
PUT    /api/dashboards/{id}      → Update dashboard
DELETE /api/dashboards/{id}      → Delete dashboard
```

#### Reports
```
GET    /api/reports              → List reports
POST   /api/reports              → Create report
GET    /api/reports/{id}         → Get report with content
PUT    /api/reports/{id}         → Update report
DELETE /api/reports/{id}         → Delete report
POST   /api/reports/{id}/generate → Generate report content from file data
```

#### Notes
```
GET    /api/notes                → List notes
POST   /api/notes                → Create note
GET    /api/notes/{id}           → Get note
PUT    /api/notes/{id}           → Update note
DELETE /api/notes/{id}           → Delete note
```

#### Settings & Processing
```
GET  /api/settings/storage       → Server-side storage usage metrics
POST /api/processing/reprocess   → Queue all files for reprocessing
GET  /api/processing/queue       → Processing task queue status
POST /api/data/query             → Execute SQL against user data
POST /api/export/data            → Export data in various formats
```

## Database Schema

### Catalog Database (catalog.db)

```sql
-- Users table
users (id, email, password_hash, display_name, settings, created_at)

-- File registry with full metadata
files (id, user_id, original_name, stored_path, file_type, file_category,
       mime_type, size_bytes, content_hash, storage_backend, db_table_name,
       schema_snapshot, row_count, column_count, processing_status,
       quality_profile, quality_score, ai_summary, tags, created_at)

-- Imported table registry
imported_tables (id, file_id, table_name, schema_snapshot, row_count)

-- Cross-file relationships
file_relationships (id, file_id_a, file_id_b, relationship_type,
                    column_a, column_b, confidence, confirmed_by_user)

-- Dashboards with widget configs
dashboards (id, user_id, title, description, layout, widgets, is_auto_generated)

-- AI-generated reports
reports (id, user_id, title, description, template, status, file_ids, content, config)

-- Markdown notes
notes (id, user_id, file_id, title, content, content_format)

-- Chat history
chat_messages (id, user_id, role, content, context_file_id, metadata)

-- Processing task queue
processing_tasks (id, user_id, file_id, task_type, status, agent_name, result)

-- Agent performance logs
agent_logs (id, agent_name, task_type, latency_ms, token_count, success)
```

### User Data Database (per-user, {user_id}/user_data.db)

Each uploaded tabular file gets its own table: `file_{file_id}` with all columns stored as TEXT for maximum compatibility. Schema inference metadata is stored in the catalog.

## Multi-Agent Architecture

DataRuler uses 20 specialized AI agents coordinated by an LLM-powered orchestrator.

### Request Lifecycle

```
HTTP Request (user message, file upload, query)
     │
     ▼
┌──────────────────┐
│  FastAPI Router   │  /api/chat, /api/files/process, /api/pipelines/*
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│   Orchestrator    │────▶│  Ollama Cloud    │  temperature=0.1
│   Agent           │◄────│  json_mode=true  │  max_tokens=512
└────────┬─────────┘     └──────────────────┘
         │
         │  Session context (ContextStore)
         │  + Execution plan JSON
         │
         ▼
┌──────────────────────────────────────────────────────┐
│  Parallel Execution Engine (with dispatch timeouts)   │
│                                                       │
│  Group 0 ──▶ [validation_security] ──────────────────│──▶ accumulate context
│  Group 1 ──▶ [file_detection, schema_inference]  ────│──▶ accumulate context
│  Group 2 ──▶ [analytics, visualization]  ────────────│──▶ accumulate context
│  Group 3 ──▶ [storage_router]  ──────────────────────│──▶ accumulate context
│                                                       │
│  Groups run sequentially (0→1→2→3)                    │
│  Steps WITHIN a group run concurrently (asyncio.gather)│
│  Failed agents don't block other agents in the group  │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Result Synthesis │  LLM combines all agent outputs into final response
└────────┬─────────┘
         │
         ▼
    HTTP Response (streamed SSE or JSON)
```

### 20 Specialized Agents

| Agent | Purpose | Uses LLM? |
|-------|---------|-----------|
| **orchestrator** | LLM-powered intent parsing, execution planning | Yes |
| **file_detection** | Magic bytes + extension-based file type detection | No |
| **tabular_processor** | CSV, XLSX, Parquet, TSV, ODS parsing + import | No |
| **document_processor** | PDF, DOCX, PPTX, TXT, HTML text extraction | No |
| **database_importer** | SQLite, DuckDB, SQL dump importing | No |
| **media_processor** | Image metadata, thumbnails, audio/video info | No |
| **archive_processor** | ZIP, TAR, GZIP extraction (safe, with limits) | No |
| **structured_data** | JSON, XML, YAML, TOML, INI parsing + flattening | No |
| **specialized_format** | GeoJSON, Shapefile, HDF5, NetCDF processing | No |
| **schema_inference** | Column type inference + data quality scoring | Yes |
| **relationship_mining** | Foreign key + joinable column discovery | Yes |
| **storage_router** | Route data to SQLite/DuckDB/filesystem | No |
| **analytics** | Statistical analysis + anomaly detection | Yes |
| **visualization** | ECharts config generation from data | Yes |
| **sql_agent** | Natural language → SQL generation + execution | Yes |
| **document_qa** | RAG-based Q&A over extracted document text | Yes |
| **cross_modal** | Cross-format queries spanning multiple files | Yes |
| **export_agent** | Data export (CSV, JSON, XLSX, Markdown) | No |
| **validation_security** | File security validation + integrity hashing | No |
| **scheduler** | Recurring task execution with background asyncio loops | No |

## Project Structure

```
data-ruler/
├── apps/
│   ├── web/                        # Next.js frontend + BFF API
│   │   ├── app/                    # Pages (auth, dashboard, files, notes, reports, chat, settings)
│   │   ├── app/api/                # 30+ API routes
│   │   ├── components/             # 30+ UI components (shadcn/ui based)
│   │   ├── stores/                 # 6 Zustand stores (auth, chat, files, dashboard, notes, reports)
│   │   └── lib/                    # DB, auth, utils
│   │
│   └── ai-service/                 # Python FastAPI AI backend
│       ├── agents/                 # 20 specialized AI agents
│       ├── core/                   # Agent base, message bus, circuit breaker, token budget, registry
│       ├── services/               # Cloud LLM client, embeddings, RAG, parsers, storage backends
│       ├── routers/                # 5 API routers (health, chat, files, agents, pipelines)
│       └── models/                 # Pydantic schemas (15+ models)
│
├── data/                           # Runtime data (gitignored)
├── Caddyfile                       # Caddy reverse proxy config (HTTPS)
├── docker-compose.yml              # Docker Compose (local + base)
├── docker-compose.prod.yml         # Production override (adds Caddy HTTPS)
├── deploy.sh                       # Deploy script (local or prod)
├── setup-oracle.sh                 # Oracle Cloud VM one-time setup
├── start.sh                        # Local startup (no Docker)
└── .env.example                    # Configuration template
```

## License

See LICENSE file.
