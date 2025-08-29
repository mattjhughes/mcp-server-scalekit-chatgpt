#!/usr/bin/env bash
set -euo pipefail

# Build and push split apps (auth + server) to Azure Container Registry (ACR)
# Usage:
#   ./scripts/build-and-push-acr-split.sh <acrName> <authRepoName> <serverRepoName> [tag]
# Example:
#   ./scripts/build-and-push-acr-split.sh csuaidevacr mcp-auth-scalekit mcp-server-scalekit latest
# Resulting images:
#   csuaidevacr.azurecr.io/mcp-auth-scalekit:latest
#   csuaidevacr.azurecr.io/mcp-server-scalekit:latest

if [[ ${1:-} == "-h" || ${1:-} == "--help" || $# -lt 3 ]]; then
  echo "Usage: $0 <acrName> <authRepoName> <serverRepoName> [tag]"
  echo "Example: $0 csuaidevacr mcp-auth-proxy mcp-server-scalekit latest"
  exit 1
fi

ACR_NAME="$1"
AUTH_REPO="$2"
SERVER_REPO="$3"
TAG="${4:-latest}"

AUTH_IMAGE_REF="${ACR_NAME}.azurecr.io/${AUTH_REPO}:${TAG}"
SERVER_IMAGE_REF="${ACR_NAME}.azurecr.io/${SERVER_REPO}:${TAG}"

# Ensure Azure login
if ! az account show >/dev/null 2>&1; then
  echo "Not logged into Azure. Run: az login"
  exit 1
fi

# Ensure ACR login
if ! az acr login -n "${ACR_NAME}" >/dev/null 2>&1; then
  echo "Failed to login to ACR ${ACR_NAME}. Try: az acr login -n ${ACR_NAME}"
  exit 1
fi

# Ensure buildx is ready
if ! docker buildx ls >/dev/null 2>&1; then
  echo "Docker Buildx not available. Update Docker Desktop or install buildx."
  exit 1
fi

# Optional: create/use a builder named 'multiarch' for multi-platform builds
if ! docker buildx inspect multiarch >/dev/null 2>&1; then
  docker buildx create --name multiarch --use >/dev/null
else
  docker buildx use multiarch >/dev/null
fi

echo "Building and pushing AUTH image ${AUTH_IMAGE_REF} for linux/amd64,linux/arm64..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${AUTH_IMAGE_REF}" \
  -f Dockerfile.auth \
  --push \
  .

echo "Building and pushing SERVER image ${SERVER_IMAGE_REF} for linux/amd64,linux/arm64..."
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${SERVER_IMAGE_REF}" \
  -f Dockerfile.server \
  --push \
  .

echo "Done. Pushed:\n  ${AUTH_IMAGE_REF}\n  ${SERVER_IMAGE_REF}"
