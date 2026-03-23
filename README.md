# DataRuler - AI-Powered Data Management Platform

A self-hosted, AI-powered data management and analytics platform. Upload any file type, get automatic processing, interactive dashboards, AI-generated reports, and chat with an AI assistant that understands your data.

**Cloud-only LLM inference** — no local GPU required. Uses Groq (free tier) or Ollama Cloud.

## Features

- **Universal File Upload** — Drag & drop any file: CSV, Excel, PDF, JSON, databases, images, audio, video, archives, and 100+ more formats
- **Automatic Processing** — Files are detected, parsed, profiled, and stored in the optimal database engine
- **Smart Dashboards** — Auto-generated charts and insights, plus a drag-and-drop dashboard builder with chart, KPI, table, and text widgets
- **AI-Powered Reports** — Generate professional reports from your data using 5 templates (Executive Summary, Data Deep-Dive, Monthly Report, Comparison Report, Quick Brief) with real data-driven analysis
- **AI Chat Assistant** — Full-page chat interface with rich content rendering: SQL syntax highlighting, comparative bar charts, metric highlighting, and conversation history
- **Multi-Agent Architecture** — 20 specialized AI agents with input/output contracts, execution metrics, dispatch timeouts, and dead letter tracking
- **File Manager** — Visual file browser with thumbnails, tags, search, and database/archive browsing
- **Notes System** — Markdown notes with auto-save, linked to files or standalone
- **Export** — Export dashboards and reports as JSON, export data as CSV, JSON, XLSX
- **Settings** — Profile management, AI model configuration, server-side storage monitoring, and bulk file reprocessing
- **Privacy First** — All data stays on your server. LLM calls go to free cloud APIs (Groq or Ollama Cloud)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, Radix UI |
| Charts | Apache ECharts |
| State | Zustand |
| Backend API | Next.js API Routes (BFF) + Python FastAPI (AI Service) |
| Database | SQLite (catalog + user data), DuckDB (OLAP analytics) |
| AI / LLM | Groq (free tier), Ollama Cloud |
| Embeddings | OpenAI-compatible embeddings (via Groq or Ollama Cloud) |
| Auth | JWT + bcrypt, cookie-based sessions |
| Deployment | Docker Compose, Oracle Cloud Always-Free Tier |

## Quick Start

```bash
git clone <repo-url>
cd data-ruler
cp .env.example .env
# Edit .env — add at least one API key (GROQ_API_KEY or OLLAMA_CLOUD_API_KEY)
docker compose up --build -d
```

Open http://localhost:3000 and create an account.

