# DataRuler - AI-Powered Data Management Platform

A self-hosted, zero-cost, AI-powered data management and analytics platform. Upload any file type, get automatic processing, interactive dashboards, and chat with an AI assistant that understands your data.

**Cloud-only LLM inference** — no local GPU required. Uses free-tier cloud APIs (Groq, OpenRouter, HuggingFace).

## Features

- **Universal File Upload** — Drag & drop any file: CSV, Excel, PDF, JSON, databases, images, audio, video, archives, and 100+ more formats
- **Automatic Processing** — Files are detected, parsed, profiled, and stored in the optimal database engine
- **Smart Dashboards** — Auto-generated charts and insights, plus a drag-and-drop dashboard builder
- **AI Chat Assistant** — Ask questions about your data in natural language; get SQL queries, charts, and answers
- **Multi-Agent Architecture** — 20 specialized AI agents with input/output contracts, execution metrics, dispatch timeouts, and dead letter tracking
- **File Manager** — Visual file browser with thumbnails, tags, search, and database/archive browsing
- **Notes System** — Markdown notes with auto-save, linked to files or standalone
- **Export** — Export data as CSV, JSON, XLSX, Markdown
- **Privacy First** — All data stays on your server. LLM calls go to free cloud APIs (Groq/OpenRouter/HuggingFace)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, Radix UI |
| Charts | Apache ECharts |
| State | Zustand |
| Backend API | Next.js API Routes (BFF) + Python FastAPI (AI Service) |
| Database | SQLite (catalog + user data), DuckDB (OLAP analytics) |
| AI / LLM | Groq (free), OpenRouter (free), HuggingFace Inference API (free) |
| Embeddings | HuggingFace sentence-transformers |
| Auth | JWT + bcrypt, cookie-based sessions |
| Deployment | Docker Compose |

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- At least ONE free API key (see below)

### Get a Free API Key (pick one)

| Provider | Free Tier | Sign Up |
|----------|-----------|---------|
| **Groq** (recommended) | 14,400 req/day, 70B models | https://console.groq.com/keys |
| **OpenRouter** | Free models (Llama 3.3 70B) | https://openrouter.ai/keys |
| **HuggingFace** | Free inference API | https://huggingface.co/settings/tokens |

### One-Command Start

```bash
# 1. Clone and configure
git clone <repo-url>
cd data-ruler
cp .env.example .env
# Edit .env — add your API key (GROQ_API_KEY, OPENROUTER_API_KEY, or HF_API_TOKEN)

# 2. Start everything
./start.sh
```

### Manual Setup

```bash
# Backend (AI Service)
cd apps/ai-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (new terminal)
cd apps/web
npm install --legacy-peer-deps
npm run dev
```

### Docker

```bash
cp .env.example .env
# Edit .env with your API key
docker compose up --build -d
```

Open http://localhost:3000 and create an account.

## Environment Variables

```bash
# Required: at least ONE cloud LLM API key
GROQ_API_KEY=gsk_...          # Groq (recommended, fastest)
OPENROUTER_API_KEY=sk-or-...   # OpenRouter (most models)
HF_API_TOKEN=hf_...            # HuggingFace (embeddings + chat)

# Optional: model overrides
GROQ_CHAT_MODEL=llama-3.3-70b-versatile
GROQ_FAST_MODEL=llama-3.1-8b-instant
OPENROUTER_CHAT_MODEL=meta-llama/llama-3.3-70b-instruct:free

# Auth
NEXTAUTH_SECRET=your-secret-key-here

# Service URLs
AI_SERVICE_URL=http://localhost:8000
```

See `.env.example` for all options.

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
```

#### Files
```
GET    /api/files                → List user files
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

#### Data Query
```
POST /api/data/query             → Execute SQL against user data
POST /api/export/data            → Export data in various formats
```

#### Notes
```
GET    /api/notes                → List notes
POST   /api/notes                → Create note
GET    /api/notes/{id}           → Get note
PUT    /api/notes/{id}           → Update note
DELETE /api/notes/{id}           → Delete note
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

## Agent Orchestration Architecture

```
User Request (Chat / Pipeline API)
     │
     ▼
