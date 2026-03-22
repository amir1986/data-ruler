#!/bin/bash
# Deploy Data Ruler with version hash + datetime stamped into the UI
set -e

GIT_HASH=$(git rev-parse --short HEAD)
BUILD_TIME=$(date '+%Y-%m-%d %H:%M')
export BUILD_VERSION="v${GIT_HASH} | ${BUILD_TIME}"

echo "Deploying: ${BUILD_VERSION}"
docker compose up --build -d "$@"
echo "Deploy complete: ${BUILD_VERSION}"
