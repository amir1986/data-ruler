#!/bin/bash
# =============================================================================
# Deploy Data Ruler
# Usage:
#   ./deploy.sh          — Local development (no HTTPS)
#   ./deploy.sh prod     — Production with Caddy HTTPS (Oracle Cloud)
# =============================================================================
set -e

GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
BUILD_TIME=$(date '+%Y-%m-%d %H:%M')
export BUILD_VERSION="v${GIT_HASH} | ${BUILD_TIME}"

# Check .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example — edit it before deploying."
  echo "  nano .env"
  exit 1
fi

if [ "$1" = "prod" ]; then
  echo "Deploying PRODUCTION: ${BUILD_VERSION}"
  echo "  Caddy HTTPS reverse proxy enabled"
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d "$@"
  echo ""
  echo "Deploy complete: ${BUILD_VERSION}"
  echo "Your app is live at https://$(grep '^DOMAIN=' .env | cut -d= -f2)"
else
  echo "Deploying LOCAL: ${BUILD_VERSION}"
  docker compose up --build -d "$@"
  echo ""
  echo "Deploy complete: ${BUILD_VERSION}"
  echo "Open http://localhost:3000"
fi