┌─────────────┐     LLM-powered intent       ┌──────────────────┐
│ Orchestrator │────parsing + plan────────────▶│ Cloud LLM (Groq) │
│   Agent      │◄───execution plan JSON───────│                  │
└──────┬──────┘                               └──────────────────┘
       │
       │  Session context (ContextStore)
       │  + Execution Plan (parallel groups)
       │
       ├── Group 0 (parallel) ──┬── validation_security
       │                        └── file_detection
       │
       ├── Group 1 (sequential) ── tabular_processor / document_processor
       │
       ├── Group 2 (parallel) ──┬── schema_inference
       │                        └── analytics
       │
       └── Group 3 (sequential) ── visualization / storage_router
       │
       ▼
  Result Synthesis (LLM summarizes agent results)
       │
       ▼
  Streamed response to client (SSE)
```

All requests — including chat — flow through the orchestrator pipeline. The orchestrator determines intent, builds an execution plan, dispatches agents in parallel groups, and synthesizes results via LLM.

### 20 Specialized Agents

Each agent declares an **AgentContract** specifying its required/optional inputs and guaranteed output keys. The base class validates contracts at dispatch time, returning clear error messages when required inputs are missing.

| Agent | Purpose | Uses LLM? |
|-------|---------|-----------|
| orchestrator | LLM-powered intent parsing, session context management, execution planning | Yes |
| file_detection | Magic bytes + extension-based file type detection | No |
| tabular_processor | CSV, XLSX, Parquet, TSV, ODS parsing | No |
| document_processor | PDF, DOCX, PPTX, TXT, HTML text extraction | No |
| database_importer | SQLite, DuckDB, SQL dump importing | No |
| media_processor | Image metadata + thumbnail generation | No |
| archive_processor | ZIP, TAR, GZIP extraction (safe) | No |
| structured_data | JSON, XML, YAML, TOML, INI parsing | No |
| specialized_format | GeoJSON, Shapefile, HDF5, NetCDF | No |
| schema_inference | Column type inference + quality scoring | Yes |
| relationship_mining | Foreign key + joinable column discovery | Yes |
| storage_router | Route data to SQLite/DuckDB/filesystem | No |
| analytics | Statistical analysis + anomaly detection | Yes |
| visualization | ECharts config generation | Yes |
| sql_agent | Natural language → SQL generation + execution | Yes |
| document_qa | RAG-based Q&A over documents | Yes |
| cross_modal | Cross-format queries | Yes |
| export_agent | Data export (CSV, JSON, Markdown) | No |
| validation_security | File security validation + integrity hashing | No |
| scheduler | Recurring task execution with background asyncio loops | No |

### Infrastructure

- **Message Bus** — Async pub/sub with priority queuing, TTL enforcement, and a dead letter queue for undeliverable/expired messages
- **Circuit Breaker** — Per-agent fault tolerance (5 failures → open → 60s recovery)
- **Token Budget Manager** — Per-agent and global token limits (rolling 1-hour window)
- **Agent Registry** — Central registration with capability-based discovery, per-agent execution metrics (call counts, avg/p95 latency, success rate, timeout tracking), and configurable dispatch timeouts
- **Context Store** — Per-session workspace state (tables, relationships, file catalog) shared across agents through the orchestrator pipeline
- **Agent Contracts** — Declarative input/output schemas on each agent for pipeline validation and introspection

## Project Structure

```
data-ruler/
├── apps/
│   ├── web/                        # Next.js frontend + BFF API
│   │   ├── app/                    # Pages (auth, dashboard, files, notes, settings)
│   │   ├── app/api/                # 25+ API routes
│   │   ├── components/             # 30+ UI components (shadcn/ui based)
│   │   ├── stores/                 # 5 Zustand stores (auth, chat, files, dashboard, notes)
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
├── docker-compose.yml              # Cloud-only (no local Ollama)
├── start.sh                        # One-command startup
└── .env.example                    # Configuration template
```

## License

See LICENSE file.
