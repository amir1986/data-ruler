# Quickstart Guide

Go from zero to running in 5 steps.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose installed
- An [Ollama Cloud](https://ollama.com/) API key (remote Ollama instance)

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

Open `.env` and paste your Ollama Cloud API key:

```
OLLAMA_CLOUD_API_KEY=your-key-here
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

## Deploying to Production (Oracle Cloud, Free)

1. Run `./setup-oracle.sh` on your Oracle Cloud VM to install Docker and open firewall ports
2. Clone this repo, then `cp .env.example .env`
3. Set a strong `NEXTAUTH_SECRET` (run: `openssl rand -base64 32`)
4. Set `NEXTAUTH_URL=https://yourdomain.com`
5. Set `DOMAIN=yourdomain.com` and `OLLAMA_CLOUD_API_KEY` in `.env`
6. Run `./deploy.sh` (auto-detects production mode when DOMAIN is set)

See [README.md](README.md) for full Oracle Cloud setup instructions.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Containers won't start | Run `docker compose logs` to check errors |
| AI features not working | Verify `OLLAMA_CLOUD_API_KEY` is set in `.env` |
| Port 3000 in use | Stop the other service or change the port in `docker-compose.yml` |
| Health check | Visit [http://localhost:8000/health](http://localhost:8000/health) to verify the AI service |
