# Quickstart Guide

Go from zero to running in 5 steps.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- A free API key from one of:
  - [Groq](https://console.groq.com/keys) (recommended — fastest)
  - [OpenRouter](https://openrouter.ai/keys)
  - [HuggingFace](https://huggingface.co/settings/tokens)
  - [Ollama](https://ollama.com/) Cloud (remote Ollama instance with API key)

## Steps

### 1. Clone and enter the project

```bash
git clone <repo-url>
cd data-ruler
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and paste your API key into the matching variable:

```
GROQ_API_KEY=gsk_your_key_here
```

### 3. Start the services

```bash
docker compose up --build -d
```

This starts two containers:
- **Web UI** on port 3000 (Next.js)
- **AI Service** on port 8000 (FastAPI)

### 4. Create your account

Open [http://localhost:3000](http://localhost:3000) and click **Register** to create an account.

### 5. Upload data and explore

- **Files** — Drag and drop any file (CSV, Excel, PDF, JSON, images, etc.)
- **Dashboards** — Auto-generated charts from your data
- **Chat** — Ask questions about your data in plain language
- **Reports** — Generate AI-powered reports from templates
- **Notes** — Write markdown notes linked to your files

## Running Without Docker

Requires Node.js 20+ and Python 3.12+.

```bash
./start.sh
```

This creates a Python venv, installs dependencies, and starts both services.

## Stopping

```bash
# Docker
docker compose down

# Manual
# Press Ctrl+C in the terminal running start.sh
```

## Deploying to Production

1. Set a strong `NEXTAUTH_SECRET` in `.env`
2. Set `NEXTAUTH_URL=https://yourdomain.com`
3. Put a reverse proxy (e.g., [Caddy](https://caddyserver.com/) or Nginx) in front of port 3000 for HTTPS
4. Point your domain's DNS A record to your server IP
5. Run `docker compose up -d`

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Containers won't start | Run `docker compose logs` to check errors |
| AI features not working | Verify your API key is set in `.env` |
| Port 3000 in use | Stop the other service or change the port in `docker-compose.yml` |
| Health check | Visit [http://localhost:8000/health](http://localhost:8000/health) to verify the AI service |
