#!/bin/bash
# Deploy Data Ruler with version hash + datetime stamped into the UI
set -e

# Check .env
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy from .env.example first:"
  echo "  cp .env.example .env"
  exit 1
fi

# Check Docker
if ! command -v docker &>/dev/null; then
  echo "ERROR: Docker is not installed. Run setup-oracle.sh first."
  exit 1
fi

GIT_HASH=$(git rev-parse --short HEAD)
BUILD_TIME=$(date '+%Y-%m-%d %H:%M')
export BUILD_VERSION="v${GIT_HASH} | ${BUILD_TIME}"

echo "Deploying: ${BUILD_VERSION}"

# Use production overlay if DOMAIN is configured
DOMAIN=$(grep -E '^DOMAIN=' .env 2>/dev/null | cut -d= -f2 | tr -d ' "'"'"'')
if [ -n "$DOMAIN" ] && [ "$DOMAIN" != "your-domain.com" ] && [ -f docker-compose.prod.yml ]; then
  echo "Production mode: HTTPS via Caddy for ${DOMAIN}"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d "$@"
else
  echo "Development mode: http://localhost:3000"
  docker compose up --build -d "$@"
fi

echo "Deploy complete: ${BUILD_VERSION}"
