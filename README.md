# DataRuler - AI-Powered Data Management Platform

A self-hosted, zero-cost, AI-powered data management and analytics platform. Upload any file type, get automatic processing, interactive dashboards, and chat with an AI assistant that understands your data.

## Features

- **Universal File Upload** - Drag & drop any file: CSV, Excel, PDF, JSON, databases, images, audio, video, archives, and 100+ more formats
- **Automatic Processing** - Files are detected, parsed, profiled, and stored in the optimal database engine
- **Smart Dashboards** - Auto-generated charts and insights, plus a drag-and-drop dashboard builder
- **AI Chat Assistant** - Ask questions about your data in natural language; get SQL queries, charts, and answers
- **Multi-Agent Architecture** - 18+ specialized AI agents handle detection, parsing, analytics, SQL, RAG, and more
- **File Manager** - Visual file browser with thumbnails, tags, search, and database/archive browsing
- **Notes System** - Markdown notes with auto-save, linked to files or standalone
- **Export** - Export data as CSV, JSON, XLSX, PDF reports
- **Privacy First** - All data stays on your server. LLM inference via Ollama (self-hosted or cloud)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React 18, Tailwind CSS, shadcn/ui |
| Charts | Apache ECharts |
| State | Zustand |
| Backend API | Next.js API Routes |
| AI Service | Python FastAPI |
| Database | SQLite (catalog + user data), DuckDB (OLAP analytics) |
| Vector Store | ChromaDB |
| AI Runtime | Ollama (cloud-hosted or self-hosted) |
| Media | FFmpeg, Tesseract OCR, Whisper |

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Ollama (running locally or cloud-hosted)

### Development Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd data-ruler

# 2. Set up the frontend
cd apps/web
cp ../../.env.example .env.local
npm install
npm run dev

# 3. Set up the AI service (new terminal)
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 4. Start Ollama (new terminal)
ollama serve
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
```

### Docker Setup

```bash
docker-compose up -d
```

Open http://localhost:3000 and create an account to get started.

## Environment Variables

See `.env.example` for all configuration options.

Key variables:
- `OLLAMA_BASE_URL` - URL of your Ollama instance (default: http://localhost:11434)
- `OLLAMA_MODEL` - Primary LLM model (default: qwen2.5:7b)
- `NEXTAUTH_SECRET` - JWT secret for authentication

## Project Structure

```
data-ruler/
├── apps/
│   ├── web/                    # Next.js frontend + API routes
│   │   ├── app/                # Pages and API routes
│   │   ├── components/         # UI components
│   │   ├── stores/             # Zustand state stores
│   │   └── lib/                # Utilities, DB, auth
│   │
│   └── ai-service/             # Python FastAPI AI backend
│       ├── agents/             # 18+ specialized AI agents
│       ├── core/               # Agent base, message bus, circuit breaker
│       ├── services/           # Ollama, RAG, embeddings, parsers
│       ├── routers/            # FastAPI endpoints
│       └── models/             # Pydantic schemas
│
├── data/                       # Runtime data (gitignored)
├── docker-compose.yml
└── .env.example
```

## Architecture

The platform uses a multi-agent architecture where specialized agents handle different aspects of data processing:

1. **Orchestrator** - Routes requests to appropriate agents
2. **File Detection** - Identifies file types via magic bytes + content analysis
3. **Tabular Processing** - CSV, Excel, Parquet parsing via Polars
4. **Document Processing** - PDF, DOCX, PPTX extraction
5. **Database Import** - SQLite, SQL dumps, Access databases
6. **Schema Inference** - Column types, quality profiling, PII detection
7. **Storage Router** - Routes data to SQLite, DuckDB, or vector store
8. **SQL Agent** - Natural language to SQL translation
9. **Analytics** - Statistical insights and anomaly detection
10. **Visualization** - Auto-selects chart types and generates configs
11. **Document Q&A (RAG)** - Semantic search over documents
12. **Cross-Modal Synthesis** - Combines insights across data types

Agents communicate via a structured message bus with priority queuing, circuit breakers, and retry logic.

## License

See LICENSE file.
