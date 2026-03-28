#!/usr/bin/env bash
set -e

echo "=== Data Ruler - Starting Services ==="

# Check for .env
if [ ! -f .env ]; then
  echo "No .env file found. Copying from .env.example..."
  cp .env.example .env
  echo "IMPORTANT: Edit .env and add at least one API key:"
  echo "  - GROQ_API_KEY          (free: https://console.groq.com/keys)"
  echo "  - OLLAMA_CLOUD_API_KEY  (Ollama Cloud instance)"
  echo ""
fi

# Create data directories
mkdir -p data/databases data/uploads data/vectors data/thumbnails data/exports data/transcriptions

# Check if running with Docker
if command -v docker &> /dev/null && [ "$1" = "docker" ]; then
  echo "Starting with Docker Compose..."
  docker compose up --build -d
  echo "Services started!"
  echo "  Web UI:      http://localhost:3000"
  echo "  AI Service:  http://localhost:8000"
  echo "  Health:      http://localhost:8000/health"
  exit 0
fi

# Manual start
echo "Starting services manually..."
echo ""

# Start AI service
echo "[1/2] Starting AI service on port 8000..."
cd apps/ai-service
if [ ! -d ".venv" ]; then
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
else
  source .venv/bin/activate
fi
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
AI_PID=$!
cd ../..

# Start web app
echo "[2/2] Starting web app on port 3000..."
cd apps/web
if [ ! -d "node_modules" ]; then
  npm install --legacy-peer-deps
fi
npm run dev &
WEB_PID=$!
cd ../..

echo ""
echo "=== Data Ruler is running! ==="
echo "  Web UI:      http://localhost:3000"
echo "  AI Service:  http://localhost:8000"
echo "  Health:      http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $AI_PID $WEB_PID 2>/dev/null; exit 0" INT TERM
wait