Get a free API key from [Groq](https://console.groq.com/keys) (recommended) or use an [Ollama Cloud](https://ollama.com/) API key.

## Deploy to Production (Free — $0, Oracle Cloud Always Free)

[Oracle Cloud](https://cloud.oracle.com) offers an **always-free** ARM VM with 4 CPUs, 24GB RAM, and 200GB disk — permanently, no time limit. You run Docker Compose on the VM with Caddy for automatic HTTPS.

**Step 1 — Create a free Oracle Cloud account**

Go to [cloud.oracle.com/free](https://www.oracle.com/cloud/free/) and sign up. A credit card is required for identity verification but **you will not be charged** — the Always Free tier is permanent and separate from any trial credits.

**Step 2 — Create an Always Free VM**

1. In the Oracle Cloud Console, go to **Compute → Instances → Create Instance**
2. Configure:
   - **Image:** Ubuntu 22.04 (or Oracle Linux)
   - **Shape:** Click "Change Shape" → **Ampere** → **VM.Standard.A1.Flex** → 4 OCPUs, 24GB RAM
   - **Networking:** Ensure "Assign a public IPv4 address" is checked
   - **SSH key:** Upload your public key or let Oracle generate one (download it)
3. Click **Create** and wait for the instance to be "Running"
4. Copy the **Public IP address** from the instance details page

**Step 3 — Open firewall ports**

In Oracle Cloud Console:

1. Go to **Networking → Virtual Cloud Networks** → click your VCN → **Security Lists** → **Default Security List**
2. Click **Add Ingress Rules** and add:
   - **Source CIDR:** `0.0.0.0/0`, **Destination Port:** `80`, Protocol: TCP
   - **Source CIDR:** `0.0.0.0/0`, **Destination Port:** `443`, Protocol: TCP

**Step 4 — Set up the VM**

SSH into the VM and run the setup script:

```bash
ssh ubuntu@<your-public-ip>
git clone <your-repo-url> data-ruler
cd data-ruler
./setup-oracle.sh
```

This installs Docker, opens OS-level firewall ports (80, 443), and prints next steps. You may need to log out and back in after install for Docker group changes.

**Step 5 — Configure environment**

```bash
cp .env.example .env
nano .env
```

Set these values:

```env
NEXTAUTH_SECRET=<run: openssl rand -base64 32>
NEXTAUTH_URL=https://yourdomain.com
AI_SERVICE_URL=http://ai-service:8000
DOMAIN=yourdomain.com
GROQ_API_KEY=gsk_your_key_here        # or OLLAMA_CLOUD_API_KEY
```

**Step 6 — Configure HTTPS**

Edit the `Caddyfile` in the project root — replace `your-domain.com` with your actual domain:

```
yourdomain.com {
    reverse_proxy web:3000
}
```

> **No custom domain?** Use a free subdomain from [DuckDNS](https://www.duckdns.org) — point it to your Oracle VM's IP and use that in the Caddyfile and `.env`.

**Step 7 — Deploy**

```bash
./deploy.sh
```

The deploy script auto-detects production mode when `DOMAIN` is set in `.env` and uses Caddy for HTTPS.

Your app is live at `https://yourdomain.com` with 24GB RAM, persistent storage, and no usage limits.

> **What you get for free, forever:** 4 ARM CPUs, 24GB RAM, 200GB boot volume, 10TB/month outbound data. No sleep, no cold starts, no time limits.

## Environment Variables

```bash
# Required: at least ONE cloud LLM API key
GROQ_API_KEY=gsk_...                  # Groq (recommended, fastest)
OLLAMA_CLOUD_API_KEY=...               # Ollama Cloud (remote Ollama instance)

# Optional: model overrides
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_FAST_MODEL=llama-3.1-8b-instant
OLLAMA_CLOUD_BASE_URL=https://ollama.com/v1
# Ollama Cloud model is locked to gemini-3-flash-preview (not configurable)

# Auth
NEXTAUTH_SECRET=your-secret-key-here

# Service URLs
AI_SERVICE_URL=http://localhost:8000

# Production (Oracle Cloud)
DOMAIN=your-domain.com
```

See `.env.example` for all options.

## Pages & UI

The UI follows a dark navy design system with emerald green accents, purple highlights, and a polished data-centric aesthetic. Full RTL support for Hebrew.

### Login (`/login`)

Centered authentication card on dark navy background. Email + password form with emerald accent buttons and link to registration. Language switcher in top corner.

![Login Page](docs/screenshots/01-login.png)

### Register (`/register`)

Account creation form with display name, email, password (8+ chars). Matches the login design with language switcher.

![Register Page](docs/screenshots/02-register.png)

### Files (`/files`)

Project Files page with breadcrumb navigation (Repository / Main Files), list/grid view toggle, and Quantum Upload Gateway drop zone. File table features colored category badges (Behavioral, Spatial, Financial), quality score bars with percentages, status dots (Processed/Processing/Failed/Queued), and pagination. Toolbar includes Select All, Bulk Download, Filters, and Sort controls.

![Files](docs/screenshots/03-files-list.png)

### Dashboards (`/dashboards`)

Dashboard overview with stats cards (Total Visuals with trend, Active Streams with live indicator, System Performance with AI Core Utilization bar chart). Filter tabs (All Types, Recently Updated, Shared). Dashboard cards show mini chart previews, visibility badges (Public/Private/Internal), widget counts, and update timestamps. Includes "Create New View" card with pagination.

![Dashboards](docs/screenshots/04-dashboards.png)

### AI Chat (`/chat`)

Full-page AI Chat Assistant with Recent Insights panel showing conversation history. Chat supports rich content rendering: highlighted metrics in emerald green, SQL code blocks with PostgreSQL syntax highlighting, comparative bar charts (Revenue Growth by Category with Q3 vs Q4), and action buttons (Helpful, Regenerate). Input bar with attachment, microphone, and send controls. Footer shows "AI-Powered Insights / Verified Data Models".

![AI Chat](docs/screenshots/13-ai-chat.png)

### Notes (`/notes`)

Notes Explorer sidebar with synced status badges and file association icons. Editor features auto-save indicator, formatting toolbar (Bold, Italic, List, Code), Linked Assets section, and Preview mode. Bottom stats show Sentiment Shift and Tokens Processed metrics.

![Notes](docs/screenshots/05-notes.png)

### Reports (`/reports`)

Report management with 5 template cards for quick creation. Report cards show template icon, status badge (Draft/Generating/Ready/Error), and metadata. Search and filter by status.

![Reports](docs/screenshots/06-reports.png)

#### Executive Summary Report

"Report Active / Live Stream Connected" status badges. Schema Structure Analysis table with Dataset ID, Columns, Rows, Storage Size, and Health bars. Volume Allocation visualization with Total Payload and Peak Flow metrics. Anomaly Detection alerts with priority levels (High/Medium/Cleared). Cross-Dataset Correlation coefficient matrix. Advanced Curatorial Insight narrative with Index Health and Risk Score cards.

![Executive Summary Report](docs/screenshots/08-report-executive-summary.png)

#### Data Deep-Dive Report

Comprehensive technical breakdown with schema analysis, volume allocation distribution chart, anomaly detection (Skewed Distribution, Missing Entry Pattern, Outlier Resolved), and cross-dataset Pearson correlation matrix heatmap.

![Data Deep-Dive Report](docs/screenshots/09-report-data-deep-dive.png)

#### Monthly Report

Processing pipeline stats (Ingested, Processed, Errors, Pending), category breakdown table, quality trends, and activity timeline.

![Monthly Report](docs/screenshots/10-report-monthly.png)

#### Comparison Report

Dataset Divergence Analysis with Similarity Score badge. Side-by-side comparison table: Attribute column with File A vs File B showing Format, Category, Size (with Rank badges), Structure (Rows/Columns), Data Quality (Completeness + Consistency bars), and Status (Production Ready / Needs Sanitization). Statistical Difference Analysis cards (Schema Mismatch, Unique Entity Analysis, Outlier Detection, Temporal Drift). Performance Rankings with Quality Leader and Efficiency Score.

![Comparison Report](docs/screenshots/11-report-comparison.png)

#### Quick Brief Report

Dataset Snapshot with Live Analysis indicator. File metadata card (Format, Total Size, Rows, Cols) alongside a quality ring chart (88%). Metric cards: Integrity (Optimal), Velocity (14.2ms), Outliers (3.1%). AI-Generated Insights with "New Insights Available" badge. Side cards: Ingest Trend bar chart, Top Performing Column, and "Automate Clean?" CTA with Apply Fixes button.

![Quick Brief Report](docs/screenshots/12-report-quick-brief.png)

### Settings (`/settings`)

Profile management, dark/light theme toggle, language selector (English/Hebrew with RTL), AI model configuration, server-side storage usage with progress bar, cache clearing, and bulk file reprocessing.

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

DataRuler uses 20 specialized AI agents coordinated by an LLM-powered orchestrator. This section explains how they work together.

### Request Lifecycle

All requests — including chat — flow through the orchestrator pipeline. The orchestrator determines intent, builds an execution plan, dispatches agents in parallel groups with session context, and synthesizes results via LLM.

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
│   Orchestrator    │────▶│  Cloud LLM (Groq)│  temperature=0.1
│   Agent           │◄────│  json_mode=true  │  max_tokens=512
└────────┬─────────┘     └──────────────────┘
         │
         │  Session context (ContextStore)
         │  + Execution plan JSON:
         │  { intent, confidence, plan: [{agent, parallel_group}], reasoning }
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

### Agent Communication Protocol

All inter-agent communication uses the `AgentMessage` envelope:

```python
AgentMessage:
  message_id:     UUID        # Unique message identifier
  correlation_id: UUID        # Tracks request/reply chains
  type:           REQUEST | RESPONSE | ERROR | STATUS
  source_agent:   str         # Sender agent name
  target_agent:   str         # Recipient agent name
  priority:       LOW(0) | NORMAL(1) | HIGH(2) | CRITICAL(3)
  payload:        dict        # Arbitrary data (input params, results, errors)
  ttl:            int         # Time-to-live in seconds
  created_at:     datetime    # Timestamp
```

### Agent Contracts

Each agent declares an `AgentContract` specifying its required/optional inputs and guaranteed output keys. The base class validates contracts at dispatch time, returning clear error messages when required inputs are missing.

```python
AgentContract:
  required_inputs: tuple[str, ...]   # Keys the agent expects in the payload
  optional_inputs: tuple[str, ...]   # Keys the agent can use but doesn't require
  output_keys:     tuple[str, ...]   # Keys guaranteed in the response on success
```

### Message Bus

The message bus provides async pub/sub with priority-based dispatch:

- **Target-based routing** — Messages routed to `target_agent` via registered subscriber callbacks
- **Priority queue** — `asyncio.PriorityQueue` dequeues highest-priority messages first
- **Request/reply** — `correlation_id` maps to `asyncio.Future` for blocking await with timeout (default 30s)
- **Fan-out** — Multiple subscribers can register for the same agent (all receive the message)
- **TTL enforcement** — Messages past their TTL are moved to the dead letter queue instead of being delivered
- **Dead letter queue** — Undeliverable and expired messages are captured with reason codes for operational visibility (`GET /api/agents/bus-stats`)

### Orchestrator Decision Logic

The orchestrator has two paths for deciding which agents to invoke:

**Path A — LLM Intent Parsing** (primary):
1. Constructs prompt with user message + file context + schema context + session state
2. Calls LLM with `json_mode=True`, `temperature=0.1` (deterministic)
3. Returns structured JSON plan

**Path B — Keyword Fallback** (when LLM parsing fails):

| Keywords | Intent | Agents |
|----------|--------|--------|
| `query`, `select`, `sql`, `count`, `average` | query_data | sql_agent |
| `chart`, `plot`, `graph`, `visualize` | visualize | analytics → visualization |
| `analyze`, `statistics`, `profile` | analyze_data | schema_inference + analytics → visualization |
| `export`, `download`, `save as` | export | export_agent |
| `relationship`, `foreign key`, `join` | find_relationships | relationship_mining |
| `upload`, `process`, `import` | process_file | validation + detection → schema → storage |
| _(anything else)_ | general_chat | document_qa |

### Parallel Execution Engine

Groups execute **sequentially** (group 0 finishes before group 1 starts). Steps **within** a group run **concurrently** via `asyncio.gather`. Failed agents within a parallel group do not block other agents in the same group.

### Circuit Breaker

Per-agent fault tolerance prevents cascading failures:

```
    CLOSED (normal operation)
        │
        │ failure_count >= 5 (within 10-min window)
        ▼
      OPEN (all calls rejected immediately)
        │
        │ 60 seconds elapsed
        ▼
    HALF_OPEN (allow exactly 1 probe request)
       ╱ ╲
  success   failure
     │         │
     ▼         ▼
   CLOSED     OPEN
```

- **Threshold**: 5 failures within a 10-minute rolling window
- **Recovery timeout**: 60 seconds before probing

### Token Budget Manager

Two-level budget model prevents runaway LLM costs:

- **Global Budget**: 2,000,000 tokens/hour (all agents combined)
- **Per-Agent Budget**: 400,000 tokens/hour each
- **Rolling window**: 1-hour sliding window with lazy pruning
- **Pre-check**: `has_budget(agent_name)` called before dispatch — if exhausted, agent is skipped

### Context Store

Per-session shared state enables agents to collaborate without direct coupling:

- **Table Registry** — Agents register imported tables with schema info
- **Relationship Graph** — Discovered foreign keys with confidence scores
- **File Catalog** — Shared file metadata accessible to all agents
- **Cache** — Arbitrary key-value store for intermediate results

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
├── scripts/                        # Utility scripts (screenshot generation)
├── Caddyfile                       # Caddy reverse proxy (HTTPS, production)
├── docker-compose.yml              # Docker Compose (base, local dev + production)
├── docker-compose.prod.yml         # Production overlay (adds Caddy for HTTPS)
├── deploy.sh                       # Deploy with auto-detect dev/prod mode
├── setup-oracle.sh                 # Oracle Cloud VM initial setup
├── start.sh                        # Local startup (no Docker)
└── .env.example                    # Configuration template
```

## License

See LICENSE file.
